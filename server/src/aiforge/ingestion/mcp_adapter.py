"""MCP artifact 适配：把检测到的元数据规范化成入库需要的字段。

输出与 ``extension-spec.md §1.1`` 的 ``mcp_config`` JSON 一致；name /
description / body 一并产出供 pipeline 写表与 embedding。
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import structlog

from aiforge.ingestion.detectors import DetectedArtifact

logger = structlog.get_logger(__name__)


# body 摘录长度（MCP 不需要全文，留个简短描述给 reranker 看）
_MCP_BODY_LIMIT = 2000


@dataclass(frozen=True, slots=True)
class ParsedMcp:
    """解析后的 MCP artifact，pipeline 直接消费。"""

    name: str
    description: str
    body: str
    body_tokens: int
    mcp_config: dict[str, Any]


def _estimate_tokens(text: str) -> int:
    """与 parser._estimate_tokens 一致：4 字符/ token 近似。"""
    return max(1, len(text) // 4)


def _readme_excerpt(repo_dir: Path, limit: int = _MCP_BODY_LIMIT) -> str:
    """读 README.md 前 ``limit`` 字符，没有则返回空串。"""
    for name in ("README.md", "readme.md", "Readme.md", "README.MD"):
        path = repo_dir / name
        if path.is_file():
            try:
                return path.read_text(encoding="utf-8", errors="ignore")[:limit]
            except OSError as exc:
                logger.warning("mcp_adapter.readme_failed", path=str(path), error=str(exc))
                return ""
    return ""


def _coerce_str(value: Any, default: str = "") -> str:
    """安全转字符串，None / 非字符串都退化为 default。"""
    if isinstance(value, str):
        return value.strip()
    return default


def _normalize_mcp_config(raw: dict[str, Any]) -> dict[str, Any]:
    """把外部 ``mcp.json`` / ``mcpServers`` 项规范成 spec §1.1 结构。

    输入可能是三种形态：
      1. 已经是单个 server 的扁平结构（含 ``command`` 或 ``url``）
      2. 形如 ``{"mcpServers": {"name": {...}}}`` 的多服务包装
      3. 不规则结构 —— 尽量保留 transport / command / args / env / url。
    """
    # 1. 已含 mcpServers 包装：拿第一项（通常仓库只有一个）
    servers = raw.get("mcpServers")
    if isinstance(servers, dict) and servers:
        first_name = next(iter(servers))
        inner = servers[first_name]
        if isinstance(inner, dict):
            return _normalize_mcp_config(inner)

    # 2. 直接 server 结构
    config: dict[str, Any] = {}

    url = _coerce_str(raw.get("url"))
    transport = _coerce_str(raw.get("transport"))

    if url:
        # http / sse 类型
        config["transport"] = transport or "http"
        config["url"] = url
        headers = raw.get("headers")
        if isinstance(headers, dict):
            config["headers"] = headers
        return config

    command = _coerce_str(raw.get("command"))
    if command:
        config["transport"] = transport or "stdio"
        config["command"] = command
        args = raw.get("args")
        if isinstance(args, list):
            # 只保留字符串 arg，避免奇怪类型污染 JSON 列
            config["args"] = [a for a in args if isinstance(a, str)]
        env = raw.get("env")
        if isinstance(env, dict):
            # env 全部强转字符串，便于后续直接 spawn
            config["env"] = {str(k): str(v) for k, v in env.items()}
        return config

    # 3. 兜底：标个 transport=stdio，尽量保留可能的 args，由用户/Phase4 补全
    if transport:
        config["transport"] = transport
    else:
        config["transport"] = "stdio"
    args = raw.get("args")
    if isinstance(args, list):
        config["args"] = [a for a in args if isinstance(a, str)]
    return config


def _config_from_package_json(pkg: dict[str, Any]) -> dict[str, Any]:
    """从 ``package.json`` 推断一个 stdio 启动条目。

    typical npm MCP server：``npx -y <package_name>``。如果包名缺失就只标
    transport=stdio，让安装命令在 Phase 4 由用户补齐。
    """
    config: dict[str, Any] = {"transport": "stdio"}
    pkg_name = _coerce_str(pkg.get("name"))
    if pkg_name:
        config["command"] = "npx"
        config["args"] = ["-y", pkg_name]
    return config


def parse_mcp(detected: DetectedArtifact, repo_dir: Path) -> ParsedMcp | None:
    """把 ``DetectedArtifact(kind='mcp')`` 转成 ``ParsedMcp``。

    ``repo_dir`` 用于补取 README / package.json 缺漏的信息。失败返回 None。
    """
    if detected.kind != "mcp":
        return None

    meta = detected.metadata
    origin = meta.get("origin")
    repo_name = repo_dir.name  # 兜底用：通常是 GitHub repo 名

    name = ""
    description = ""
    raw_config: dict[str, Any] | None = None

    if origin == "config_file":
        cfg = meta.get("config")
        if isinstance(cfg, dict):
            raw_config = cfg
            name = _coerce_str(cfg.get("name"))
            description = _coerce_str(cfg.get("description"))
    elif origin == "package_json":
        pkg = meta.get("package")
        if isinstance(pkg, dict):
            name = _coerce_str(pkg.get("mcpName")) or _coerce_str(pkg.get("name"))
            description = _coerce_str(pkg.get("description"))
            # package.json 可能在顶层带 mcp 块；优先用之
            mcp_block = pkg.get("mcp")
            if isinstance(mcp_block, dict):
                raw_config = mcp_block
            else:
                raw_config = _config_from_package_json(pkg)
    elif origin == "readme":
        # README 触发的命中没有结构化 config，留空结构让 Phase 4 补齐
        raw_config = {"transport": "stdio"}

    # 补 description：README 摘录
    readme_body = _readme_excerpt(repo_dir, limit=_MCP_BODY_LIMIT)
    if not description:
        # 从 README 第一段挑出非空首行作为描述兜底
        for line in readme_body.splitlines():
            stripped = line.strip().lstrip("#").strip()
            if stripped and not stripped.startswith("!["):
                description = stripped[:256]
                break

    if not name:
        name = repo_name or "mcp-server"
    if not description:
        description = f"MCP server from {repo_name}"

    mcp_config = _normalize_mcp_config(raw_config or {})

    # body：优先 README 摘录，否则用 description
    body = readme_body or description
    body = body[:_MCP_BODY_LIMIT]

    logger.info(
        "mcp_adapter.parsed",
        name=name,
        transport=mcp_config.get("transport"),
        origin=origin,
    )
    return ParsedMcp(
        name=name,
        description=description,
        body=body,
        body_tokens=_estimate_tokens(body),
        mcp_config=mcp_config,
    )
