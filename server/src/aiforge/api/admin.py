"""管理端点 —— 待审批的 PendingDiscovery 审核。"""

from __future__ import annotations

import json

import structlog
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from aiforge.api.deps import get_db, require_api_key
from aiforge.core.models import PendingDiscovery
from aiforge.core.schemas import (
    ApprovalRequest,
    ApprovalResponse,
    PendingDiscoveryItem,
)

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/v1/admin", tags=["admin"])


def _to_item(d: PendingDiscovery) -> PendingDiscoveryItem:
    try:
        names = json.loads(d.sample_skill_names) if d.sample_skill_names else []
    except json.JSONDecodeError:
        names = []
    decision = d.decision if d.decision in {"pending", "approved", "rejected"} else "pending"
    return PendingDiscoveryItem(
        id=d.id,
        source_url=d.source_url,
        source_repo=d.source_repo,
        source_stars=d.source_stars,
        skill_count=d.skill_count,
        sample_skill_names=names,
        found_via=d.found_via,
        found_at=d.found_at,
        decision=decision,  # type: ignore[arg-type]
    )


@router.get(
    "/discoveries",
    response_model=list[PendingDiscoveryItem],
    dependencies=[Depends(require_api_key)],
)
def list_discoveries(
    decision: str = Query(default="pending", pattern="^(pending|approved|rejected|all)$"),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> list[PendingDiscoveryItem]:
    """列出 PendingDiscovery 记录。"""
    stmt = select(PendingDiscovery)
    if decision != "all":
        stmt = stmt.where(PendingDiscovery.decision == decision)
    stmt = stmt.order_by(PendingDiscovery.found_at.desc()).limit(limit).offset(offset)

    try:
        rows = db.scalars(stmt).all()
    except Exception as exc:
        logger.exception("admin.discoveries.list_failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": str(exc), "code": "list_failed"},
        ) from exc

    return [_to_item(r) for r in rows]


@router.post(
    "/discoveries/{discovery_id}/approve",
    response_model=ApprovalResponse,
    dependencies=[Depends(require_api_key)],
)
async def approve_discovery(
    discovery_id: str,
    background_tasks: BackgroundTasks,
    payload: ApprovalRequest | None = None,
    db: Session = Depends(get_db),
) -> ApprovalResponse:
    """批准发现 → 同步创建 IngestJob → 后台异步驱动入库管线。"""
    try:
        from aiforge.discovery.approval import approve as run_approve
    except ImportError as exc:
        logger.error("admin.approval_missing", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": "approval module unavailable", "code": "module_missing"},
        ) from exc

    try:
        ingest_job_id = run_approve(
            discovery_id=discovery_id,
            session=db,
            notes=payload.notes if payload else None,
        )
    except HTTPException:
        raise
    except LookupError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": str(exc) or "discovery not found", "code": "not_found"},
        ) from exc
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error": str(exc), "code": "invalid_state"},
        ) from exc
    except Exception as exc:
        logger.exception("admin.approve_failed", discovery_id=discovery_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": str(exc), "code": "approve_failed"},
        ) from exc

    # 后台异步驱动 ingest（clone + parse + embed）。失败不影响 approve 响应。
    try:
        from aiforge.ingestion.pipeline import IngestPipeline

        pipeline = IngestPipeline()
        background_tasks.add_task(pipeline.run_job, ingest_job_id)
    except ImportError:
        logger.warning(
            "admin.ingest_not_scheduled",
            ingest_job_id=ingest_job_id,
            reason="ingestion module unavailable; job remains pending",
        )

    return ApprovalResponse(
        discovery_id=discovery_id,
        decision="approved",
        ingest_job_id=ingest_job_id,
    )


@router.post(
    "/discoveries/{discovery_id}/reject",
    response_model=ApprovalResponse,
    dependencies=[Depends(require_api_key)],
)
async def reject_discovery(
    discovery_id: str,
    payload: ApprovalRequest | None = None,
    db: Session = Depends(get_db),
) -> ApprovalResponse:
    """拒绝发现。"""
    try:
        from aiforge.discovery.approval import reject as run_reject
    except ImportError as exc:
        logger.error("admin.approval_missing", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": "approval module unavailable", "code": "module_missing"},
        ) from exc

    try:
        run_reject(
            discovery_id=discovery_id,
            session=db,
            notes=payload.notes if payload else None,
        )
    except HTTPException:
        raise
    except LookupError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": str(exc) or "discovery not found", "code": "not_found"},
        ) from exc
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error": str(exc), "code": "invalid_state"},
        ) from exc
    except Exception as exc:
        logger.exception("admin.reject_failed", discovery_id=discovery_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": str(exc), "code": "reject_failed"},
        ) from exc

    return ApprovalResponse(
        discovery_id=discovery_id,
        decision="rejected",
        ingest_job_id=None,
    )
