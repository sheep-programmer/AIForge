"""Skills / Artifacts CRUD：列表 / 详情 / 启停 / 删除 / tag 管理。"""

from __future__ import annotations

from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from aiforge.api.deps import get_db, optional_api_key, require_api_key
from aiforge.core.models import ArtifactTag, Skill
from aiforge.core.schemas import (
    ArtifactTagAddRequest,
    ArtifactTagAssignment,
    ArtifactTagSetRequest,
    ArtifactTagsResponse,
    ArtifactTypeLit,
    SkillBrief,
    SkillDetail,
    SkillListResponse,
)
from aiforge.core.tags import (
    add_artifact_tag,
    list_tags_for,
    remove_artifact_tag,
    set_artifact_tags,
)

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/v1", tags=["skills"])


class SkillPatchRequest(BaseModel):
    """PATCH /v1/skills/{id} 请求体。当前允许切换启停。"""

    model_config = ConfigDict(extra="forbid")

    is_active: bool


def _to_brief(s: Skill) -> SkillBrief:
    return SkillBrief(
        id=s.id,
        name=s.name,
        description=s.description,
        source_url=s.source_url,
        source_repo=s.source_repo,
        source_stars=s.source_stars,
        is_active=s.is_active,
        body_tokens=s.body_tokens,
        recommend_count=s.recommend_count,
        updated_at=s.updated_at,
        artifact_type=s.artifact_type,  # type: ignore[arg-type]
        tags=list_tags_for(s),
    )


def _to_detail(s: Skill) -> SkillDetail:
    return SkillDetail(
        id=s.id,
        name=s.name,
        description=s.description,
        source_url=s.source_url,
        source_repo=s.source_repo,
        source_stars=s.source_stars,
        is_active=s.is_active,
        body_tokens=s.body_tokens,
        recommend_count=s.recommend_count,
        updated_at=s.updated_at,
        body=s.body,
        source_path=s.source_path,
        license=s.license,
        cluster_id=s.cluster_id,
        is_approved=s.is_approved,
        created_at=s.created_at,
        last_recommended_at=s.last_recommended_at,
        artifact_type=s.artifact_type,  # type: ignore[arg-type]
        tags=list_tags_for(s),
        mcp_config=s.mcp_config,
        plugin_manifest=s.plugin_manifest,
    )


def _apply_filters(
    base: Any,
    q: str | None,
    source_repo: str | None,
    active: bool | None,
    artifact_type: str | None,
    tag: str | None,
) -> Any:
    if q:
        like = f"%{q}%"
        base = base.where(or_(Skill.name.ilike(like), Skill.description.ilike(like)))
    if source_repo:
        base = base.where(Skill.source_repo == source_repo)
    if active is not None:
        base = base.where(Skill.is_active == active)
    if artifact_type:
        base = base.where(Skill.artifact_type == artifact_type)
    if tag:
        base = base.join(ArtifactTag, ArtifactTag.skill_id == Skill.id).where(
            ArtifactTag.tag_name == tag.lower()
        )
    return base


def _load_artifact_or_404(db: Session, artifact_id: str) -> Skill:
    s = db.get(Skill, artifact_id)
    if s is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": f"artifact {artifact_id} not found", "code": "not_found"},
        )
    return s


@router.get(
    "/skills",
    response_model=SkillListResponse,
    dependencies=[Depends(optional_api_key)],
)
def list_skills(
    q: str | None = Query(default=None, description="按 name/description 模糊匹配"),
    source_repo: str | None = Query(default=None),
    active: bool | None = Query(default=None),
    type: ArtifactTypeLit | None = Query(default=None, description="按 artifact 类型过滤"),
    tag: str | None = Query(default=None, description="按单个 tag 名过滤"),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> SkillListResponse:
    """分页列出 artifact（兼容旧 /v1/skills 名）。"""
    base = select(Skill)
    base = _apply_filters(base, q, source_repo, active, type, tag)

    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = db.scalars(base.order_by(Skill.updated_at.desc()).limit(limit).offset(offset)).all()

    return SkillListResponse(
        total=int(total),
        items=[_to_brief(s) for s in rows],
        limit=limit,
        offset=offset,
    )


# ---------- artifacts 别名 ----------
# /v1/artifacts 提供语义化路径，但走同一套逻辑。
@router.get(
    "/artifacts",
    response_model=SkillListResponse,
    dependencies=[Depends(optional_api_key)],
)
def list_artifacts(
    q: str | None = Query(default=None),
    source_repo: str | None = Query(default=None),
    active: bool | None = Query(default=None),
    type: ArtifactTypeLit | None = Query(default=None),
    tag: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> SkillListResponse:
    return list_skills(
        q=q,
        source_repo=source_repo,
        active=active,
        type=type,
        tag=tag,
        limit=limit,
        offset=offset,
        db=db,
    )


@router.get(
    "/artifacts/{artifact_id}",
    response_model=SkillDetail,
    dependencies=[Depends(optional_api_key)],
)
def get_artifact(artifact_id: str, db: Session = Depends(get_db)) -> SkillDetail:
    s = _load_artifact_or_404(db, artifact_id)
    return _to_detail(s)


# ---------- artifact tag 管理 ----------


@router.get(
    "/artifacts/{artifact_id}/tags",
    response_model=ArtifactTagsResponse,
    dependencies=[Depends(optional_api_key)],
)
def get_artifact_tags(artifact_id: str, db: Session = Depends(get_db)) -> ArtifactTagsResponse:
    s = _load_artifact_or_404(db, artifact_id)
    return ArtifactTagsResponse(
        artifact_id=s.id,
        tags=[
            ArtifactTagAssignment(
                tag=t.tag_name,
                source=t.source,  # type: ignore[arg-type]
                score=t.score,
            )
            for t in sorted(s.tags, key=lambda x: x.tag_name)
        ],
    )


@router.put(
    "/artifacts/{artifact_id}/tags",
    response_model=ArtifactTagsResponse,
    dependencies=[Depends(require_api_key)],
)
def set_tags_endpoint(
    artifact_id: str,
    payload: ArtifactTagSetRequest,
    db: Session = Depends(get_db),
) -> ArtifactTagsResponse:
    """整体替换 artifact 的 tag 集合。"""
    s = _load_artifact_or_404(db, artifact_id)
    names = set_artifact_tags(db, s, payload.tags, source=payload.source)
    return ArtifactTagsResponse(
        artifact_id=s.id,
        tags=[ArtifactTagAssignment(tag=n, source=payload.source) for n in names],
    )


@router.post(
    "/artifacts/{artifact_id}/tags",
    response_model=ArtifactTagsResponse,
    dependencies=[Depends(require_api_key)],
)
def add_tag_endpoint(
    artifact_id: str,
    payload: ArtifactTagAddRequest,
    db: Session = Depends(get_db),
) -> ArtifactTagsResponse:
    s = _load_artifact_or_404(db, artifact_id)
    add_artifact_tag(db, s, payload.tag, source=payload.source, score=payload.score)
    db.refresh(s)
    return ArtifactTagsResponse(
        artifact_id=s.id,
        tags=[
            ArtifactTagAssignment(
                tag=t.tag_name,
                source=t.source,  # type: ignore[arg-type]
                score=t.score,
            )
            for t in sorted(s.tags, key=lambda x: x.tag_name)
        ],
    )


@router.delete(
    "/artifacts/{artifact_id}/tags/{tag_name}",
    response_model=ArtifactTagsResponse,
    dependencies=[Depends(require_api_key)],
)
def delete_tag_endpoint(
    artifact_id: str,
    tag_name: str,
    db: Session = Depends(get_db),
) -> ArtifactTagsResponse:
    s = _load_artifact_or_404(db, artifact_id)
    remove_artifact_tag(db, s, tag_name)
    db.refresh(s)
    return ArtifactTagsResponse(
        artifact_id=s.id,
        tags=[
            ArtifactTagAssignment(
                tag=t.tag_name,
                source=t.source,  # type: ignore[arg-type]
                score=t.score,
            )
            for t in sorted(s.tags, key=lambda x: x.tag_name)
        ],
    )


@router.get(
    "/skills/{skill_id}",
    response_model=SkillDetail,
    dependencies=[Depends(optional_api_key)],
)
def get_skill(skill_id: str, db: Session = Depends(get_db)) -> SkillDetail:
    """查询单个 skill 详情。"""
    s = db.get(Skill, skill_id)
    if s is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": f"skill {skill_id} not found", "code": "not_found"},
        )
    return _to_detail(s)


@router.patch(
    "/skills/{skill_id}",
    response_model=SkillDetail,
    dependencies=[Depends(require_api_key)],
)
def patch_skill(
    skill_id: str,
    payload: SkillPatchRequest,
    db: Session = Depends(get_db),
) -> SkillDetail:
    """切换 skill 启停。"""
    s = db.get(Skill, skill_id)
    if s is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": f"skill {skill_id} not found", "code": "not_found"},
        )
    s.is_active = payload.is_active
    db.commit()
    db.refresh(s)
    return _to_detail(s)


@router.delete(
    "/skills/{skill_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_api_key)],
)
def delete_skill(skill_id: str, db: Session = Depends(get_db)) -> None:
    """删除 skill。"""
    s = db.get(Skill, skill_id)
    if s is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": f"skill {skill_id} not found", "code": "not_found"},
        )
    db.delete(s)
    db.commit()
