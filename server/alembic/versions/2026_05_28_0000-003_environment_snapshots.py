"""environment_snapshots —— 本机 agent 环境扫描快照

Revision ID: 003
Revises: 002
Create Date: 2026-05-28

存储插件 ``aiforge scan --sync`` 上报的本机 agent 环境（Claude Code / Codex /
Cursor / Gemini / Windsurf / VS Code 已装的 MCP / plugin / skill）。每台机器只留
最新一份（machine 唯一）。
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "003"
down_revision: str | Sequence[str] | None = "002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "environment_snapshots",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("machine", sa.String(256), nullable=False, unique=True),
        sa.Column("payload", sa.JSON, nullable=False),
        sa.Column("total_mcp", sa.Integer, nullable=False, server_default="0"),
        sa.Column("total_plugin", sa.Integer, nullable=False, server_default="0"),
        sa.Column("total_skill", sa.Integer, nullable=False, server_default="0"),
        sa.Column("agent_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("scanned_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index(
        "ix_environment_snapshots_machine", "environment_snapshots", ["machine"]
    )


def downgrade() -> None:
    op.drop_index("ix_environment_snapshots_machine", table_name="environment_snapshots")
    op.drop_table("environment_snapshots")
