"""FastAPI 依赖：DB session 与可选鉴权。"""

from __future__ import annotations

from collections.abc import Generator

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from aiforge.config import Settings, get_settings
from aiforge.core.db import get_session_maker


def get_db() -> Generator[Session, None, None]:
    """请求级 SQLAlchemy session。"""
    session_maker = get_session_maker()
    session = session_maker()
    try:
        yield session
    finally:
        session.close()


def _check_bearer(authorization: str | None, settings: Settings) -> None:
    """校验 Authorization: Bearer <key>。仅当 settings.api_key 已配置时被调用。"""
    expected = settings.api_key
    if not expected:
        return
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "missing authorization header", "code": "unauthorized"},
            headers={"WWW-Authenticate": "Bearer"},
        )
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or token != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "invalid api key", "code": "unauthorized"},
            headers={"WWW-Authenticate": "Bearer"},
        )


def require_api_key(
    authorization: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> None:
    """写操作强制鉴权。未配置 api_key 时直接放行。"""
    _check_bearer(authorization, settings)


def optional_api_key(
    authorization: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> None:
    """读操作可选鉴权。配置 api_key 后同样需校验。"""
    _check_bearer(authorization, settings)
