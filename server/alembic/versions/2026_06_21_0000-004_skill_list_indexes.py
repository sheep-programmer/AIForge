"""skills 列表分页索引

Revision ID: 004
Revises: 003
Create Date: 2026-06-21

列表/分页端点一律 ORDER BY updated_at DESC，并常按 artifact_type 过滤。
给排序键与「类型过滤 + 时间排序」组合补索引，避免表增大后分页全表排序。
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "004"
down_revision: str | Sequence[str] | None = "003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index("ix_skill_updated_at", "skills", ["updated_at"])
    op.create_index("ix_skill_type_updated", "skills", ["artifact_type", "updated_at"])


def downgrade() -> None:
    op.drop_index("ix_skill_type_updated", table_name="skills")
    op.drop_index("ix_skill_updated_at", table_name="skills")
