"""审批操作：approve / reject / list_pending。

approve 必须在同事务内同时：
  1) 把 PendingDiscovery.decision 改为 approved
  2) 创建 IngestJob 并落库
否则任一失败都回滚。
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Callable

import structlog
from sqlalchemy import select
from sqlalchemy.orm import Session

from aiforge.core.models import IngestJob, PendingDiscovery

from .scorer import score_discovery

logger = structlog.get_logger(__name__)


class DiscoveryNotFoundError(LookupError):
    """目标 discovery 不存在。"""


class DiscoveryStateError(RuntimeError):
    """目标 discovery 状态不允许此操作（如已被处理）。"""


def approve(
    discovery_id: str,
    session: Session,
    notes: str | None = None,
    *,
    ingest_factory: Callable[[str, Session], str] | None = None,
) -> str:
    """批准一个发现并触发 ingest，返回 ingest_job_id。

    `ingest_factory` 是为测试预留的注入点；默认会调用 aiforge.ingestion.ingest()。
    """
    row = _load_pending(session, discovery_id)
    if row.decision != "pending":
        raise DiscoveryStateError(
            f"discovery {discovery_id} already {row.decision}"
        )

    factory = ingest_factory or _default_ingest_factory
    try:
        job_id = factory(row.source_url, session)
        row.decision = "approved"
        row.reviewed_at = datetime.now(timezone.utc)
        if notes is not None:
            row.notes = notes
        session.commit()
    except Exception:
        session.rollback()
        logger.exception(
            "discovery.approve_failed",
            discovery_id=discovery_id,
            source_url=row.source_url,
        )
        raise

    logger.info(
        "discovery.approved",
        discovery_id=discovery_id,
        source_url=row.source_url,
        ingest_job_id=job_id,
    )
    return job_id


def reject(
    discovery_id: str,
    session: Session,
    notes: str | None = None,
) -> None:
    """拒绝一个发现。"""
    row = _load_pending(session, discovery_id)
    if row.decision != "pending":
        raise DiscoveryStateError(
            f"discovery {discovery_id} already {row.decision}"
        )
    row.decision = "rejected"
    row.reviewed_at = datetime.now(timezone.utc)
    if notes is not None:
        row.notes = notes
    session.commit()
    logger.info(
        "discovery.rejected",
        discovery_id=discovery_id,
        source_url=row.source_url,
    )


def list_pending(
    session: Session,
    limit: int = 50,
    offset: int = 0,
) -> list[PendingDiscovery]:
    """返回待审批列表，按质量分倒序、发现时间倒序。"""
    stmt = (
        select(PendingDiscovery)
        .where(PendingDiscovery.decision == "pending")
        .order_by(PendingDiscovery.found_at.desc())
    )
    rows = list(session.execute(stmt).scalars())
    rows.sort(key=_discovery_score, reverse=True)
    return rows[offset : offset + limit]


# ---------- 内部 ----------

def _load_pending(session: Session, discovery_id: str) -> PendingDiscovery:
    row = session.get(PendingDiscovery, discovery_id)
    if row is None:
        raise DiscoveryNotFoundError(discovery_id)
    return row


def _discovery_score(row: PendingDiscovery) -> float:
    data: dict[str, Any] = {
        "source_stars": row.source_stars,
        "skill_count": row.skill_count,
        "pushed_at": None,
        "has_readme": False,
    }
    return score_discovery(data)


def _default_ingest_factory(source_url: str, session: Session) -> str:
    """同步创建一条 pending IngestJob，返回 job_id。

    实际的 clone / parse / embed 由调用方（API 层）通过 FastAPI BackgroundTasks
    异步调度 ``IngestPipeline.run_job(job_id)`` 完成。这样：

    - approve 始终是同步原子操作（discovery 状态 + IngestJob 行在同一事务）
    - API 层负责 async lifecycle（避免在 sync 函数里调 async ingest）
    """
    return _fallback_create_job(source_url, session)


def _fallback_create_job(source_url: str, session: Session) -> str:
    """ingestion 模块缺失时的降级：仅创建 IngestJob 行。"""
    import ulid

    job_id = f"job_{ulid.new().str}"
    session.add(
        IngestJob(
            id=job_id,
            source_url=source_url,
            branch="main",
            auto_approve=True,
            status="pending",
        )
    )
    session.flush()
    logger.warning(
        "discovery.ingest_fallback",
        job_id=job_id,
        source_url=source_url,
        reason="aiforge.ingestion.ingest not importable",
    )
    return job_id
