"""ORM 模型。SQLAlchemy 2.x 风格。

向量字段单独存到 sqlite-vss 的虚拟表，见 db.py。

> 说明：``Skill`` 表实际承载三类 artifact —— skill / mcp / plugin，由
> ``artifact_type`` 字段区分。表名保留为 ``skills`` 以避免大规模迁移，
> 但模块对外同时导出 ``Artifact`` 别名供新代码使用。
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


# Artifact 种类。skill = SKILL.md；mcp = MCP server 登记条目；plugin = Claude Code 插件
ArtifactType = Literal["skill", "mcp", "plugin"]
TagSource = Literal["manual", "auto"]


class Skill(Base):
    """库中的一条 artifact（skill / mcp / plugin 通用承载）。

    表名因历史原因保留 ``skills``；行的语义由 ``artifact_type`` 区分。
    新代码请使用 ``Artifact`` 这个语义化别名。
    """

    __tablename__ = "skills"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(256), index=True)
    description: Mapped[str] = mapped_column(Text)
    body: Mapped[str] = mapped_column(Text)
    body_tokens: Mapped[int] = mapped_column(Integer, default=0)

    source_url: Mapped[str] = mapped_column(String(512), index=True)
    source_path: Mapped[str] = mapped_column(String(512))
    source_repo: Mapped[str] = mapped_column(String(256), index=True)
    source_stars: Mapped[int] = mapped_column(Integer, default=0)
    license: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # 打包的 float32 向量（与 vss_skills.embedding 同步写入）；
    # deduper 在内存里 unpack 用，避免每次去虚拟表回查
    embedding: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)

    cluster_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    is_approved: Mapped[bool] = mapped_column(Boolean, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)

    # Artifact 类型字段：默认 "skill" 与历史行为一致
    artifact_type: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default="skill", index=True
    )

    # MCP 登记信息（artifact_type='mcp' 时填充）
    # 结构示例：
    #   {"transport": "stdio", "command": "npx",
    #    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"],
    #    "env": {"FOO": "bar"}}
    # 或：
    #   {"transport": "http", "url": "https://api.example.com/mcp"}
    mcp_config: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Plugin manifest 摘要（artifact_type='plugin' 时填充）
    # 结构示例：
    #   {"name": "...", "version": "...", "commands": [...],
    #    "hooks": {...}, "manifest_path": ".claude-plugin/plugin.json"}
    plugin_manifest: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
    last_recommended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    recommend_count: Mapped[int] = mapped_column(Integer, default=0)

    tags: Mapped[list[ArtifactTag]] = relationship(
        "ArtifactTag",
        back_populates="skill",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    __table_args__ = (
        UniqueConstraint("source_url", "source_path", name="uq_skill_source"),
        Index("ix_skill_active_approved", "is_active", "is_approved"),
    )


# 语义化别名 —— 新代码请用 Artifact；Skill 保留供旧引用平滑过渡
Artifact = Skill


class Tag(Base):
    """artifact 分组标签。扁平多标签模型。"""

    __tablename__ = "tags"

    name: Mapped[str] = mapped_column(String(64), primary_key=True)
    description: Mapped[str | None] = mapped_column(String(256), nullable=True)
    # 是否内置（预置 tag 不允许通过 API 删除）
    is_builtin: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    artifacts: Mapped[list[ArtifactTag]] = relationship(
        "ArtifactTag", back_populates="tag", cascade="all, delete-orphan"
    )


class ArtifactTag(Base):
    """artifact ↔ tag 多对多关联。

    ``source`` 区分人工 (``manual``) 与小模型自动 (``auto``) 标注，
    便于后续 retag / 审计。
    """

    __tablename__ = "skill_tags"

    skill_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("skills.id", ondelete="CASCADE"), primary_key=True
    )
    tag_name: Mapped[str] = mapped_column(
        String(64), ForeignKey("tags.name", ondelete="CASCADE"), primary_key=True
    )
    source: Mapped[str] = mapped_column(String(16), default="manual")
    score: Mapped[float | None] = mapped_column(nullable=True)  # 自动打标置信度
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    skill: Mapped[Skill] = relationship(Skill, back_populates="tags")
    tag: Mapped[Tag] = relationship(Tag, back_populates="artifacts")

    __table_args__ = (Index("ix_skill_tags_tag_name", "tag_name"),)


class IngestJob(Base):
    """Ingestion 任务记录。"""

    __tablename__ = "ingest_jobs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    source_url: Mapped[str] = mapped_column(String(512))
    branch: Mapped[str] = mapped_column(String(128), default="main")
    auto_approve: Mapped[bool] = mapped_column(Boolean, default=True)

    status: Mapped[str] = mapped_column(
        String(32), default="pending"
    )  # pending/fetching/parsing/embedding/done/error
    skills_added: Mapped[int] = mapped_column(Integer, default=0)
    skills_updated: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class PendingDiscovery(Base):
    """远程 skill-finder 找到的、等待人工审批的条目。"""

    __tablename__ = "pending_discoveries"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    source_url: Mapped[str] = mapped_column(String(512), unique=True)
    source_repo: Mapped[str] = mapped_column(String(256), index=True)
    source_stars: Mapped[int] = mapped_column(Integer, default=0)
    skill_count: Mapped[int] = mapped_column(Integer, default=0)
    sample_skill_names: Mapped[str] = mapped_column(Text, default="[]")  # JSON list

    found_via: Mapped[str] = mapped_column(String(64))  # github-search/trending/user-suggest
    found_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    decision: Mapped[str] = mapped_column(
        String(32), default="pending"
    )  # pending/approved/rejected
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class RecommendationLog(Base):
    """记录每次推荐请求 —— 用于改进排序和审计。"""

    __tablename__ = "recommendation_logs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    prompt_preview: Mapped[str] = mapped_column(String(512))  # 前 500 字符
    agent: Mapped[str | None] = mapped_column(String(64), nullable=True)
    top_k: Mapped[int] = mapped_column(Integer)
    elapsed_ms: Mapped[int] = mapped_column(Integer)
    candidates_considered: Mapped[int] = mapped_column(Integer)
    fallback_used: Mapped[bool] = mapped_column(Boolean, default=False)
    skill_ids: Mapped[str] = mapped_column(Text)  # JSON list of recommended skill IDs
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)


class EnvironmentSnapshot(Base):
    """本机扫描快照：某台机器上各 agent 已装的 MCP / plugin / skill。

    每台机器（``machine``）只保留**最新一份** —— 上报时按 machine upsert。
    ``payload`` 存 scanner 产出的完整 JSON（env 已脱敏）。
    """

    __tablename__ = "environment_snapshots"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    machine: Mapped[str] = mapped_column(String(256), unique=True, index=True)
    payload: Mapped[dict] = mapped_column(JSON)  # 完整 scan 结果
    # 反范式计数，便于列表页快速展示，不必解 payload
    total_mcp: Mapped[int] = mapped_column(Integer, default=0)
    total_plugin: Mapped[int] = mapped_column(Integer, default=0)
    total_skill: Mapped[int] = mapped_column(Integer, default=0)
    agent_count: Mapped[int] = mapped_column(Integer, default=0)
    scanned_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


# 类型别名供应用代码使用
IngestStatus = Literal["pending", "fetching", "parsing", "embedding", "done", "error"]
DiscoveryDecision = Literal["pending", "approved", "rejected"]


# 预置 tag 集合 —— ingest 时自动写入 ``tags`` 表（幂等 upsert）。
# 自动打标的小模型只能从这个集合里挑；管理员可通过 API 增加自定义 tag。
BUILTIN_TAGS: dict[str, str] = {
    "browser-automation": "Playwright/Puppeteer/Selenium 等浏览器自动化",
    "reverse-engineering": "二进制/协议逆向、反编译、调试器",
    "ui": "前端界面构建、组件库、设计系统",
    "testing": "单元/集成/E2E 测试、test runner",
    "security": "代码安全审查、漏洞扫描、密钥管理",
    "devops": "CI/CD、容器、部署、基础设施",
    "db": "数据库建模、迁移、查询优化",
    "docs": "文档生成、README、API 文档",
    "code-review": "PR 审查、风格检查、最佳实践",
    "refactor": "重构、代码整理、依赖梳理",
    "build": "打包、bundler、构建系统",
    "debug": "调试、日志、问题定位",
    "api-integration": "对接外部 API、SDK、webhook",
    "data-pipeline": "数据抽取、转换、加载",
    "ml": "机器学习、训练、推理、prompt 工程",
    "mobile": "iOS / Android / 跨端移动开发",
    "cli": "命令行工具构建与使用",
    "git": "git 工作流、版本控制",
    "auth": "认证、授权、SSO、OAuth",
    "scraping": "网页抓取、爬虫、解析",
}
