"""第三阶段：小 LLM 重排。

把去重后的候选 + 原 prompt 喂给一个便宜的 LLM，让它给每条候选打分 + 写一句
中文 ``rerank_reason``。支持三种后端，由 ``settings.reranker`` 切换：

- ``ollama``  → POST ``{ollama_host}/api/chat``
- ``haiku``   → anthropic SDK，``claude-haiku-4-5-20251001``
- ``none``    → pass-through，直接按 embedding 相似度排序

设计上 ``rerank()`` 即使后端抛错也不会崩溃 —— 调用方据 ``RerankOutcome.fallback``
决定是否给响应打 ``fallback_used=True``。
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

import httpx
import structlog

from aiforge.config import Settings, get_settings
from aiforge.core.models import Skill

if TYPE_CHECKING:
    pass

logger = structlog.get_logger(__name__)


# 不同后端的超时（秒）
_OLLAMA_TIMEOUT = 3.0
_HAIKU_TIMEOUT = 5.0

# Haiku 模型 ID —— 与 Anthropic SDK 兼容的最便宜模型
_HAIKU_MODEL = "claude-haiku-4-5-20251001"

# 评分必须落在 [0, 100]，越界的输出会被裁剪
_SCORE_MIN, _SCORE_MAX = 0.0, 100.0


@dataclass
class RerankItem:
    """对外结果三元组。``score`` 已归一到 [0, 1]。"""

    skill: Skill
    score: float
    reason: str


@dataclass
class RerankOutcome:
    items: list[RerankItem]
    fallback: bool  # True ⇒ LLM 调用失败，items 是 embedding-only 排序


# ---------- Prompt 模板 ----------

_SYSTEM_PROMPT = (
    "你是一个 skill 路由器的排序助手。"
    "用户向 AI 编程 agent 提了一个问题，你需要从候选 skill 列表里挑出最有帮助的几条。"
    "请严格输出 JSON，不要任何 Markdown 代码块包裹，不要解释。"
)

_USER_PROMPT_TEMPLATE = """用户的问题：
\"\"\"
{prompt}
\"\"\"

候选 skill（共 {n} 条，按相似度初排）：
{candidates_block}

请为每条候选打 0-100 分（100 = 极度相关，0 = 完全无关），并给一句不超过 30 字的中文理由。
按相关度从高到低排序，只返回前 {top_k} 条。

返回这个 JSON 结构：
{{
  "ranking": [
    {{"index": <候选编号，从 1 开始>, "score": <0-100 整数>, "reason": "<中文理由>"}}
  ]
}}
"""


def _format_candidates(candidates: list[tuple[Skill, float]]) -> str:
    """把候选格式化成 LLM 易读的块。控制每条 ≤ 200 字符避免爆 token。"""
    lines: list[str] = []
    for i, (skill, sim) in enumerate(candidates, start=1):
        desc = skill.description.strip().replace("\n", " ")
        if len(desc) > 160:
            desc = desc[:157] + "..."
        lines.append(f"[{i}] name={skill.name} | sim={sim:.2f} | desc={desc}")
    return "\n".join(lines)


def _build_messages(
    prompt: str,
    candidates: list[tuple[Skill, float]],
    top_k: int,
) -> tuple[str, str]:
    """返回 (system, user) 两段消息文本。"""
    user = _USER_PROMPT_TEMPLATE.format(
        prompt=prompt.strip()[:2000],  # prompt 也要截断，防 LLM 输入炸
        n=len(candidates),
        candidates_block=_format_candidates(candidates),
        top_k=top_k,
    )
    return _SYSTEM_PROMPT, user


# ---------- JSON 解析 ----------

_JSON_BLOCK_RE = re.compile(r"\{.*\}", re.DOTALL)


def _parse_ranking(raw: str) -> list[dict[str, Any]]:
    """从 LLM 原始输出里抠出 ranking 列表。

    小模型经常会带点前后文废话或代码块标记，这里宽松解析：
    先尝试整体 ``json.loads``，失败则正则抓第一个 ``{...}``。
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
        if isinstance(parsed, dict) and isinstance(parsed.get("ranking"), list):
            return [x for x in parsed["ranking"] if isinstance(x, dict)]
    raise ValueError("reranker 输出无法解析为 JSON")


def _apply_ranking(
    candidates: list[tuple[Skill, float]],
    ranking: list[dict[str, Any]],
    top_k: int,
) -> list[RerankItem]:
    """把 LLM ranking 投影回 Skill 对象。容错：跳过越界/重复 index。"""
    seen: set[int] = set()
    out: list[RerankItem] = []
    for entry in ranking:
        raw_idx = entry.get("index")
        if not isinstance(raw_idx, int):
            continue
        idx = raw_idx - 1  # LLM 用 1-based
        if idx < 0 or idx >= len(candidates) or idx in seen:
            continue
        seen.add(idx)

        score_raw = entry.get("score", 0)
        try:
            score_val = float(score_raw)
        except (TypeError, ValueError):
            score_val = 0.0
        score_val = max(_SCORE_MIN, min(_SCORE_MAX, score_val)) / _SCORE_MAX

        reason = str(entry.get("reason", "")).strip()
        if len(reason) > 120:
            reason = reason[:117] + "..."

        skill, _sim = candidates[idx]
        out.append(RerankItem(skill=skill, score=score_val, reason=reason))
        if len(out) >= top_k:
            break

    return out


# ---------- 后端调用 ----------


def _call_ollama(system: str, user: str, settings: Settings) -> str:
    """同步调用 Ollama /api/chat，返回模型完整文本输出。"""
    payload = {
        "model": settings.reranker_model,
        "stream": False,
        "format": "json",  # Ollama 0.1.30+ 支持强制 JSON 输出
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "options": {"temperature": 0.0, "num_predict": 512},
    }
    with httpx.Client(timeout=_OLLAMA_TIMEOUT) as client:
        resp = client.post(f"{settings.ollama_host}/api/chat", json=payload)
        resp.raise_for_status()
        data = resp.json()
    # Ollama chat 响应在 message.content
    msg = data.get("message", {}).get("content")
    if not isinstance(msg, str):
        raise ValueError(f"ollama 返回结构异常: {data!r}")
    return msg


def _call_haiku(system: str, user: str, settings: Settings) -> str:
    """调用 Anthropic Haiku。要求 ``anthropic_api_key`` 已配置。"""
    if not settings.anthropic_api_key:
        raise RuntimeError("reranker=haiku 但未配置 AIFORGE_ANTHROPIC_API_KEY")

    # 延迟导入：用户没装 anthropic SDK 也能跑 ollama 后端
    from anthropic import Anthropic

    client = Anthropic(api_key=settings.anthropic_api_key, timeout=_HAIKU_TIMEOUT)
    msg = client.messages.create(
        model=_HAIKU_MODEL,
        max_tokens=1024,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    # content 是一个 block 列表，取第一个 text block
    for block in msg.content:
        if getattr(block, "type", None) == "text":
            text_val = getattr(block, "text", None)
            if isinstance(text_val, str):
                return text_val
    raise ValueError("haiku 返回内容里没有 text block")


# ---------- 主入口 ----------


def _embedding_fallback(
    candidates: list[tuple[Skill, float]],
    top_k: int,
) -> list[RerankItem]:
    """LLM 不可用时的兜底：直接按 embedding 相似度排序。"""
    sorted_c = sorted(candidates, key=lambda x: x[1], reverse=True)[:top_k]
    return [
        RerankItem(
            skill=skill,
            score=sim,
            reason="embedding-only 排序（reranker 不可用）",
        )
        for skill, sim in sorted_c
    ]


def rerank(
    prompt: str,
    candidates: list[tuple[Skill, float]],
    top_k: int,
    settings: Settings | None = None,
) -> RerankOutcome:
    """对候选做小 LLM 重排。

    Args:
        prompt: 原始用户 prompt
        candidates: 去重后的 ``[(Skill, similarity), ...]``，按 similarity 降序
        top_k: 最终保留条数
        settings: 注入测试用，None 则取全局 Settings

    Returns:
        ``RerankOutcome``。即使后端失败也会返回 embedding-only 兜底结果，
        外层据 ``fallback`` 字段判断是否在响应里标 ``fallback_used``。
    """
    s = settings or get_settings()

    if not candidates:
        return RerankOutcome(items=[], fallback=False)

    if s.reranker == "none":
        return RerankOutcome(items=_embedding_fallback(candidates, top_k), fallback=False)

    system, user = _build_messages(prompt, candidates, top_k)

    try:
        if s.reranker == "ollama":
            raw = _call_ollama(system, user, s)
        elif s.reranker == "haiku":
            raw = _call_haiku(system, user, s)
        else:  # 防御：Literal 已经卡过，但留个 explicit 分支
            raise RuntimeError(f"未知 reranker 后端: {s.reranker}")

        ranking = _parse_ranking(raw)
        items = _apply_ranking(candidates, ranking, top_k)
        if not items:
            # LLM 没返回任何有效条目，等同失败
            raise ValueError("reranker 输出为空")
        logger.info(
            "reranker.ok",
            backend=s.reranker,
            input_n=len(candidates),
            output_n=len(items),
        )
        return RerankOutcome(items=items, fallback=False)

    except (
        httpx.HTTPError,
        httpx.TimeoutException,
        ValueError,
        RuntimeError,
        json.JSONDecodeError,
        Exception,  # anthropic.APIError 等多种异常，统一兜底
    ) as exc:
        logger.warning(
            "reranker.fallback",
            backend=s.reranker,
            error=str(exc)[:200],
            error_type=type(exc).__name__,
        )
        return RerankOutcome(
            items=_embedding_fallback(candidates, top_k),
            fallback=True,
        )
