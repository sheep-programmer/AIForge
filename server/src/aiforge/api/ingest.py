"""POST /v1/ingest 与 GET /v1/ingest/{job_id} —— 仓库入库。"""

from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from aiforge.api.deps import get_db, require_api_key
from aiforge.core.models import IngestJob
from aiforge.core.schemas import IngestJobStatus, IngestRequest, IngestResponse

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/v1", tags=["ingest"])


@router.post(
    "/ingest",
    response_model=IngestResponse,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_api_key)],
)
async def create_ingest(
    payload: IngestRequest,
    db: Session = Depends(get_db),
) -> IngestResponse:
    """启动一个 ingest 任务。业务逻辑由 ingestion.pipeline 实现。"""
    try:
        from aiforge.ingestion.pipeline import ingest as run_ingest
    except ImportError as exc:
        logger.error("ingest.pipeline_missing", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": "ingestion pipeline unavailable", "code": "pipeline_missing"},
        ) from exc

    try:
        job = await run_ingest(
            github_url=str(payload.github_url),
            branch=payload.branch,
            auto_approve=payload.auto_approve,
            session=db,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("ingest.failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": str(exc), "code": "ingest_failed"},
        ) from exc

    return IngestResponse(job_id=job.id, status=job.status)


@router.get(
    "/ingest/{job_id}",
    response_model=IngestJobStatus,
    dependencies=[Depends(require_api_key)],
)
def get_ingest_status(
    job_id: str,
    db: Session = Depends(get_db),
) -> IngestJobStatus:
    """查询 ingest 任务状态。"""
    job = db.get(IngestJob, job_id)
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": f"ingest job {job_id} not found", "code": "not_found"},
        )
    return IngestJobStatus(
        job_id=job.id,
        status=job.status,
        source_url=job.source_url,
        skills_added=job.skills_added,
        skills_updated=job.skills_updated,
        error=job.error,
        created_at=job.created_at,
        finished_at=job.finished_at,
    )
