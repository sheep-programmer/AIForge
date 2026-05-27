"""本地兜底：服务端不可达时使用的纯 SQLite + 关键词检索。

* 缓存表 ``skills`` 存放 server 同步下来的 skill 快照。
* :class:`SimpleSearcher` 做一个朴素的 BM25-lite 排序：term-frequency
  加上文档长度惩罚。零三方依赖，足够在兜底场景下挑出合理结果。
"""

from __future__ import annotations

import math
import re
import sqlite3
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

from client import Recommendation, RecommendResponse


# 简单的英文 / 中文混合分词：拉丁词原样，CJK 单字逐个切。
_TOKEN_RE = re.compile(r"[A-Za-z0-9_]+|[一-鿿]")

# 极简 stopwords，避免高频虚词主导排序
_STOPWORDS: frozenset[str] = frozenset(
    {
        "the", "a", "an", "and", "or", "but", "if", "then", "of", "to", "in",
        "on", "for", "with", "by", "is", "are", "was", "were", "be", "been",
        "this", "that", "it", "as", "at", "from", "你", "我", "他", "她", "它",
        "的", "了", "和", "是", "在", "也", "都", "把", "被", "有", "无",
    }
)


def _tokenize(text: str) -> list[str]:
    """轻量分词：小写化、丢弃 stopwords。"""
    if not text:
        return []
    tokens = [t.lower() for t in _TOKEN_RE.findall(text)]
    return [t for t in tokens if t not in _STOPWORDS]


@dataclass(slots=True)
class CachedSkill:
    """本地缓存里的 skill 行。"""

    id: str
    name: str
    description: str
    body: str
    source_url: str
    tokens: int


SCHEMA = """
CREATE TABLE IF NOT EXISTS skills (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    body        TEXT NOT NULL DEFAULT '',
    source_url  TEXT NOT NULL DEFAULT '',
    tokens      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_skills_name ON skills(name);
"""


def _connect(db_path: Path) -> sqlite3.Connection:
    """打开 SQLite 连接并确保 schema 就绪。"""
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    return conn


def upsert_skills(db_path: Path, rows: Iterable[dict[str, Any]]) -> int:
    """覆盖式写入 skill 快照，返回写入条数。"""
    rows_list = list(rows)
    with _connect(db_path) as conn:
        # 用事务一把批量替换
        conn.execute("DELETE FROM skills")
        conn.executemany(
            """
            INSERT INTO skills (id, name, description, body, source_url, tokens)
            VALUES (:id, :name, :description, :body, :source_url, :tokens)
            """,
            [_normalize_row(r) for r in rows_list],
        )
        conn.commit()
    return len(rows_list)


def _normalize_row(raw: dict[str, Any]) -> dict[str, Any]:
    """容错地把 server 返回的 skill 字段映射到本地 schema。"""
    return {
        "id": str(raw.get("id") or raw.get("skill_id") or ""),
        "name": str(raw.get("name") or ""),
        "description": str(raw.get("description") or ""),
        "body": str(raw.get("body") or ""),
        "source_url": str(raw.get("source_url") or ""),
        "tokens": int(raw.get("tokens") or raw.get("body_tokens") or 0),
    }


def count_skills(db_path: Path) -> int:
    """返回本地缓存中的 skill 总数；DB 不存在则 0。"""
    if not db_path.exists():
        return 0
    with _connect(db_path) as conn:
        row = conn.execute("SELECT COUNT(*) FROM skills").fetchone()
        return int(row[0]) if row else 0


def load_all(db_path: Path) -> list[CachedSkill]:
    """加载所有缓存 skill 到内存。规模 < 1 万时完全可接受。"""
    if not db_path.exists():
        return []
    with _connect(db_path) as conn:
        rows = conn.execute(
            "SELECT id, name, description, body, source_url, tokens FROM skills"
        ).fetchall()
    return [
        CachedSkill(
            id=r["id"],
            name=r["name"],
            description=r["description"],
            body=r["body"],
            source_url=r["source_url"],
            tokens=int(r["tokens"] or 0),
        )
        for r in rows
    ]


class SimpleSearcher:
    """简易 BM25-lite 排序器。

    评分公式：``sum(tf * idf) / (1 + length_penalty)``，其中
    * ``tf`` = 词在 (name + description + body 前 2000 字符) 中的出现次数；
    * ``idf`` = ``log((N - df + 0.5) / (df + 0.5) + 1)``；
    * 名称和描述里命中的词额外加权 3x / 2x。

    评分质量虽不及向量召回 + LLM rerank，但作为服务端宕机时的兜底已经够用。
    """

    def __init__(self, skills: list[CachedSkill]) -> None:
        self.skills = skills
        # 预分词缓存：减少 search 时的重复工作
        self._tokens_name: list[list[str]] = []
        self._tokens_desc: list[list[str]] = []
        self._tokens_body: list[list[str]] = []
        df: Counter[str] = Counter()
        for s in skills:
            t_name = _tokenize(s.name)
            t_desc = _tokenize(s.description)
            # body 截断，避免长尾文档拉低查询性能
            t_body = _tokenize(s.body[:2000])
            self._tokens_name.append(t_name)
            self._tokens_desc.append(t_desc)
            self._tokens_body.append(t_body)
            for tok in set(t_name + t_desc + t_body):
                df[tok] += 1
        self._df = df
        self._n_docs = max(len(skills), 1)

    def _idf(self, term: str) -> float:
        """逆文档频率（BM25 公式简化）。"""
        df = self._df.get(term, 0)
        return math.log((self._n_docs - df + 0.5) / (df + 0.5) + 1.0)

    def search(self, query: str, top_k: int = 3) -> list[tuple[CachedSkill, float]]:
        """返回 ``(skill, score)`` 列表，按分数倒序，至多 ``top_k`` 条。"""
        q_terms = _tokenize(query)
        if not q_terms or not self.skills:
            return []

        scored: list[tuple[CachedSkill, float]] = []
        for idx, skill in enumerate(self.skills):
            score = 0.0
            name_counter = Counter(self._tokens_name[idx])
            desc_counter = Counter(self._tokens_desc[idx])
            body_counter = Counter(self._tokens_body[idx])
            length_penalty = math.log(
                1.0 + len(self._tokens_body[idx]) / 200.0
            )
            for term in q_terms:
                tf = (
                    3.0 * name_counter.get(term, 0)
                    + 2.0 * desc_counter.get(term, 0)
                    + 1.0 * body_counter.get(term, 0)
                )
                if tf <= 0:
                    continue
                score += tf * self._idf(term)
            if score <= 0:
                continue
            scored.append((skill, score / (1.0 + length_penalty)))

        scored.sort(key=lambda item: item[1], reverse=True)
        return scored[:top_k]


def recommend_local(
    db_path: Path, prompt: str, top_k: int = 3, max_tokens: int = 4000
) -> RecommendResponse:
    """对外暴露的兜底入口，签名贴近 :meth:`AIForgeClient.recommend`。"""
    skills = load_all(db_path)
    searcher = SimpleSearcher(skills)
    hits = searcher.search(prompt, top_k=top_k)

    recs: list[Recommendation] = []
    budget = max_tokens
    for skill, score in hits:
        # 简单的 token 预算控制：超出时截断 body
        body = skill.body
        approx_tokens = skill.tokens or max(1, len(body) // 4)
        if approx_tokens > budget and budget > 200:
            # 粗暴按字符截断到 ~budget tokens（每 token 约 4 字符）
            keep = max(budget * 4, 800)
            body = body[:keep] + "\n\n[...截断，请通过 /v1/skills/{id} 获取完整内容]"
            approx_tokens = budget
        budget = max(0, budget - approx_tokens)
        recs.append(
            Recommendation(
                skill_id=skill.id,
                name=skill.name,
                description=skill.description,
                body=body,
                score=score,
                source_url=skill.source_url,
                rerank_reason="本地兜底关键词命中",
                tokens=approx_tokens,
            )
        )

    return RecommendResponse(
        recommendations=recs,
        candidates_considered=len(skills),
        fallback_used=True,
    )
