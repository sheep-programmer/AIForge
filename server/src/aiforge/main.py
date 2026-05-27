"""FastAPI 应用入口。

负责：
- lifespan：init_db、预热 embedder、可选启动远程 finder 调度器
- 注册路由、CORS、全局异常处理
- 提供 ``cli()`` 给 ``aiforge-server`` 脚本入口
"""

from __future__ import annotations

import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import structlog
import ulid
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from aiforge import __version__
from aiforge.api import admin, autotag, health, ingest, recommend, skills, tags
from aiforge.config import get_settings
from aiforge.core.db import get_session_maker, init_db
from aiforge.core.tags import ensure_builtin_tags

logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """应用生命周期：启动期初始化、关闭期清理。"""
    settings = get_settings()

    # 1. 建库 / 建虚拟表
    try:
        init_db(settings)
        logger.info("startup.db_ready", path=str(settings.db_path))
    except Exception:
        logger.exception("startup.db_failed")
        raise

    # 1b. 幂等写入预置 tag —— 让自动 / 手动打标立即可用
    try:
        session_maker = get_session_maker(settings)
        with session_maker() as session:
            added = ensure_builtin_tags(session)
        logger.info("startup.tags_ready", builtin_added=added)
    except Exception as exc:
        logger.warning("startup.tags_seed_failed", error=str(exc))

    # 2. 预热 embedder —— 不阻塞启动失败，degrade 即可
    try:
        from aiforge.recommender.embedder import get_embedder

        get_embedder(settings)
        logger.info("startup.embedder_ready")
    except Exception as exc:
        logger.warning("startup.embedder_failed", error=str(exc))

    # 3. 可选：启动远程 finder 调度器
    scheduler = None
    if settings.enable_remote_finder:
        try:
            from aiforge.discovery.scheduler import RemoteFinderScheduler

            scheduler = RemoteFinderScheduler(settings)
            scheduler.start()
            logger.info("startup.finder_started", interval=settings.finder_interval_seconds)
        except Exception as exc:
            logger.warning("startup.finder_failed", error=str(exc))
            scheduler = None

    app.state.started_at = time.time()

    try:
        yield
    finally:
        if scheduler is not None:
            try:
                await scheduler.stop()
                logger.info("shutdown.finder_stopped")
            except Exception:
                logger.exception("shutdown.finder_stop_failed")


def _error_response(status_code: int, message: str, code: str, request_id: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": message, "code": code, "request_id": request_id},
    )


def create_app() -> FastAPI:
    """构造 FastAPI 应用。"""
    settings = get_settings()

    app = FastAPI(
        title="AIForge",
        version=__version__,
        description="为 AI 编程 agent 而生的 skill 路由器",
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url=None,
    )

    # CORS：仅允许 localhost / 127.0.0.1 任意端口
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # request_id 中间件
    @app.middleware("http")
    async def assign_request_id(request: Request, call_next):  # type: ignore[no-untyped-def]
        request_id = f"req_{ulid.new().str}"
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response

    # 全局异常处理 —— 统一 JSON 错误体
    @app.exception_handler(StarletteHTTPException)
    async def http_exc_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        rid = getattr(request.state, "request_id", "")
        if isinstance(exc.detail, dict) and "error" in exc.detail:
            payload = {
                "error": exc.detail.get("error", "http error"),
                "code": exc.detail.get("code", "http_error"),
                "request_id": rid,
            }
            return JSONResponse(status_code=exc.status_code, content=payload)
        return _error_response(
            exc.status_code,
            str(exc.detail) if exc.detail else "http error",
            f"http_{exc.status_code}",
            rid,
        )

    @app.exception_handler(RequestValidationError)
    async def validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        rid = getattr(request.state, "request_id", "")
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "error": "validation error",
                "code": "validation_error",
                "details": exc.errors(),
                "request_id": rid,
            },
        )

    @app.exception_handler(Exception)
    async def unhandled_handler(request: Request, exc: Exception) -> JSONResponse:
        rid = getattr(request.state, "request_id", "")
        logger.exception("unhandled_exception", path=request.url.path)
        return _error_response(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "internal server error",
            "internal_error",
            rid,
        )

    # 路由注册
    app.include_router(health.router)
    app.include_router(recommend.router)
    app.include_router(ingest.router)
    app.include_router(skills.router)
    app.include_router(tags.router)
    app.include_router(admin.router)
    app.include_router(autotag.router)

    logger.info(
        "app.configured",
        host=settings.host,
        port=settings.port,
        auth_required=settings.requires_auth,
    )
    return app


app = create_app()


def cli() -> None:
    """``aiforge-server`` 命令入口。"""
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "aiforge.main:app",
        host=settings.host,
        port=settings.port,
        log_level=settings.log_level.lower(),
    )


if __name__ == "__main__":
    cli()
