"""后台调度器：周期性跑 RemoteFinder。

只有 `enable_remote_finder=True` 时 `start()` 才真正注册 asyncio 任务；
否则是 no-op，**不**触发任何外部请求。
"""

from __future__ import annotations

import asyncio
from typing import Callable

import structlog
from sqlalchemy.orm import Session, sessionmaker

from aiforge.config import Settings, get_settings
from aiforge.core.db import get_session_maker

from .finder import RemoteFinder

logger = structlog.get_logger(__name__)

SessionFactory = Callable[[], Session]


class RemoteFinderScheduler:
    """异步定时调度器。在 FastAPI lifespan 里 start/stop。"""

    def __init__(
        self,
        settings: Settings | None = None,
        session_factory: SessionFactory | None = None,
    ) -> None:
        self._settings = settings or get_settings()
        self._session_factory: SessionFactory = (
            session_factory or _default_session_factory(self._settings)
        )
        self._task: asyncio.Task[None] | None = None
        self._stopping = asyncio.Event()

    @property
    def running(self) -> bool:
        return self._task is not None and not self._task.done()

    def start(self) -> None:
        """启动循环。enable_remote_finder=False 时直接返回。"""
        if not self._settings.enable_remote_finder:
            logger.info("scheduler.skipped_disabled")
            return
        if self.running:
            return
        self._stopping.clear()
        self._task = asyncio.create_task(self._run_loop(), name="aiforge-finder")
        logger.info(
            "scheduler.started",
            interval_seconds=self._settings.finder_interval_seconds,
        )

    async def stop(self) -> None:
        """优雅停止：置停止位 + 取消任务 + 等回收。"""
        if not self._task:
            return
        self._stopping.set()
        self._task.cancel()
        try:
            await self._task
        except (asyncio.CancelledError, Exception):  # noqa: BLE001
            pass
        finally:
            self._task = None
        logger.info("scheduler.stopped")

    # ---------- 内部 ----------

    async def _run_loop(self) -> None:
        interval = max(60, int(self._settings.finder_interval_seconds))
        # 启动时先跑一次，然后进入间隔循环
        await self._tick_safe()
        while not self._stopping.is_set():
            try:
                await asyncio.wait_for(self._stopping.wait(), timeout=interval)
                # wait 成功返回 → stopping 被置位 → 退出
                break
            except asyncio.TimeoutError:
                await self._tick_safe()

    async def _tick_safe(self) -> None:
        try:
            await self._tick()
        except Exception:  # noqa: BLE001
            logger.exception("scheduler.tick_failed")

    async def _tick(self) -> None:
        async with RemoteFinder(settings=self._settings) as finder:
            session = self._session_factory()
            try:
                new_items = await finder.discover(session)
                logger.info("scheduler.tick_done", new_items=len(new_items))
            finally:
                session.close()


def _default_session_factory(settings: Settings) -> SessionFactory:
    maker: sessionmaker[Session] = get_session_maker(settings)

    def _make() -> Session:
        return maker()

    return _make
