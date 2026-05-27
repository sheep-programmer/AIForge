"""POST /v1/recommend —— 推荐 hot path。"""

from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from aiforge.api.deps import get_db
from aiforge.core.schemas import RecommendRequest, RecommendResponse

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/v1", tags=["recommend"])


@router.post("/recommend", response_model=RecommendResponse)
def recommend(
    payload: RecommendRequest,
    db: Session = Depends(get_db),
) -> RecommendResponse:
    """运行推荐管线并返回 top-k skill。

    hot path：无需 auth；token 预算由上层（plugin）保证。
    业务模块在并行实现，这里 lazy import 以避免启动期循环依赖。
    """
    try:
        from aiforge.recommender.pipeline import recommend as run_recommend
    except ImportError as exc:
        logger.error("recommend.pipeline_missing", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": "recommender pipeline unavailable", "code": "pipeline_missing"},
        ) from exc

    try:
        return run_recommend(
            prompt=payload.prompt,
            top_k=payload.top_k,
            max_tokens=payload.max_tokens,
            exclude_ids=payload.exclude_ids,
            db_session=db,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("recommend.failed")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": str(exc), "code": "recommend_failed"},
        ) from exc
