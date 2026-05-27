"""自动打标：用小 LLM 把 artifact 归到 1-3 个候选 tag。

设计上完全独立于 ``reranker.py`` —— 客户端逻辑（``_call_ollama`` /
``_call_haiku``）从 reranker 复制而来，避免私有函数耦合与签名漂移。

主入口：

- ``auto_tag_artifact()``：单条 artifact → ``[(tag_name, confidence), ...]``。
  失败时返回空列表，**绝不抛异常**，方便批量调用方一致地降级。
- ``auto_tag_batch()``：串行批处理，配合 ``core.tags.add_artifact_tag`` 写库。

任何后端错误（超时、HTTP、JSON 解析失败）都会被吞掉并记录 warning。
"""

from __future__ import annotations

import json
import re
import time
from typing import Any

import httpx
import structlog
from sqlalchemy.orm import Session

from aiforge.config import Settings, get_settings
from aiforge.core.models import Skill
from aiforge.core.tags import add_artifact_tag

logger = structlog.get_logger(__name__)


# 单次 LLM 调用超时（秒）—— 1.5B 模型 CPU 推理也能稳定回包
_OLLAMA_TIMEOUT = 3.0
_HAIKU_TIMEOUT = 3.0

# 与 reranker 保持一致的 Haiku 模型 ID
_HAIKU_MODEL = "claude-haiku-4-5-20251001"

# Prompt 输入截断阈值 —— 控制 token 体积，提速 + 防 OOM
_DESCRIPTION_MAX = 400
_BODY_MAX = 600

# 位置默认置信度衰减表：第 N 个 tag 对应分数
_POSITION_SCORES = (1.0, 0.85, 0.7, 0.55, 0.4)


# ---------- Prompt 模板 ----------

_SYSTEM_PROMPT = (
    "你是 artifact 分类器。从给定 tag 列表中挑出 1-{N} 个最能描述 artifact 的 tag。"
    "只能从列表里选；不要发明新 tag；不要解释；严格输出 JSON，不要 Markdown 包裹。"
)

_USER_PROMPT_TEMPLATE = """可用 tag 列表（含解释）：
{tag_block}

待分类 artifact：
  name: {name}
  description: {description}
  摘要: {body}

请挑出 1-{max_tags} 个最贴切的 tag。返回如下 JSON 结构：
{{
  "tags": ["tag1", "tag2"]
}}
"""


def _format_tag_block(candidate_tags: dict[str, str]) -> str:
    """把候选 tag 字典格式化成 LLM 易读的 bullet 列表。"""
    lines: list[str] = []
    for name, desc in candidate_tags.items():
        desc_clean = (desc or "").strip().replace("\n", " ")
        lines.append(f"- {name}: {desc_clean}")
    return "\n".join(lines)


def _build_messages(
    artifact: Skill,
    candidate_tags: dict[str, str],
    max_tags: int,
) -> tuple[str, str]:
    """返回 (system, user) 两段消息文本。"""
    description = (artifact.description or "").strip().replace("\n", " ")
    if len(description) > _DESCRIPTION_MAX:
        description = description[: _DESCRIPTION_MAX - 3] + "..."

    body = (artifact.body or "").strip().replace("\n", " ")
    if len(body) > _BODY_MAX:
        body = body[: _BODY_MAX - 3] + "..."

    system = _SYSTEM_PROMPT.format(N=max_tags)
    user = _USER_PROMPT_TEMPLATE.format(
        tag_block=_format_tag_block(candidate_tags),
        name=(artifact.name or "").strip()[:128],
        description=description or "(无)",
        body=body or "(无正文)",
        max_tags=max_tags,
    )
    return system, user


# ---------- JSON 解析 ----------

_JSON_BLOCK_RE = re.compile(r"\{.*\}", re.DOTALL)


def _parse_tags(raw: str) -> list[str]:
    """从 LLM 原始输出里抠出 tag 名称列表。

    与 reranker 同套宽松策略：先整体 ``json.loads``，失败则正则抓首个 ``{...}``。
    """
    candidates_to_try = [raw.strip()]
    m = _JSON_BLOCK_RE.search(raw)
    if m:
        candidates_to_try.append(m.group(0))

    for blob in candidates_to_try:
        try:
            parsed = json.loads(blob)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict) and isinstance(parsed.get("tags"), list):
            return [str(x).strip() for x in parsed["tags"] if isinstance(x, str)]
    raise ValueError("tagger 输出无法解析为 JSON")


# ---------- 后端调用（复制自 reranker；保持独立避免耦合） ----------


def _call_ollama(system: str, user: str, settings: Settings) -> str:
    """同步调用 Ollama /api/chat，返回模型完整文本输出。"""
    payload: dict[str, Any] = {
        "model": settings.reranker_model,
        "stream": False,
        "format": "json",  # Ollama 强制 JSON 输出
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "options": {"temperature": 0.0, "num_predict": 256},
    }
    with httpx.Client(timeout=_OLLAMA_TIMEOUT) as client:
        resp = client.post(f"{settings.ollama_host}/api/chat", json=payload)
        resp.raise_for_status()
        data = resp.json()
    msg = data.get("message", {}).get("content")
    if not isinstance(msg, str):
        raise ValueError(f"ollama 返回结构异常: {data!r}")
    return msg


def _call_haiku(system: str, user: str, settings: Settings) -> str:
    """调用 Anthropic Haiku。要求 ``anthropic_api_key`` 已配置。"""
    if not settings.anthropic_api_key:
        raise RuntimeError("tagger 后端=haiku 但未配置 AIFORGE_ANTHROPIC_API_KEY")

    # 延迟导入：未装 anthropic SDK 也能跑 ollama 后端
    from anthropic import Anthropic

    client = Anthropic(api_key=settings.anthropic_api_key, timeout=_HAIKU_TIMEOUT)
    msg = client.messages.create(
        model=_HAIKU_MODEL,
        max_tokens=256,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    for block in msg.content:
        if getattr(block, "type", None) == "text":
            text_val = getattr(block, "text", None)
            if isinstance(text_val, str):
                return text_val
    raise ValueError("haiku 返回内容里没有 text block")


# ---------- 主入口 ----------


def auto_tag_artifact(
    artifact: Skill,
    candidate_tags: dict[str, str],
    max_tags: int = 3,
    settings: Settings | None = None,
) -> list[tuple[str, float]]:
    """给单条 artifact 自动选 tag。

    Args:
        artifact: 待打标 artifact（``Skill`` ORM 实例）
        candidate_tags: ``{tag_name: description}`` —— LLM 只能从其 keys 里选
        max_tags: 上限（默认 3）
        settings: 注入测试用；None 取全局

    Returns:
        ``[(tag_name, confidence_in_[0,1]), ...]``。

        任何失败（超时、HTTP 错误、JSON 解析失败、后端不可用）→ 返回空列表，
        并 log warning。**绝不向上抛异常**，调用方据空列表决定跳过。
    """
    s = settings or get_settings()

    if not candidate_tags:
        return []

    backend = s.reranker
    if backend == "none":
        # tagger 没有 embedding 兜底语义 —— 直接放弃
        logger.warning("tagger.skip_no_backend", artifact_id=artifact.id)
        return []

    system, user = _build_messages(artifact, candidate_tags, max_tags)

    try:
        if backend == "ollama":
            raw = _call_ollama(system, user, s)
        elif backend == "haiku":
            raw = _call_haiku(system, user, s)
        else:
            raise RuntimeError(f"未知 tagger 后端: {backend}")

        names = _parse_tags(raw)
    except (
        httpx.HTTPError,
        httpx.TimeoutException,
        ValueError,
        RuntimeError,
        json.JSONDecodeError,
        Exception,  # anthropic.APIError 等，统一兜底
    ) as exc:
        logger.warning(
            "tagger.failed",
            backend=backend,
            artifact_id=artifact.id,
            error=str(exc)[:200],
            error_type=type(exc).__name__,
        )
        return []

    # 校验 + 去重 + 截断
    valid_keys = set(candidate_tags.keys())
    out: list[tuple[str, float]] = []
    seen: set[str] = set()
    for name in names:
        normalized = name.strip().lower()
        if not normalized or normalized in seen:
            continue
        if normalized not in valid_keys:
            # LLM 偶尔会幻觉出列表外的 tag，安静地丢弃
            continue
        seen.add(normalized)
        pos = len(out)
        score = _POSITION_SCORES[pos] if pos < len(_POSITION_SCORES) else 0.3
        out.append((normalized, score))
        if len(out) >= max_tags:
            break

    if not out:
        logger.warning(
            "tagger.empty_after_validation",
            backend=backend,
            artifact_id=artifact.id,
            raw_count=len(names),
        )
    return out


def auto_tag_batch(
    session: Session,
    artifacts: list[Skill],
    max_tags_per_artifact: int = 3,
    settings: Settings | None = None,
    rate_limit_ms: int = 50,
) -> dict[str, list[str]]:
    """串行批量打标 + 写库。

    Args:
        session: 已经打开的 DB session（由调用方负责生命周期）
        artifacts: 待打标 artifact 列表
        max_tags_per_artifact: 每条 artifact 上限
        settings: 注入测试用
        rate_limit_ms: 调用之间的最小间隔（毫秒）—— 防 Ollama 过载

    Returns:
        ``{artifact_id: [applied tag names]}``。失败的条目映射到空列表。
    """
    from aiforge.core.models import BUILTIN_TAGS

    s = settings or get_settings()
    # 候选 tag 集合 = 当前 DB 内所有 tag 名称 → 描述。
    # 但 BUILTIN_TAGS 就是闭集且描述更全，直接用。LLM 选出来后再用 add_artifact_tag
    # 写入；该函数会按需建行（不存在时新建 ``is_builtin=False``）。
    candidate_tags = dict(BUILTIN_TAGS)

    results: dict[str, list[str]] = {}
    sleep_seconds = max(rate_limit_ms, 0) / 1000.0

    for idx, art in enumerate(artifacts):
        if idx > 0 and sleep_seconds > 0:
            time.sleep(sleep_seconds)

        picks = auto_tag_artifact(
            art,
            candidate_tags,
            max_tags=max_tags_per_artifact,
            settings=s,
        )
        applied: list[str] = []
        for tag_name, score in picks:
            try:
                add_artifact_tag(
                    session,
                    art,
                    tag_name,
                    source="auto",
                    score=score,
                )
                applied.append(tag_name)
            except Exception as exc:
                logger.warning(
                    "autotag.write_failed",
                    artifact_id=art.id,
                    tag=tag_name,
                    error=str(exc)[:200],
                )
        results[art.id] = applied
        logger.info(
            "autotag.tagged",
            artifact_id=art.id,
            tags=applied,
            picked=len(picks),
        )

    return results
