"""第一阶段：向量召回。

把 prompt 向量丢给 sqlite-vss，取 top-K rowid，回查 ``Skill`` ORM。
返回 (skill, similarity) 列表，相似度已归一到 [0, 1]（越大越相似）。
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import structlog
from sqlalchemy import select

from aiforge.core.db import vss_search
from aiforge.core.models import Skill

if TYPE_CHECKING:
    import numpy as np
    from sqlalchemy.orm import Session

logger = structlog.get_logger(__name__)


def _distance_to_similarity(distance: float) -> float:
    """sqlite-vss 返回的是 L2 距离（向量已 L2 归一化时 ∈ [0, 2]）。

    对单位向量 ``||a-b||^2 = 2 - 2*cos(a,b)``，所以
    ``cos = 1 - distance/2``，截断到 [0, 1] 避免浮点误差越界。
    """
    sim = 1.0 - distance / 2.0
    if sim < 0.0:
        return 0.0
    if sim > 1.0:
        return 1.0
    return sim


def retrieve(
    session: Session,
    query_vec: "np.ndarray",
    top_k: int,
    exclude_ids: set[str] | None = None,
) -> list[tuple[Skill, float]]:
    """召回 top-K 候选。

    Args:
        session: 已绑定数据库的 SQLAlchemy session
        query_vec: prompt 向量，shape=(dim,)
        top_k: 返回数量上限（管线一般传 ``settings.retrieve_k``）
        exclude_ids: 客户端已经持有的 skill id，跳过

    Returns:
        [(Skill, similarity ∈ [0,1]), ...]，按相似度降序。仅包含
        ``is_active=True`` 且 ``is_approved=True`` 的条目。
    """
    exclude = exclude_ids or set()

    # 先多取一些，给 exclude / inactive 过滤留余量
    fetch_k = top_k + len(exclude) + 10
    raw = vss_search(session, query_vec, fetch_k)
    if not raw:
        return []

    rowids = [rowid for rowid, _ in raw]

    # rowid 不是 ORM 主键字段，必须用 raw SQL 桥接 rowid → skill_id
    rows = session.execute(
        _rowid_lookup_stmt(rowids),
    ).all()

    rowid_to_skill_id: dict[int, str] = {int(r[0]): str(r[1]) for r in rows}
    if not rowid_to_skill_id:
        return []

    skill_ids = [sid for sid in rowid_to_skill_id.values() if sid not in exclude]
    if not skill_ids:
        return []

    skills = session.execute(
        select(Skill).where(
            Skill.id.in_(skill_ids),
            Skill.is_active.is_(True),
            Skill.is_approved.is_(True),
        )
    ).scalars().all()

    id_to_skill = {s.id: s for s in skills}

    # 把 (rowid, distance) 投影成 (skill, similarity)，跳过被 exclude 过滤的
    results: list[tuple[Skill, float]] = []
    for rowid, dist in raw:
        sid = rowid_to_skill_id.get(rowid)
        if sid is None or sid in exclude:
            continue
        skill = id_to_skill.get(sid)
        if skill is None:
            # 可能 is_active 已变 False
            continue
        results.append((skill, _distance_to_similarity(dist)))
        if len(results) >= top_k:
            break

    logger.debug(
        "retriever.done",
        retrieved=len(results),
        requested_k=top_k,
        excluded=len(exclude),
    )
    return results


def _rowid_lookup_stmt(rowids: list[int]) -> "object":
    """根据 rowid 列表查 (rowid, id) —— 必须用 raw SQL 因为 ORM 不暴露 rowid。"""
    from sqlalchemy import text

    if not rowids:
        return text("SELECT rowid, id FROM skills WHERE 0=1")
    placeholders = ",".join(str(int(r)) for r in rowids)
    return text(f"SELECT rowid, id FROM skills WHERE rowid IN ({placeholders})")
