"""config.Settings 单元测试。"""

from __future__ import annotations

from pathlib import Path

import pytest

from aiforge.config import Settings, get_settings


def test_defaults_match_contract(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """关键默认值符合契约文档。"""
    # 给 db_path 一个临时位置避免污染
    monkeypatch.setenv("AIFORGE_DB_PATH", str(tmp_path / "test.db"))
    get_settings.cache_clear()
    s = get_settings()
    assert s.host == "127.0.0.1"
    assert s.port == 8765
    assert s.embedder_model == "sentence-transformers/all-MiniLM-L6-v2"
    assert s.embedder_dim == 384
    assert s.top_k_default == 3
    assert s.retrieve_k == 30
    assert s.max_tokens_default == 4000


def test_env_var_override_takes_effect(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """AIFORGE_PORT 应覆盖默认。"""
    monkeypatch.setenv("AIFORGE_PORT", "9000")
    monkeypatch.setenv("AIFORGE_DB_PATH", str(tmp_path / "x.db"))
    get_settings.cache_clear()
    s = get_settings()
    assert s.port == 9000


def test_db_path_parent_is_created(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """配置的 db_path 父目录应被自动创建。"""
    deep = tmp_path / "nested" / "subdir" / "aiforge.db"
    assert not deep.parent.exists()
    monkeypatch.setenv("AIFORGE_DB_PATH", str(deep))
    get_settings.cache_clear()
    s = get_settings()
    assert s.db_path.parent.exists()
    assert s.db_path.parent.is_dir()


def test_requires_auth_property(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """配置 api_key 后 requires_auth=True。"""
    monkeypatch.setenv("AIFORGE_DB_PATH", str(tmp_path / "y.db"))
    monkeypatch.delenv("AIFORGE_API_KEY", raising=False)
    get_settings.cache_clear()
    assert get_settings().requires_auth is False

    monkeypatch.setenv("AIFORGE_API_KEY", "secret")
    get_settings.cache_clear()
    assert get_settings().requires_auth is True


def test_invalid_reranker_value_raises(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """reranker 是 Literal 枚举，传非法值应 raise。"""
    monkeypatch.setenv("AIFORGE_DB_PATH", str(tmp_path / "z.db"))
    monkeypatch.setenv("AIFORGE_RERANKER", "not-a-backend")
    get_settings.cache_clear()
    with pytest.raises(Exception):
        get_settings()
    # 清理
    monkeypatch.delenv("AIFORGE_RERANKER", raising=False)
    get_settings.cache_clear()


def test_get_settings_is_cached(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """连续两次 get_settings 必须返回同一对象。"""
    monkeypatch.setenv("AIFORGE_DB_PATH", str(tmp_path / "cache.db"))
    get_settings.cache_clear()
    a = get_settings()
    b = get_settings()
    assert a is b
