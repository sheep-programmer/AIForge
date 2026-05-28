"""本机环境快照：插件上报 + Web 面板读取。

- ``POST /v1/environment/scan`` —— 插件把 ``scan_environment()`` 的输出上报；
  按 machine upsert（每台机器只留最新一份）。
- ``GET /v1/environment`` —— Web 面板读所有机器的最新快照，按时间倒序。
- ``GET /v1/environment/installed`` —— 扁平化「已装」清单，供 artifacts 列表交叉比对
  打「已装」标记（按 name 匹配）。

env 值在插件侧已脱敏，这里不再处理密钥。
"""

from __future__ import annotations

import structlog
import ulid
from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from aiforge.api.deps import get_db, optional_api_key, require_api_key
from aiforge.core.models import EnvironmentSnapshot
from aiforge.core.schemas import (
    EnvironmentResponse,
    EnvironmentScanRequest,
    EnvironmentScanResponse,
    EnvironmentSnapshotItem,
)

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/v1/environment", tags=["environment"])


@router.post(
    "/scan",
    response_model=EnvironmentScanResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_api_key)],
)
def submit_scan(
    payload: EnvironmentScanRequest,
    db: Session = Depends(get_db),
) -> EnvironmentScanResponse:
    """接收插件上报的扫描快照，按 machine upsert。"""
    totals = payload.totals or {}
    total_mcp = int(totals.get("mcp", 0))
    total_plugin = int(totals.get("plugin", 0))
    total_skill = int(totals.get("skill", 0))
    agent_count = len(payload.agents)

    full = payload.model_dump()

    existing = db.scalar(
        select(EnvironmentSnapshot).where(EnvironmentSnapshot.machine == payload.machine)
    )
    if existing is not None:
        existing.payload = full
        existing.total_mcp = total_mcp
        existing.total_plugin = total_plugin
        existing.total_skill = total_skill
        existing.agent_count = agent_count
        snapshot_id = existing.id
    else:
        snapshot_id = f"env_{ulid.new().str}"
        db.add(
            EnvironmentSnapshot(
                id=snapshot_id,
                machine=payload.machine,
                payload=full,
                total_mcp=total_mcp,
                total_plugin=total_plugin,
                total_skill=total_skill,
                agent_count=agent_count,
            )
        )
    db.commit()

    logger.info(
        "environment.scan_received",
        machine=payload.machine,
        mcp=total_mcp,
        plugin=total_plugin,
        skill=total_skill,
    )
    return EnvironmentScanResponse(
        snapshot_id=snapshot_id,
        machine=payload.machine,
        total_mcp=total_mcp,
        total_plugin=total_plugin,
        total_skill=total_skill,
    )


@router.get(
    "",
    response_model=EnvironmentResponse,
    dependencies=[Depends(optional_api_key)],
)
def list_environment(db: Session = Depends(get_db)) -> EnvironmentResponse:
    """所有机器的最新快照，按扫描时间倒序。"""
    rows = db.scalars(
        select(EnvironmentSnapshot).order_by(EnvironmentSnapshot.created_at.desc())
    ).all()
    return EnvironmentResponse(
        machines=[
            EnvironmentSnapshotItem(
                machine=r.machine,
                scanned_at=r.created_at,
                total_mcp=r.total_mcp,
                total_plugin=r.total_plugin,
                total_skill=r.total_skill,
                agent_count=r.agent_count,
                payload=r.payload or {},
            )
            for r in rows
        ]
    )


@router.get(
    "/installed",
    dependencies=[Depends(optional_api_key)],
)
def list_installed_names(db: Session = Depends(get_db)) -> dict[str, list[str]]:
    """扁平化所有机器上「已装」条目的 name，供 artifacts 列表打「已装」标记。

    返回 ``{"mcp": [...], "plugin": [...], "skill": [...]}``（去重排序）。
    """
    mcp: set[str] = set()
    plugin: set[str] = set()
    skill: set[str] = set()
    rows = db.scalars(select(EnvironmentSnapshot)).all()
    for r in rows:
        for agent in (r.payload or {}).get("agents", []):
            for m in agent.get("mcps", []):
                if isinstance(m, dict) and m.get("name"):
                    mcp.add(str(m["name"]))
            for p in agent.get("plugins", []):
                if isinstance(p, dict) and p.get("name"):
                    plugin.add(str(p["name"]))
            for s in agent.get("skills", []):
                if isinstance(s, dict) and s.get("name"):
                    skill.add(str(s["name"]))
    return {
        "mcp": sorted(mcp),
        "plugin": sorted(plugin),
        "skill": sorted(skill),
    }
