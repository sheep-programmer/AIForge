"""测试通用工具：确定性向量、Skill 工厂、embedder mock。"""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from typing import Any

import numpy as np

from aiforge.core.db import upsert_embedding
from aiforge.core.models import Skill


def deterministic_vec(text: str, dim: int = 384) -> np.ndarray:
    """对同样 text 永远返回同样向量；不同 text 返回不同向量。"""
    h = hashlib.sha256(text.encode("utf-8")).digest()
    rng = np.random.default_rng(int.from_bytes(h[:8], "big"))
    vec = rng.standard_normal(dim).astype(np.float32)
    # L2 归一化以匹配 sentence-transformers 默认行为
    norm = float(np.linalg.norm(vec))
    if norm > 0:
        vec = vec / norm
    return vec.astype(np.float32)


def make_skill(
    skill_id: str,
    *,
    name: str | None = None,
    description: str | None = None,
    body: str = "测试 skill 主体",
    source_url: str = "https://github.com/test/repo",
    source_path: str | None = None,
    source_repo: str = "test/repo",
    source_stars: int = 100,
    body_tokens: int = 50,
    updated_at: datetime | None = None,
    is_active: bool = True,
    is_approved: bool = True,
) -> Skill:
    """构造一个完整 Skill ORM 对象（未持久化）。"""
    return Skill(
        id=skill_id,
        name=name or skill_id,
        description=description or f"description for {skill_id}",
        body=body,
        body_tokens=body_tokens,
        source_url=source_url,
        source_path=source_path or f"skills/{skill_id}/SKILL.md",
        source_repo=source_repo,
        source_stars=source_stars,
        is_active=is_active,
        is_approved=is_approved,
        updated_at=updated_at or datetime.now(UTC),
        recommend_count=0,
    )


def seed_skill(
    session: Any,
    skill: Skill,
    embedding_text: str | None = None,
    dim: int = 384,
) -> int:
    """把 Skill 写入 DB 并同步写向量到 vss_skills。返回 rowid。"""
    if embedding_text is None:
        embedding_text = f"{skill.name} {skill.description}"
    vec = deterministic_vec(embedding_text, dim)
    session.add(skill)
    session.flush()
    rowid = session.execute(
        _text("SELECT rowid FROM skills WHERE id = :id"), {"id": skill.id}
    ).scalar_one()
    upsert_embedding(session, int(rowid), vec)
    session.commit()
    return int(rowid)


def _text(s: str) -> Any:
    from sqlalchemy import text

    return text(s)


def clean_tables(session: Any) -> None:
    """删干净 4 张业务表 + vss_skills，保证测试隔离。"""
    import contextlib

    for stmt in (
        "DELETE FROM recommendation_logs",
        "DELETE FROM ingest_jobs",
        "DELETE FROM pending_discoveries",
        "DELETE FROM vss_skills",
        "DELETE FROM skills",
    ):
        with contextlib.suppress(Exception):
            session.execute(_text(stmt))
    session.commit()


class FakeEmbedder:
    """假的 Embedder：从 text 算确定性向量，永不下载模型。"""

    def __init__(self, dim: int = 384) -> None:
        self._dim = dim

    @property
    def dim(self) -> int:
        return self._dim

    def embed(self, text: str) -> np.ndarray:
        return deterministic_vec(text, self._dim)

    def embed_batch(self, texts: list[str]) -> np.ndarray:
        if not texts:
            return np.zeros((0, self._dim), dtype=np.float32)
        return np.vstack([deterministic_vec(t, self._dim) for t in texts])


def patch_embedder(monkeypatch: Any, dim: int = 384) -> FakeEmbedder:
    """把 recommender.embedder.get_embedder 换成假 embedder。"""
    fake = FakeEmbedder(dim=dim)
    from aiforge.recommender import embedder as embedder_mod

    monkeypatch.setattr(embedder_mod, "get_embedder", lambda settings=None: fake)
    # 同时给 pipeline 模块自己的引用也打补丁
    from aiforge.recommender import pipeline as pipeline_mod

    monkeypatch.setattr(pipeline_mod, "get_embedder", lambda settings=None: fake)
    return fake
