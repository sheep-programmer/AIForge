"""initial schema —— skills / ingest_jobs / pending_discoveries / recommendation_logs

Revision ID: 001
Revises:
Create Date: 2026-05-27

注意：sqlite-vss 的 ``vss_skills`` 虚拟表不在 alembic 管辖范围内，
由 ``aiforge.core.db.init_db`` 在应用启动时按需创建。
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# alembic 在 ScriptDirectory.walk_revisions 时按模块属性读取下面四个名字，
# 看起来"未使用"实则是 alembic 的反射式必需元数据。
__all__ = ["revision", "down_revision", "branch_labels", "depends_on", "upgrade", "downgrade"]

revision: str = "001"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "skills",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("name", sa.String(256), nullable=False),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("body_tokens", sa.Integer, nullable=False, server_default="0"),
        sa.Column("source_url", sa.String(512), nullable=False),
        sa.Column("source_path", sa.String(512), nullable=False),
        sa.Column("source_repo", sa.String(256), nullable=False),
        sa.Column("source_stars", sa.Integer, nullable=False, server_default="0"),
        sa.Column("license", sa.String(64), nullable=True),
        sa.Column("embedding", sa.LargeBinary, nullable=True),
        sa.Column("cluster_id", sa.Integer, nullable=True),
        sa.Column("is_approved", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("last_recommended_at", sa.DateTime, nullable=True),
        sa.Column("recommend_count", sa.Integer, nullable=False, server_default="0"),
        sa.UniqueConstraint("source_url", "source_path", name="uq_skill_source"),
    )
    op.create_index("ix_skills_name", "skills", ["name"])
    op.create_index("ix_skills_source_url", "skills", ["source_url"])
    op.create_index("ix_skills_source_repo", "skills", ["source_repo"])
    op.create_index("ix_skills_cluster_id", "skills", ["cluster_id"])
    op.create_index("ix_skills_is_active", "skills", ["is_active"])
    op.create_index("ix_skill_active_approved", "skills", ["is_active", "is_approved"])

    op.create_table(
        "ingest_jobs",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("source_url", sa.String(512), nullable=False),
        sa.Column("branch", sa.String(128), nullable=False, server_default="main"),
        sa.Column("auto_approve", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("status", sa.String(32), nullable=False, server_default="pending"),
        sa.Column("skills_added", sa.Integer, nullable=False, server_default="0"),
        sa.Column("skills_updated", sa.Integer, nullable=False, server_default="0"),
        sa.Column("error", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("finished_at", sa.DateTime, nullable=True),
    )

    op.create_table(
        "pending_discoveries",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("source_url", sa.String(512), nullable=False, unique=True),
        sa.Column("source_repo", sa.String(256), nullable=False),
        sa.Column("source_stars", sa.Integer, nullable=False, server_default="0"),
        sa.Column("skill_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("sample_skill_names", sa.Text, nullable=False, server_default="[]"),
        sa.Column("found_via", sa.String(64), nullable=False),
        sa.Column("found_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("reviewed_at", sa.DateTime, nullable=True),
        sa.Column("decision", sa.String(32), nullable=False, server_default="pending"),
        sa.Column("notes", sa.Text, nullable=True),
    )
    op.create_index("ix_pending_source_repo", "pending_discoveries", ["source_repo"])

    op.create_table(
        "recommendation_logs",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("prompt_preview", sa.String(512), nullable=False),
        sa.Column("agent", sa.String(64), nullable=True),
        sa.Column("top_k", sa.Integer, nullable=False),
        sa.Column("elapsed_ms", sa.Integer, nullable=False),
        sa.Column("candidates_considered", sa.Integer, nullable=False),
        sa.Column("fallback_used", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("skill_ids", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_reclog_created_at", "recommendation_logs", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_reclog_created_at", table_name="recommendation_logs")
    op.drop_table("recommendation_logs")
    op.drop_index("ix_pending_source_repo", table_name="pending_discoveries")
    op.drop_table("pending_discoveries")
    op.drop_table("ingest_jobs")
    op.drop_index("ix_skill_active_approved", table_name="skills")
    op.drop_index("ix_skills_is_active", table_name="skills")
    op.drop_index("ix_skills_cluster_id", table_name="skills")
    op.drop_index("ix_skills_source_repo", table_name="skills")
    op.drop_index("ix_skills_source_url", table_name="skills")
    op.drop_index("ix_skills_name", table_name="skills")
    op.drop_table("skills")
