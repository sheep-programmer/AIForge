"""Tag CRUD 与 artifact ↔ tag 关联帮助函数。

业务规则：
- ``BUILTIN_TAGS`` 在应用启动时幂等写入 ``tags`` 表（``is_builtin=True``）。
- 自动打标只能用 ``tags`` 表里已存在的标签；新标签必须先 ``upsert_tag``。
- 单个 artifact 最多关联 20 个 tag（业务层硬上限，避免误用）。
"""

from __future__ import annotations

from collections.abc import Iterable

import structlog
from sqlalchemy import select
from sqlalchemy.orm import Session

from aiforge.core.models import (
    BUILTIN_TAGS,
    ArtifactTag,
    Skill,
    Tag,
)

logger = structlog.get_logger(__name__)


_MAX_TAGS_PER_ARTIFACT = 20


def ensure_builtin_tags(session: Session) -> int:
    """幂等地把 ``BUILTIN_TAGS`` 写入数据库。返回新建条目数。"""
    existing = {row.name for row in session.scalars(select(Tag)).all()}
    added = 0
    for name, desc in BUILTIN_TAGS.items():
        if name in existing:
            # 即使存在也确保 is_builtin=True / 描述一致
            row = session.get(Tag, name)
            if row is not None:
                changed = False
                if not row.is_builtin:
                    row.is_builtin = True
                    changed = True
                if row.description != desc:
                    row.description = desc
                    changed = True
                if changed:
                    session.add(row)
            continue
        session.add(Tag(name=name, description=desc, is_builtin=True))
        added += 1
    session.commit()
    if added:
        logger.info("tags.builtin_seeded", added=added)
    return added


def upsert_tag(session: Session, name: str, description: str | None = None) -> Tag:
    """获取或创建一个 tag。新建的 tag ``is_builtin=False``。"""
    existing = session.get(Tag, name)
    if existing is not None:
        if description and not existing.description:
            existing.description = description
            session.add(existing)
            session.commit()
        return existing
    tag = Tag(name=name, description=description, is_builtin=False)
    session.add(tag)
    session.commit()
    session.refresh(tag)
    return tag


def list_tags_for(artifact: Skill) -> list[str]:
    """artifact 的所有 tag 名称列表（排序稳定）。"""
    return sorted(a.tag_name for a in artifact.tags)


def set_artifact_tags(
    session: Session,
    artifact: Skill,
    tag_names: Iterable[str],
    source: str = "manual",
) -> list[str]:
    """整体替换 artifact 的 tag 集合。返回最终生效的 tag 列表。

    - 不存在的 tag 会被自动创建（``is_builtin=False``）
    - 数量上限 ``_MAX_TAGS_PER_ARTIFACT``
    """
    names = []
    seen: set[str] = set()
    for raw in tag_names:
        normalized = raw.strip().lower()
        if not normalized or normalized in seen:
            continue
        if len(normalized) > 64:
            continue
        seen.add(normalized)
        names.append(normalized)
        if len(names) >= _MAX_TAGS_PER_ARTIFACT:
            break

    # 保证 tag 行存在
    for name in names:
        if session.get(Tag, name) is None:
            session.add(Tag(name=name, is_builtin=False))
    session.flush()

    # 清除旧关联
    for assoc in list(artifact.tags):
        session.delete(assoc)
    session.flush()

    # 写入新关联
    for name in names:
        session.add(ArtifactTag(skill_id=artifact.id, tag_name=name, source=source))
    session.commit()
    session.refresh(artifact)
    return list_tags_for(artifact)


def add_artifact_tag(
    session: Session,
    artifact: Skill,
    tag_name: str,
    source: str = "manual",
    score: float | None = None,
) -> list[str]:
    """追加（或更新）单个 tag。已存在则更新 source/score。"""
    name = tag_name.strip().lower()
    if not name:
        return list_tags_for(artifact)
    if session.get(Tag, name) is None:
        session.add(Tag(name=name, is_builtin=False))
        session.flush()

    existing = session.get(ArtifactTag, (artifact.id, name))
    if existing is not None:
        existing.source = source
        existing.score = score
        session.add(existing)
    else:
        if len(artifact.tags) >= _MAX_TAGS_PER_ARTIFACT:
            return list_tags_for(artifact)
        session.add(
            ArtifactTag(
                skill_id=artifact.id,
                tag_name=name,
                source=source,
                score=score,
            )
        )
    session.commit()
    session.refresh(artifact)
    return list_tags_for(artifact)


def remove_artifact_tag(session: Session, artifact: Skill, tag_name: str) -> list[str]:
    """从 artifact 移除一个 tag。tag 不存在或未关联时 no-op。"""
    name = tag_name.strip().lower()
    assoc = session.get(ArtifactTag, (artifact.id, name))
    if assoc is not None:
        session.delete(assoc)
        session.commit()
        session.refresh(artifact)
    return list_tags_for(artifact)
