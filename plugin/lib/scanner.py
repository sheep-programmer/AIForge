"""本机 AI agent 环境扫描器。

自动发现主流 coding agent 的配置目录，列出**已安装**的 MCP server / plugin / skill：

- Claude Code   ~/.claude/{settings.json, plugins/, skills/} + ~/.claude.json
- Codex (OpenAI) ~/.codex/config.toml  ([mcp_servers.*])
- Cursor        ~/.cursor/mcp.json + 项目 .cursor/mcp.json
- Gemini CLI    ~/.gemini/settings.json
- Windsurf      ~/.codeium/windsurf/mcp_config.json
- VS Code       ~/.config/Code/User/mcp.json（原生 MCP）

设计原则：
- **只读，绝不执行任何被发现的命令**
- MCP 的 ``env`` 值一律脱敏成 ``"***"``（key 名保留），避免把 API key 回传给（可能远程的）服务端
- 任何单个 agent 解析失败不影响其它 agent —— 局部 try/except + 跳过
- 仅 stdlib（json / tomllib / pathlib / socket / os），保持插件零三方依赖
"""

from __future__ import annotations

import json
import os
import socket
import tomllib
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

HOME = Path.home()


# ---------------------------------------------------------------------------
# 数据结构（普通 dict，方便 JSON 序列化）
# ---------------------------------------------------------------------------


def _mcp_entry(name: str, raw: dict[str, Any], source: str) -> dict[str, Any]:
    """把一份 MCP 配置归一化 + 脱敏。"""
    transport = "stdio"
    if isinstance(raw.get("url"), str):
        transport = str(raw.get("type") or raw.get("transport") or "http")
    elif raw.get("type") or raw.get("transport"):
        transport = str(raw.get("type") or raw.get("transport"))

    # env 脱敏：保留 key 名，值替换成 ***
    env_keys: list[str] = []
    env_raw = raw.get("env")
    if isinstance(env_raw, dict):
        env_keys = sorted(str(k) for k in env_raw)

    return {
        "name": name,
        "transport": transport,
        "command": raw.get("command"),
        "args": raw.get("args") if isinstance(raw.get("args"), list) else None,
        "url": raw.get("url"),
        "env_keys": env_keys,  # 仅 key 名，值已脱敏
        "source": source,
    }


def _read_json(path: Path) -> dict[str, Any] | None:
    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else None
    except (OSError, json.JSONDecodeError):
        return None


def _read_toml(path: Path) -> dict[str, Any] | None:
    try:
        with path.open("rb") as f:
            return tomllib.load(f)
    except (OSError, tomllib.TOMLDecodeError):
        return None


def _mcps_from_json(path: Path, key: str = "mcpServers") -> list[dict[str, Any]]:
    """从一个 JSON 文件的 ``mcpServers`` 段提取 MCP。"""
    data = _read_json(path)
    if not data:
        return []
    servers = data.get(key)
    if not isinstance(servers, dict):
        return []
    out: list[dict[str, Any]] = []
    for name, cfg in servers.items():
        if isinstance(cfg, dict):
            out.append(_mcp_entry(str(name), cfg, _short(path)))
    return out


def _short(path: Path) -> str:
    """把绝对路径缩成 ~ 形式，便于展示。"""
    try:
        return "~/" + str(path.relative_to(HOME))
    except ValueError:
        return str(path)


# ---------------------------------------------------------------------------
# 各 agent 的探测器
# ---------------------------------------------------------------------------


def _scan_claude_code(cwd: Path) -> dict[str, Any]:
    home = HOME / ".claude"
    config_paths: list[str] = []
    mcps: list[dict[str, Any]] = []
    plugins: list[dict[str, Any]] = []
    skills: list[dict[str, Any]] = []

    # MCP 来自三处：~/.claude/settings.json、~/.claude.json、项目 .mcp.json / .claude/settings.json
    for p, key in (
        (home / "settings.json", "mcpServers"),
        (HOME / ".claude.json", "mcpServers"),
        (cwd / ".mcp.json", "mcpServers"),
        (cwd / ".claude" / "settings.json", "mcpServers"),
    ):
        if p.is_file():
            config_paths.append(_short(p))
            mcps.extend(_mcps_from_json(p, key))

    # plugins：优先读权威清单 ~/.claude/plugins/installed_plugins.json
    plugins_dir = home / "plugins"
    installed_manifest = plugins_dir / "installed_plugins.json"
    _INTERNAL_DIRS = {"cache", "data", "repos", "marketplaces"}
    if installed_manifest.is_file():
        data = _read_json(installed_manifest)
        entries = (data or {}).get("plugins")
        if isinstance(entries, dict):
            for key, records in entries.items():
                # key 形如 "frontend-design@claude-plugins-official"
                name, _, marketplace = str(key).partition("@")
                rec = records[0] if isinstance(records, list) and records else {}
                plugins.append(
                    {
                        "name": name,
                        "marketplace": marketplace or None,
                        "scope": rec.get("scope") if isinstance(rec, dict) else None,
                        "version": rec.get("version") if isinstance(rec, dict) else None,
                        "path": rec.get("installPath") if isinstance(rec, dict) else None,
                    }
                )
    elif plugins_dir.is_dir():
        # 回退：目录扫描，跳过 Claude Code 内部目录
        for entry in sorted(plugins_dir.iterdir()):
            if not entry.is_dir() or entry.name.startswith(".") or entry.name in _INTERNAL_DIRS:
                continue
            manifest = entry / ".claude-plugin" / "plugin.json"
            if not manifest.is_file():
                continue
            m = _read_json(manifest)
            plugins.append(
                {
                    "name": entry.name,
                    "version": (m or {}).get("version"),
                    "path": _short(entry),
                }
            )

    # skills：~/.claude/skills/<name>/SKILL.md
    skills_dir = home / "skills"
    if skills_dir.is_dir():
        for entry in sorted(skills_dir.iterdir()):
            if entry.is_dir() and (entry / "SKILL.md").is_file():
                skills.append({"name": entry.name, "path": _short(entry)})

    detected = home.is_dir() or (HOME / ".claude.json").is_file()
    return _agent_result("claude-code", "Claude Code", detected, config_paths, mcps, plugins, skills)


def _scan_codex(cwd: Path) -> dict[str, Any]:
    home = HOME / ".codex"
    config_paths: list[str] = []
    mcps: list[dict[str, Any]] = []

    cfg = home / "config.toml"
    if cfg.is_file():
        config_paths.append(_short(cfg))
        data = _read_toml(cfg)
        if data:
            # Codex: [mcp_servers.NAME] 段
            servers = data.get("mcp_servers")
            if isinstance(servers, dict):
                for name, raw in servers.items():
                    if isinstance(raw, dict):
                        mcps.append(_mcp_entry(str(name), raw, _short(cfg)))

    return _agent_result("codex", "Codex", home.is_dir(), config_paths, mcps, [], [])


def _scan_cursor(cwd: Path) -> dict[str, Any]:
    config_paths: list[str] = []
    mcps: list[dict[str, Any]] = []
    for p in (HOME / ".cursor" / "mcp.json", cwd / ".cursor" / "mcp.json"):
        if p.is_file():
            config_paths.append(_short(p))
            mcps.extend(_mcps_from_json(p))
    detected = (HOME / ".cursor").is_dir()
    return _agent_result("cursor", "Cursor", detected, config_paths, mcps, [], [])


def _scan_gemini(cwd: Path) -> dict[str, Any]:
    p = HOME / ".gemini" / "settings.json"
    config_paths: list[str] = []
    mcps: list[dict[str, Any]] = []
    if p.is_file():
        config_paths.append(_short(p))
        mcps = _mcps_from_json(p)
    return _agent_result("gemini-cli", "Gemini CLI", (HOME / ".gemini").is_dir(), config_paths, mcps, [], [])


def _scan_windsurf(cwd: Path) -> dict[str, Any]:
    p = HOME / ".codeium" / "windsurf" / "mcp_config.json"
    config_paths: list[str] = []
    mcps: list[dict[str, Any]] = []
    if p.is_file():
        config_paths.append(_short(p))
        mcps = _mcps_from_json(p)
    return _agent_result("windsurf", "Windsurf", p.parent.is_dir(), config_paths, mcps, [], [])


def _scan_vscode(cwd: Path) -> dict[str, Any]:
    # VS Code 原生 MCP：~/.config/Code/User/mcp.json（Linux）；mac 在 Application Support
    candidates = [
        HOME / ".config" / "Code" / "User" / "mcp.json",
        HOME / "Library" / "Application Support" / "Code" / "User" / "mcp.json",
    ]
    config_paths: list[str] = []
    mcps: list[dict[str, Any]] = []
    for p in candidates:
        if p.is_file():
            config_paths.append(_short(p))
            # VS Code 用 "servers" 而非 "mcpServers"
            mcps.extend(_mcps_from_json(p, key="servers"))
            mcps.extend(_mcps_from_json(p, key="mcpServers"))
    return _agent_result("vscode", "VS Code", bool(config_paths), config_paths, mcps, [], [])


def _agent_result(
    agent: str,
    display: str,
    detected: bool,
    config_paths: list[str],
    mcps: list[dict[str, Any]],
    plugins: list[dict[str, Any]],
    skills: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "agent": agent,
        "display": display,
        "detected": detected,
        "config_paths": config_paths,
        "mcps": mcps,
        "plugins": plugins,
        "skills": skills,
        "counts": {"mcp": len(mcps), "plugin": len(plugins), "skill": len(skills)},
    }


_SCANNERS = (
    _scan_claude_code,
    _scan_codex,
    _scan_cursor,
    _scan_gemini,
    _scan_windsurf,
    _scan_vscode,
)


# ---------------------------------------------------------------------------
# 顶层入口
# ---------------------------------------------------------------------------


def scan_environment(cwd: Path | None = None, *, include_undetected: bool = False) -> dict[str, Any]:
    """扫描本机所有已知 agent。返回结构化 inventory（已脱敏，可安全 POST 给服务端）。"""
    cwd = cwd or Path.cwd()
    agents: list[dict[str, Any]] = []
    for fn in _SCANNERS:
        try:
            res = fn(cwd)
        except Exception as exc:  # 单个 agent 失败不拖垮整体
            res = _agent_result(fn.__name__, fn.__name__, False, [], [], [], [])
            res["error"] = str(exc)[:200]
        if res["detected"] or include_undetected:
            agents.append(res)

    totals = {"mcp": 0, "plugin": 0, "skill": 0}
    for a in agents:
        for k in totals:
            totals[k] += a["counts"][k]

    return {
        "machine": socket.gethostname(),
        "scanned_at": datetime.now(timezone.utc).isoformat(),
        "cwd": str(cwd),
        "agents": agents,
        "totals": totals,
    }
