"""完整推荐管线 —— ``recommend()`` 单入口。

把 embedder / retriever / deduper / reranker 串起来，加上 token 预算裁剪
和审计日志。这是 ``POST /v1/recommend`` 实际调用的函数。
"""

from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from typing import TYPE_CHECKING

import structlog
import ulid
from sqlalchemy import update

from aiforge.config import Settings, get_settings
from aiforge.core.models import RecommendationLog, Skill
from aiforge.core.schemas import Recommendation, RecommendResponse
from aiforge.recommender.deduper import dedup
from aiforge.recommender.embedder import get_embedder
from aiforge.recommender.reranker import RerankItem, rerank
from aiforge.recommender.retriever import retrieve

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

logger = structlog.get_logger(__name__)


def _new_request_id() -> str:
    """ULID with ``req_`` 前缀，方便日志检索。"""
    return f"req_{ulid.new().str}"  # type: ignore[no-untyped-call]


def _fit_token_budget(
    items: list[RerankItem],
    max_tokens: int,
) -> list[RerankItem]:
    """贪心从高分到低分加入，超预算就停；至少保留 1 条。

    第一条即使超预算也必须返回（让 agent 至少看到一个 skill），交给客户端的
    body 截断逻辑去处理。这里假设 ``items`` 已按分数降序。
    """
    if not items:
        return []

    out: list[RerankItem] = []
    used = 0
    for item in items:
        tokens = max(1, item.skill.body_tokens)
        if not out:
            # 至少装一个
            out.append(item)
            used = tokens
            continue
        if used + tokens > max_tokens:
            break
        out.append(item)
        used += tokens

    return out


def _to_recommendation(item: RerankItem) -> Recommendation:
    skill = item.skill
    return Recommendation(
        skill_id=skill.id,
        name=skill.name,
        description=skill.description,
        body=skill.body,
        score=round(item.score, 4),
        source_url=skill.source_url,
        rerank_reason=item.reason or None,
        tokens=skill.body_tokens,
        artifact_type=skill.artifact_type,  # type: ignore[arg-type]
        tags=sorted(a.tag_name for a in skill.tags),
        mcp_config=skill.mcp_config,
        plugin_manifest=skill.plugin_manifest,
    )


def _log_recommendation(
    session: "Session",
    *,
    request_id: str,
    prompt: str,
    agent: str | None,
    top_k: int,
    elapsed_ms: int,
    candidates_considered: int,
    fallback_used: bool,
    chosen: list[RerankItem],
) -> None:
    """写一条 RecommendationLog + 同步更新 Skill 的统计字段。"""
    log = RecommendationLog(
        id=request_id,
        prompt_preview=prompt[:500],
        agent=agent,
        top_k=top_k,
        elapsed_ms=elapsed_ms,
        candidates_considered=candidates_considered,
        fallback_used=fallback_used,
        skill_ids=json.dumps([it.skill.id for it in chosen]),
    )
    session.add(log)

    if chosen:
        now = datetime.now(timezone.utc)
        session.execute(
            update(Skill)
            .where(Skill.id.in_([it.skill.id for it in chosen]))
            .values(
                last_recommended_at=now,
                recommend_count=Skill.recommend_count + 1,
            )
        )
    session.commit()


def recommend(
    prompt: str,
    *,
    db_session: "Session",
    top_k: int | None = None,
    max_tokens: int | None = None,
    exclude_ids: list[str] | None = None,
    agent: str | None = None,
    settings: Settings | None = None,
) -> RecommendResponse:
    """端到端推荐。

    步骤：
        1. embed(prompt)
        2. vss_search → retrieve_k 个候选
        3. dedup → 聚类去重
        4. rerank → 小 LLM 排序 + 给理由
        5. token 预算裁剪
        6. 写审计日志
    """
    s = settings or get_settings()
    request_id = _new_request_id()
    started = time.perf_counter()

    actual_top_k = top_k if top_k is not None else s.top_k_default
    actual_max_tokens = max_tokens if max_tokens is not None else s.max_tokens_default
    exclude_set = set(exclude_ids or [])

    log = logger.bind(request_id=request_id, top_k=actual_top_k)

    # --- 1. embed ---
    embedder = get_embedder(s)
    query_vec = embedder.embed(prompt)

    # --- 2. retrieve ---
    retrieved = retrieve(
        db_session,
        query_vec,
        top_k=s.retrieve_k,
        exclude_ids=exclude_set,
    )
    log.info("pipeline.retrieved", n=len(retrieved))

    candidates_considered = len(retrieved)

    if not retrieved:
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        _log_recommendation(
            db_session,
            request_id=request_id,
            prompt=prompt,
            agent=agent,
            top_k=actual_top_k,
            elapsed_ms=elapsed_ms,
            candidates_considered=0,
            fallback_used=False,
            chosen=[],
        )
        return RecommendResponse(
            request_id=request_id,
            elapsed_ms=elapsed_ms,
            recommendations=[],
            candidates_considered=0,
            fallback_used=False,
        )

    # --- 3. dedup ---
    deduped = dedup(retrieved, embedder_dim=s.embedder_dim)
    log.info("pipeline.deduped", before=len(retrieved), after=len(deduped))

    # --- 4. rerank ---
    # 给 reranker 留一定缓冲（top_k * 3，最少 5），让它有挑选余地
    rerank_input_cap = max(actual_top_k * 3, 5)
    rerank_input = deduped[:rerank_input_cap]
    outcome = rerank(prompt, rerank_input, actual_top_k, settings=s)

    # --- 5. token 预算 ---
    fitted = _fit_token_budget(outcome.items, actual_max_tokens)
    log.info(
        "pipeline.fitted",
        before=len(outcome.items),
        after=len(fitted),
        max_tokens=actual_max_tokens,
    )

    # --- 6. 出参 + 日志 ---
    elapsed_ms = int((time.perf_counter() - started) * 1000)
    recommendations = [_to_recommendation(it) for it in fitted]

    _log_recommendation(
        db_session,
        request_id=request_id,
        prompt=prompt,
        agent=agent,
        top_k=actual_top_k,
        elapsed_ms=elapsed_ms,
        candidates_considered=candidates_considered,
        fallback_used=outcome.fallback,
        chosen=fitted,
    )

    log.info(
        "pipeline.done",
        elapsed_ms=elapsed_ms,
        returned=len(recommendations),
        candidates_considered=candidates_considered,
        fallback_used=outcome.fallback,
    )

    return RecommendResponse(
        request_id=request_id,
        elapsed_ms=elapsed_ms,
        recommendations=recommendations,
        candidates_considered=candidates_considered,
        fallback_used=outcome.fallback,
    )
