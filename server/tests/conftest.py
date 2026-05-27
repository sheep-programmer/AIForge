"""pytest 全局 fixture。所有测试共享 in-memory SQLite + 假 embedder。"""

from __future__ import annotations

import os
import tempfile
from collections.abc import Generator
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

# 在导入任何 aiforge 模块前先设置环境变量
os.environ.setdefault("AIFORGE_DB_PATH", str(Path(tempfile.gettempdir()) / "sf_test.db"))
os.environ.setdefault("AIFORGE_RERANKER", "none")
os.environ.setdefault("AIFORGE_ENABLE_REMOTE_FINDER", "false")
os.environ.setdefault("AIFORGE_LOG_LEVEL", "WARNING")


@pytest.fixture(scope="session")
def test_db_path(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """整个 session 共用一个数据库。"""
    return tmp_path_factory.mktemp("db") / "test.db"


@pytest.fixture
def settings(test_db_path: Path, monkeypatch: pytest.MonkeyPatch):  # type: ignore[no-untyped-def]
    """每个测试拿到带临时 DB 的 Settings。"""
    monkeypatch.setenv("AIFORGE_DB_PATH", str(test_db_path))
    from aiforge.config import get_settings

    get_settings.cache_clear()
    return get_settings()


@pytest.fixture
def db_session(settings) -> Generator[Session, None, None]:  # type: ignore[no-untyped-def]
    """每个测试拿到干净的 session（事务结束回滚）。"""
    from aiforge.core.db import get_session_maker, init_db

    init_db(settings)
    sm = get_session_maker(settings)
    with sm() as s:
        yield s
        s.rollback()


@pytest.fixture
def fake_embed_vec() -> np.ndarray:
    """384 维确定性测试向量。"""
    rng = np.random.default_rng(42)
    return rng.standard_normal(384).astype(np.float32)


@pytest.fixture
def sample_skill_md() -> str:
    """合法的 SKILL.md 示例内容。"""
    return """---
name: example-skill
description: 一个用于测试的示例 skill
---
# Example Skill

这是测试用的 skill 内容。

## 使用方式

当用户提到 example 时使用。
"""


@pytest.fixture
def sample_skill_repo(tmp_path: Path, sample_skill_md: str) -> Path:
    """造一个含多个 SKILL.md 的临时仓库。"""
    repo = tmp_path / "fake-repo"
    (repo / "skills" / "alpha").mkdir(parents=True)
    (repo / "skills" / "beta").mkdir(parents=True)
    (repo / ".claude" / "skills" / "gamma").mkdir(parents=True)

    (repo / "skills" / "alpha" / "SKILL.md").write_text(sample_skill_md, encoding="utf-8")
    (repo / "skills" / "beta" / "SKILL.md").write_text(
        sample_skill_md.replace("example-skill", "beta-skill"), encoding="utf-8"
    )
    (repo / ".claude" / "skills" / "gamma" / "SKILL.md").write_text(
        sample_skill_md.replace("example-skill", "gamma-skill"), encoding="utf-8"
    )
    # 应被忽略的文件
    (repo / "node_modules").mkdir()
    (repo / "node_modules" / "SKILL.md").write_text("garbage", encoding="utf-8")
    return repo


@pytest.fixture
def api_client(settings) -> Generator[TestClient, None, None]:  # type: ignore[no-untyped-def]
    """FastAPI TestClient。"""
    from aiforge.main import app

    with TestClient(app) as client:
        yield client
