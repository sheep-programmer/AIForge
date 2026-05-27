"""AIForge 插件配置管理。

读取 ``~/.config/aiforge/config.toml``，提供默认值并支持环境变量覆盖。
写入使用简单的字符串拼装（避免 toml 写库依赖）。
"""

from __future__ import annotations

import os
import tomllib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


# 配置 / 状态目录
CONFIG_DIR = Path(os.environ.get("AIFORGE_CONFIG_DIR", "")) or (
    Path.home() / ".config" / "aiforge"
)
CACHE_DIR = Path(os.environ.get("AIFORGE_CACHE_DIR", "")) or (
    Path.home() / ".cache" / "aiforge"
)
CONFIG_FILE = CONFIG_DIR / "config.toml"
LOCAL_CACHE_DB = CONFIG_DIR / "local-cache.sqlite"
SESSION_STATE_FILE = CACHE_DIR / "session-state.json"


@dataclass(slots=True)
class Config:
    """运行时配置快照。"""

    server_url: str = "http://localhost:8765"
    top_k: int = 3
    max_tokens: int = 4000
    enabled: bool = True
    fallback_warn_once: bool = True
    timeout_ms: int = 250

    # 派生属性
    config_dir: Path = field(default_factory=lambda: CONFIG_DIR)
    cache_dir: Path = field(default_factory=lambda: CACHE_DIR)
    local_cache_db: Path = field(default_factory=lambda: LOCAL_CACHE_DB)
    session_state_file: Path = field(default_factory=lambda: SESSION_STATE_FILE)

    @property
    def timeout_seconds(self) -> float:
        """HTTP 超时（秒）。"""
        return self.timeout_ms / 1000.0


def _coerce_bool(value: Any, default: bool) -> bool:
    """容错地把 toml 里的值转成 bool。"""
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return default


def _coerce_int(value: Any, default: int) -> int:
    """容错地把 toml 里的值转成 int。"""
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def load_config() -> Config:
    """从磁盘加载配置；文件不存在或损坏时回退默认。

    环境变量可覆盖关键字段（便于 CI / 测试）：
    - ``AIFORGE_SERVER_URL``
    - ``AIFORGE_TOP_K``
    - ``AIFORGE_ENABLED``
    """
    cfg = Config()

    if CONFIG_FILE.is_file():
        try:
            with CONFIG_FILE.open("rb") as f:
                raw = tomllib.load(f)
        except (OSError, tomllib.TOMLDecodeError):
            raw = {}
        cfg.server_url = str(raw.get("server_url", cfg.server_url))
        cfg.top_k = _coerce_int(raw.get("top_k", cfg.top_k), cfg.top_k)
        cfg.max_tokens = _coerce_int(raw.get("max_tokens", cfg.max_tokens), cfg.max_tokens)
        cfg.enabled = _coerce_bool(raw.get("enabled", cfg.enabled), cfg.enabled)
        cfg.fallback_warn_once = _coerce_bool(
            raw.get("fallback_warn_once", cfg.fallback_warn_once),
            cfg.fallback_warn_once,
        )
        cfg.timeout_ms = _coerce_int(raw.get("timeout_ms", cfg.timeout_ms), cfg.timeout_ms)

    # 环境变量覆盖
    if env_url := os.environ.get("AIFORGE_SERVER_URL"):
        cfg.server_url = env_url
    if env_top_k := os.environ.get("AIFORGE_TOP_K"):
        cfg.top_k = _coerce_int(env_top_k, cfg.top_k)
    if env_enabled := os.environ.get("AIFORGE_ENABLED"):
        cfg.enabled = _coerce_bool(env_enabled, cfg.enabled)

    return cfg


def ensure_dirs(cfg: Config) -> None:
    """确保配置 / 缓存目录存在。"""
    cfg.config_dir.mkdir(parents=True, exist_ok=True)
    cfg.cache_dir.mkdir(parents=True, exist_ok=True)


def write_config(cfg: Config) -> None:
    """将配置写回磁盘（手写 TOML，避免引入 tomli-w）。"""
    ensure_dirs(cfg)
    lines = [
        "# AIForge 插件配置。任何字段都可以删除以恢复默认值。",
        f'server_url = "{cfg.server_url}"',
        f"top_k = {cfg.top_k}",
        f"max_tokens = {cfg.max_tokens}",
        f"enabled = {'true' if cfg.enabled else 'false'}",
        f"fallback_warn_once = {'true' if cfg.fallback_warn_once else 'false'}",
        f"timeout_ms = {cfg.timeout_ms}",
        "",
    ]
    CONFIG_FILE.write_text("\n".join(lines), encoding="utf-8")


def describe(cfg: Config) -> str:
    """返回人类可读的配置摘要（用于 /aiforge:config）。"""
    return (
        f"配置文件: {CONFIG_FILE}\n"
        f"server_url       = {cfg.server_url}\n"
        f"top_k            = {cfg.top_k}\n"
        f"max_tokens       = {cfg.max_tokens}\n"
        f"enabled          = {cfg.enabled}\n"
        f"fallback_warn_once = {cfg.fallback_warn_once}\n"
        f"timeout_ms       = {cfg.timeout_ms}\n"
        f"本地缓存 DB      = {cfg.local_cache_db}\n"
    )
