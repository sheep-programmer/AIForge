"""GET /v1/health —— 探活与组件就绪状态。"""

from __future__ import annotations

import time

import httpx
import structlog
from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from aiforge import __version__
from aiforge.api.deps import get_db
from aiforge.config import Settings, get_settings
from aiforge.core.models import Skill
from aiforge.core.schemas import HealthResponse

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/v1", tags=["health"])

_START_TIME = time.monotonic()


def _check_reranker(settings: Settings) -> bool:
    """探活 reranker 后端。永不抛异常。"""
    backend = settings.reranker
    if backend == "none":
        return False
    if backend == "haiku":
        return bool(settings.anthropic_api_key)
    if backend == "ollama":
        try:
            resp = httpx.get(f"{settings.ollama_host}/api/tags", timeout=0.5)
            return resp.status_code == 200
        except Exception:
            return False
    return False


def _check_embedder_loaded() -> bool:
    """不触发加载，仅观察单例状态。"""
    try:
        from aiforge.recommender import embedder as embedder_mod

        return embedder_mod._embedder is not None
    except Exception:
        return False


@router.get("/health", response_model=HealthResponse)
def health(
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> HealthResponse:
    """返回服务健康状态。任何子检查失败不会拖垮整体响应。"""
    skills_count = 0
    db_ok = True
    try:
        skills_count = int(db.scalar(select(func.count(Skill.id))) or 0)
    except Exception as exc:
        db_ok = False
        logger.warning("health.db_check_failed", error=str(exc))

    reranker_ok = _check_reranker(settings)
    embedder_ok = _check_embedder_loaded()

    if not db_ok:
        status_value: str = "error"
    elif not embedder_ok:
        status_value = "degraded"
    else:
        status_value = "ok"

    return HealthResponse(
        status=status_value,  # type: ignore[arg-type]
        version=__version__,
        skills_count=skills_count,
        reranker_available=reranker_ok,
        embedder_loaded=embedder_ok,
        uptime_seconds=int(time.monotonic() - _START_TIME),
    )
