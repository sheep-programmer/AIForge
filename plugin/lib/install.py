"""AIForge artifact 本地安装 / 卸载工具。

负责把服务端返回的 artifact 元数据落到本地：
- MCP：写入 ``~/.claude/settings.json`` 的 ``mcpServers`` 字段
- Plugin：``git clone`` 到 ``~/.claude/plugins/<name>/``
- Skill：当前不支持手动安装（用户应让推荐器自动加载）

仅使用 Python 标准库（json / pathlib / shutil / subprocess / time），保持插件
零三方依赖。所有错误均返回人类可读的中文状态行，不抛栈给用户。
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any


# Claude Code 默认配置目录
_CLAUDE_HOME = Path.home() / ".claude"
_SETTINGS_FILE = _CLAUDE_HOME / "settings.json"
_PLUGINS_DIR = _CLAUDE_HOME / "plugins"


# ---------------------------------------------------------------------------
# settings.json 读写工具
# ---------------------------------------------------------------------------


def _ensure_claude_home() -> None:
    """确保 ``~/.claude`` 存在。"""
    _CLAUDE_HOME.mkdir(parents=True, exist_ok=True)


def _read_settings() -> dict[str, Any]:
    """读取 settings.json；不存在则返回空 dict。损坏时也回退空 dict。"""
    if not _SETTINGS_FILE.is_file():
        return {}
    try:
        with _SETTINGS_FILE.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(data, dict):
        return {}
    return data


def _backup_settings() -> Path | None:
    """把当前 settings.json 备份到 ``settings.json.bak.<unix_ts>``。

    不存在时不备份；返回备份路径或 ``None``。
    """
    if not _SETTINGS_FILE.is_file():
        return None
    ts = int(time.time())
    backup = _SETTINGS_FILE.with_suffix(f".json.bak.{ts}")
    shutil.copy2(_SETTINGS_FILE, backup)
    return backup


def _atomic_write_settings(data: dict[str, Any]) -> None:
    """原子写回 settings.json（先写 .tmp 再 os.replace）。"""
    _ensure_claude_home()
    text = json.dumps(data, indent=2, ensure_ascii=False)
    tmp = _SETTINGS_FILE.with_suffix(".json.tmp")
    tmp.write_text(text + "\n", encoding="utf-8")
    os.replace(tmp, _SETTINGS_FILE)


# ---------------------------------------------------------------------------
# install / uninstall MCP
# ---------------------------------------------------------------------------


def install_mcp(artifact: dict[str, Any]) -> str:
    """把 ``artifact['mcp_config']`` 写入 settings.json 的 mcpServers 段。

    写入前自动备份原文件。返回人类可读的状态行。
    """
    name = (artifact.get("name") or "").strip()
    mcp_config = artifact.get("mcp_config")
    if not name:
        return "安装失败：artifact 缺少 name 字段"
    if not isinstance(mcp_config, dict) or not mcp_config:
        return f"安装失败：artifact {name!r} 没有有效的 mcp_config"

    settings = _read_settings()
    servers = settings.get("mcpServers")
    if not isinstance(servers, dict):
        servers = {}

    backup = _backup_settings()
    servers[name] = mcp_config
    settings["mcpServers"] = servers
    _atomic_write_settings(settings)

    bak_note = f"（备份: {backup.name}）" if backup else "（无原文件，已新建）"
    return f"已安装 MCP {name!r} 到 {_SETTINGS_FILE} {bak_note}"


def uninstall_mcp(name: str) -> str:
    """从 settings.json 的 mcpServers 中移除指定 key（带备份）。"""
    name = (name or "").strip()
    if not name:
        return "卸载失败：未指定 MCP 名称"
    if not _SETTINGS_FILE.is_file():
        return f"卸载失败：{_SETTINGS_FILE} 不存在"

    settings = _read_settings()
    servers = settings.get("mcpServers")
    if not isinstance(servers, dict) or name not in servers:
        return f"未安装：mcpServers 中找不到 {name!r}"

    backup = _backup_settings()
    del servers[name]
    settings["mcpServers"] = servers
    _atomic_write_settings(settings)

    bak_note = f"（备份: {backup.name}）" if backup else ""
    return f"已卸载 MCP {name!r} {bak_note}"


# ---------------------------------------------------------------------------
# install / uninstall plugin
# ---------------------------------------------------------------------------


def install_plugin(artifact: dict[str, Any], *, force: bool = False) -> str:
    """``git clone`` artifact 的源仓库到 ``~/.claude/plugins/<name>/``。

    目录已存在时除非 ``force=True`` 否则拒绝。返回状态行。
    """
    name = (artifact.get("name") or "").strip()
    # 兼容两种字段：source_url（spec 描述）和 install_url（manifest 中的字段）
    source_url = (
        artifact.get("source_url")
        or artifact.get("install_url")
        or ""
    ).strip()
    if not name:
        return "安装失败：artifact 缺少 name 字段"
    if not source_url:
        return f"安装失败：artifact {name!r} 没有可用的 source_url / install_url"

    _PLUGINS_DIR.mkdir(parents=True, exist_ok=True)
    target = _PLUGINS_DIR / name
    if target.exists():
        if not force:
            return f"安装失败：{target} 已存在；加 --force 可覆盖"
        shutil.rmtree(target)

    try:
        result = subprocess.run(
            ["git", "clone", "--depth", "1", source_url, str(target)],
            capture_output=True,
            text=True,
            timeout=120,
        )
    except FileNotFoundError:
        return "安装失败：找不到 git 可执行文件，请先安装 git"
    except subprocess.TimeoutExpired:
        return f"安装失败：git clone 超时（{source_url}）"

    if result.returncode != 0:
        stderr = (result.stderr or "").strip().splitlines()[-1:] or [""]
        return f"安装失败：git clone 返回 {result.returncode}；{stderr[0]}"

    return f"已安装 plugin {name!r} -> {target}"


def uninstall_plugin(name: str) -> str:
    """删除 ``~/.claude/plugins/<name>/`` 整棵目录。"""
    name = (name or "").strip()
    if not name:
        return "卸载失败：未指定 plugin 名称"
    target = _PLUGINS_DIR / name
    if not target.exists():
        return f"未安装：找不到 {target}"
    if not target.is_dir():
        return f"卸载失败：{target} 不是目录"
    shutil.rmtree(target)
    return f"已卸载 plugin {name!r}（删除 {target}）"


# ---------------------------------------------------------------------------
# skill
# ---------------------------------------------------------------------------


def install_skill(artifact: dict[str, Any]) -> str:
    """Skill 当前不支持手动 install；返回友好提示。"""
    name = (artifact.get("name") or "<unknown>").strip()
    return (
        f"暂不支持手动安装 skill {name!r}：让 AIForge 推荐器在 prompt "
        "命中时自动注入即可，无需本地落盘。"
    )


# ---------------------------------------------------------------------------
# 扫描本地已安装清单
# ---------------------------------------------------------------------------


def list_installed() -> dict[str, list[str]]:
    """扫描本地，返回 ``{"mcps": [...], "plugins": [...]}``。"""
    mcps: list[str] = []
    plugins: list[str] = []

    settings = _read_settings()
    servers = settings.get("mcpServers")
    if isinstance(servers, dict):
        mcps = sorted(str(k) for k in servers.keys())

    if _PLUGINS_DIR.is_dir():
        for entry in sorted(_PLUGINS_DIR.iterdir()):
            if entry.is_dir() and not entry.name.startswith("."):
                plugins.append(entry.name)

    return {"mcps": mcps, "plugins": plugins}
