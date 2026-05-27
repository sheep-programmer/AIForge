"""Tag CRUD：列表 / 创建 / 删除。

预置 tag (``is_builtin=True``) 禁止删除，但可以被关联 / 取关。
"""

from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from aiforge.api.deps import get_db, optional_api_key, require_api_key
from aiforge.core.models import ArtifactTag, Tag
from aiforge.core.schemas import (
    TagCreateRequest,
    TagItem,
    TagListResponse,
)

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/v1", tags=["tags"])


@router.get(
    "/tags",
    response_model=TagListResponse,
    dependencies=[Depends(optional_api_key)],
)
def list_tags(
    builtin_only: bool = Query(default=False),
    db: Session = Depends(get_db),
) -> TagListResponse:
    """列出所有 tag，附带每个 tag 关联的 artifact 数量。"""
    base = select(Tag)
    if builtin_only:
        base = base.where(Tag.is_builtin.is_(True))
    rows = db.scalars(base.order_by(Tag.name)).all()

    # 一次性聚合 artifact 数
    counts: dict[str, int] = {
        str(name): int(n)
        for name, n in db.execute(
            select(ArtifactTag.tag_name, func.count(ArtifactTag.skill_id)).group_by(
                ArtifactTag.tag_name
            )
        ).all()
    }

    items = [
        TagItem(
            name=t.name,
            description=t.description,
            is_builtin=t.is_builtin,
            artifact_count=int(counts.get(t.name, 0)),
            created_at=t.created_at,
        )
        for t in rows
    ]
    return TagListResponse(total=len(items), items=items)


@router.post(
    "/tags",
    response_model=TagItem,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_api_key)],
)
def create_tag(payload: TagCreateRequest, db: Session = Depends(get_db)) -> TagItem:
    name = payload.name.lower()
    if db.get(Tag, name) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error": f"tag {name} already exists", "code": "tag_exists"},
        )
    tag = Tag(name=name, description=payload.description, is_builtin=False)
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return TagItem(
        name=tag.name,
        description=tag.description,
        is_builtin=tag.is_builtin,
        artifact_count=0,
        created_at=tag.created_at,
    )


@router.delete(
    "/tags/{tag_name}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_api_key)],
)
def delete_tag(tag_name: str, db: Session = Depends(get_db)) -> None:
    tag = db.get(Tag, tag_name.lower())
    if tag is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": f"tag {tag_name} not found", "code": "not_found"},
        )
    if tag.is_builtin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": f"cannot delete builtin tag {tag_name}", "code": "builtin_tag"},
        )
    db.delete(tag)
    db.commit()
