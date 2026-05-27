"""自动打标 API：``/v1/admin/autotag`` 系列端点。

- ``POST /v1/admin/autotag`` —— 触发批量任务；``background=True`` 时立即返回 job_id，
  ``background=False`` 时同步等待结果。
- ``GET  /v1/admin/autotag/{job_id}`` —— 查任务状态。

任务状态保存在进程内存里（``_jobs``）—— 重启即丢失。Phase 3 简单优先，不上 DB 表。
"""

from __future__ import annotations

import asyncio
import threading
from dataclasses import dataclass, field
from typing import Literal

import structlog
import ulid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import not_, select
from sqlalchemy.orm import Session

from aiforge.api.deps import get_db, require_api_key
from aiforge.config import get_settings
from aiforge.core.db import get_session_maker
from aiforge.core.models import ArtifactTag, Skill
from aiforge.core.schemas import AutotagRequest, AutotagResponse
from aiforge.recommender.tagger import auto_tag_batch

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/v1/admin", tags=["autotag"])


JobStatus = Literal["running", "done", "error"]


@dataclass
class AutotagJobState:
    """单个 autotag 任务的内存状态。"""

    job_id: str
    total: int = 0
    tagged: int = 0
    status: JobStatus = "running"
    error: str | None = None
    # 已应用到每个 artifact 的 tag 列表，便于调试 / 审计；不向外暴露
    applied: dict[str, list[str]] = field(default_factory=dict)


# 进程内 job 状态表。多 worker 部署下不共享 —— Phase 3 暂可接受。
_jobs: dict[str, AutotagJobState] = {}
_jobs_lock = threading.Lock()


def _save_state(state: AutotagJobState) -> None:
    """线程安全地写回 state。"""
    with _jobs_lock:
        _jobs[state.job_id] = state


def _get_state(job_id: str) -> AutotagJobState | None:
    with _jobs_lock:
        return _jobs.get(job_id)


def _select_artifacts(
    session: Session,
    artifact_ids: list[str] | None,
    only_untagged: bool,
) -> list[Skill]:
    """根据请求过滤要打标的 artifact 列表。"""
    stmt = select(Skill).where(Skill.is_active.is_(True))
    if artifact_ids:
        stmt = stmt.where(Skill.id.in_(artifact_ids))
    if only_untagged:
        # 排除已有 auto tag 的 artifact
        auto_tagged_subq = select(ArtifactTag.skill_id).where(ArtifactTag.source == "auto")
        stmt = stmt.where(not_(Skill.id.in_(auto_tagged_subq)))
    return list(session.scalars(stmt).all())


def _run_job(
    state: AutotagJobState,
    artifact_ids: list[str] | None,
    only_untagged: bool,
    max_tags_per_artifact: int,
) -> None:
    """实际跑打标的同步函数。在后台线程或 threadpool 里调用。

    用独立 session：避免与请求级 session 生命周期冲突，也方便后台线程使用。
    """
    settings = get_settings()
    session_maker = get_session_maker(settings)
    try:
        with session_maker() as session:
            artifacts = _select_artifacts(session, artifact_ids, only_untagged)
            state.total = len(artifacts)
            _save_state(state)

            logger.info(
                "autotag.start",
                job_id=state.job_id,
                total=state.total,
                only_untagged=only_untagged,
            )

            if not artifacts:
                state.status = "done"
                _save_state(state)
                return

            applied = auto_tag_batch(
                session,
                artifacts,
                max_tags_per_artifact=max_tags_per_artifact,
                settings=settings,
            )
            state.applied = applied
            state.tagged = sum(1 for v in applied.values() if v)
            state.status = "done"
            _save_state(state)

            logger.info(
                "autotag.done",
                job_id=state.job_id,
                total=state.total,
                tagged=state.tagged,
            )
    except Exception as exc:  # noqa: BLE001 — 后台任务必须吞所有异常并存到 state
        state.status = "error"
        state.error = str(exc)[:500]
        _save_state(state)
        logger.exception(
            "autotag.crashed",
            job_id=state.job_id,
            error=str(exc)[:200],
        )


def _state_to_response(state: AutotagJobState) -> AutotagResponse:
    return AutotagResponse(
        job_id=state.job_id,
        status=state.status,
        artifacts_total=state.total,
        artifacts_tagged=state.tagged,
        error=state.error,
    )


@router.post(
    "/autotag",
    response_model=AutotagResponse,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_api_key)],
)
async def create_autotag_job(
    payload: AutotagRequest,
) -> AutotagResponse:
    """触发自动打标任务。"""
    job_id = f"autotag_{ulid.new().str}"
    state = AutotagJobState(job_id=job_id)
    _save_state(state)

    if payload.background:
        # 后台异步：扔到 default executor（threadpool），不阻塞响应
        loop = asyncio.get_running_loop()
        loop.run_in_executor(
            None,
            _run_job,
            state,
            payload.artifact_ids,
            payload.only_untagged,
            payload.max_tags_per_artifact,
        )
        return _state_to_response(state)

    # 同步：在 threadpool 里跑（_run_job 是阻塞 + LLM 调用是 sync httpx）
    await asyncio.to_thread(
        _run_job,
        state,
        payload.artifact_ids,
        payload.only_untagged,
        payload.max_tags_per_artifact,
    )
    final = _get_state(job_id) or state
    return _state_to_response(final)


@router.get(
    "/autotag/{job_id}",
    response_model=AutotagResponse,
    dependencies=[Depends(require_api_key)],
)
def get_autotag_job(job_id: str) -> AutotagResponse:
    """查询任务状态。"""
    state = _get_state(job_id)
    if state is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": f"autotag job {job_id} not found", "code": "not_found"},
        )
    return _state_to_response(state)
