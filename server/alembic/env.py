"""Alembic 环境配置。

DB URL 从 AIForge Settings 读取，保证迁移和应用一致。
"""

from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from aiforge.config import get_settings
from aiforge.core.models import Base

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# 用 Settings 覆盖 alembic.ini 里的占位 URL
settings = get_settings()
config.set_main_option("sqlalchemy.url", f"sqlite:///{settings.db_path}")

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """无 DBAPI 连接的离线模式 —— 仅生成 SQL。"""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,  # SQLite 需要 batch mode 才支持 ALTER
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """常规模式：建连接然后跑迁移。"""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
