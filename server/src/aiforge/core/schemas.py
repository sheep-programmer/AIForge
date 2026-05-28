"""Pydantic 请求/响应 schema。HTTP 边界的契约。"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl

# Artifact 类型字面量在多个 schema 间共享
ArtifactTypeLit = Literal["skill", "mcp", "plugin"]
TagSourceLit = Literal["manual", "auto"]


# ---------- 推荐 ----------


class RecommendRequest(BaseModel):
    """POST /v1/recommend 请求体。"""

    model_config = ConfigDict(extra="forbid")

    prompt: str = Field(..., min_length=1, max_length=20_000)
    agent: str | None = Field(default=None, max_length=64)
    context: dict[str, Any] = Field(default_factory=dict)
    top_k: int = Field(default=3, ge=1, le=20)
    max_tokens: int = Field(default=4000, ge=200, le=50_000)
    exclude_ids: list[str] = Field(default_factory=list)
    # 仅展示/浏览用 —— 默认不影响检索；预留给未来作为 pre-filter
    types: list[ArtifactTypeLit] | None = Field(default=None)


class Recommendation(BaseModel):
    skill_id: str
    name: str
    description: str
    body: str
    score: float
    source_url: str
    rerank_reason: str | None = None
    tokens: int
    artifact_type: ArtifactTypeLit = "skill"
    tags: list[str] = Field(default_factory=list)
    mcp_config: dict[str, Any] | None = None
    plugin_manifest: dict[str, Any] | None = None


class RecommendResponse(BaseModel):
    request_id: str
    elapsed_ms: int
    recommendations: list[Recommendation]
    candidates_considered: int
    fallback_used: bool


# ---------- Ingest ----------


class IngestRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    github_url: HttpUrl
    branch: str = "main"
    auto_approve: bool = True


class IngestResponse(BaseModel):
    job_id: str
    status: str


class IngestJobStatus(BaseModel):
    job_id: str
    status: str
    source_url: str
    skills_added: int
    skills_updated: int
    error: str | None
    created_at: datetime
    finished_at: datetime | None


# ---------- Skills ----------


class SkillBrief(BaseModel):
    """列表用的精简表示。"""

    id: str
    name: str
    description: str
    source_url: str
    source_repo: str
    source_stars: int
    is_active: bool
    body_tokens: int
    recommend_count: int
    updated_at: datetime
    artifact_type: ArtifactTypeLit = "skill"
    tags: list[str] = Field(default_factory=list)


class SkillDetail(SkillBrief):
    body: str
    source_path: str
    license: str | None
    cluster_id: int | None
    is_approved: bool
    created_at: datetime
    last_recommended_at: datetime | None
    mcp_config: dict[str, Any] | None = None
    plugin_manifest: dict[str, Any] | None = None


class SkillListResponse(BaseModel):
    total: int
    items: list[SkillBrief]
    limit: int
    offset: int


# ---------- Tag ----------


class TagItem(BaseModel):
    name: str
    description: str | None = None
    is_builtin: bool
    artifact_count: int = 0
    created_at: datetime


class TagListResponse(BaseModel):
    total: int
    items: list[TagItem]


class TagCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(..., min_length=1, max_length=64, pattern=r"^[a-z0-9][a-z0-9-]*$")
    description: str | None = Field(default=None, max_length=256)


class ArtifactTagAssignment(BaseModel):
    """单条 artifact → tag 关联。"""

    tag: str
    source: TagSourceLit = "manual"
    score: float | None = None


class ArtifactTagSetRequest(BaseModel):
    """整体替换某 artifact 的 tag 集合。"""

    model_config = ConfigDict(extra="forbid")
    tags: list[str] = Field(default_factory=list, max_length=20)
    source: TagSourceLit = "manual"


class ArtifactTagAddRequest(BaseModel):
    """追加单个 tag。"""

    model_config = ConfigDict(extra="forbid")
    tag: str = Field(..., min_length=1, max_length=64)
    source: TagSourceLit = "manual"
    score: float | None = Field(default=None, ge=0.0, le=1.0)


class ArtifactTagsResponse(BaseModel):
    artifact_id: str
    tags: list[ArtifactTagAssignment]


# ---------- Autotag ----------


class AutotagRequest(BaseModel):
    """触发自动打标的批量任务。"""

    model_config = ConfigDict(extra="forbid")
    # 仅给这些 artifact 打标；None 表示全库
    artifact_ids: list[str] | None = None
    # 只处理还没有 auto tag 的条目
    only_untagged: bool = True
    # LLM 给每个 artifact 选几个 tag
    max_tags_per_artifact: int = Field(default=3, ge=1, le=5)
    # 触发后立即开始还是返回 job_id 异步
    background: bool = True


class AutotagResponse(BaseModel):
    job_id: str
    status: str  # "running" | "done" | "error"
    artifacts_total: int
    artifacts_tagged: int
    error: str | None = None


# ---------- Environment scan ----------


class EnvironmentScanRequest(BaseModel):
    """插件上报的本机扫描快照（scanner.py 的输出，env 已脱敏）。

    用 extra=allow 接住 scanner 未来可能加的字段，避免版本耦合。
    """

    model_config = ConfigDict(extra="allow")
    machine: str = Field(..., min_length=1, max_length=256)
    scanned_at: str | None = None
    cwd: str | None = None
    agents: list[dict[str, Any]] = Field(default_factory=list)
    totals: dict[str, int] = Field(default_factory=dict)


class EnvironmentScanResponse(BaseModel):
    snapshot_id: str
    machine: str
    total_mcp: int
    total_plugin: int
    total_skill: int


class EnvironmentSnapshotItem(BaseModel):
    machine: str
    scanned_at: datetime
    total_mcp: int
    total_plugin: int
    total_skill: int
    agent_count: int
    payload: dict[str, Any]


class EnvironmentResponse(BaseModel):
    """所有上报过的机器，按 scanned_at 倒序。"""

    machines: list[EnvironmentSnapshotItem]


# ---------- Admin / Discovery ----------


class PendingDiscoveryItem(BaseModel):
    id: str
    source_url: str
    source_repo: str
    source_stars: int
    skill_count: int
    sample_skill_names: list[str]
    found_via: str
    found_at: datetime
    decision: Literal["pending", "approved", "rejected"]


class ApprovalRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    notes: str | None = None


class ApprovalResponse(BaseModel):
    discovery_id: str
    decision: Literal["approved", "rejected"]
    ingest_job_id: str | None = None


# ---------- Health ----------


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded", "error"]
    version: str
    skills_count: int
    reranker_available: bool
    embedder_loaded: bool
    uptime_seconds: int
