"""artifact_type + mcp/plugin payload + tags / skill_tags

Revision ID: 002
Revises: 001
Create Date: 2026-05-27

引入 unified artifact 概念：在原 ``skills`` 表上加 ``artifact_type`` 字段，
以及 ``mcp_config`` / ``plugin_manifest`` 两个 JSON 载荷。新增 ``tags`` 与
``skill_tags`` 两张表用于扁平多标签分组（手动 / 自动）。

预置 tag 在应用启动时由 ``aiforge.core.tags.ensure_builtin_tags`` 注入，
不在迁移里写数据，避免迁移 / 业务耦合。
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# alembic 在 ScriptDirectory.walk_revisions 时按模块属性读取下面四个名字，
# 看起来"未使用"实则是 alembic 的反射式必需元数据。
__all__ = ["revision", "down_revision", "branch_labels", "depends_on", "upgrade", "downgrade"]

revision: str = "002"
down_revision: str | Sequence[str] | None = "001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ---- skills: 新列 ----
    with op.batch_alter_table("skills") as batch:
        batch.add_column(
            sa.Column(
                "artifact_type",
                sa.String(16),
                nullable=False,
                server_default="skill",
            )
        )
        batch.add_column(sa.Column("mcp_config", sa.JSON, nullable=True))
        batch.add_column(sa.Column("plugin_manifest", sa.JSON, nullable=True))

    op.create_index("ix_skills_artifact_type", "skills", ["artifact_type"])

    # ---- tags ----
    op.create_table(
        "tags",
        sa.Column("name", sa.String(64), primary_key=True),
        sa.Column("description", sa.String(256), nullable=True),
        sa.Column("is_builtin", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )

    # ---- skill_tags (artifact ↔ tag) ----
    op.create_table(
        "skill_tags",
        sa.Column(
            "skill_id",
            sa.String(64),
            sa.ForeignKey("skills.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "tag_name",
            sa.String(64),
            sa.ForeignKey("tags.name", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("source", sa.String(16), nullable=False, server_default="manual"),
        sa.Column("score", sa.Float, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_skill_tags_tag_name", "skill_tags", ["tag_name"])


def downgrade() -> None:
    op.drop_index("ix_skill_tags_tag_name", table_name="skill_tags")
    op.drop_table("skill_tags")
    op.drop_table("tags")

    op.drop_index("ix_skills_artifact_type", table_name="skills")
    with op.batch_alter_table("skills") as batch:
        batch.drop_column("plugin_manifest")
        batch.drop_column("mcp_config")
        batch.drop_column("artifact_type")
