"""仓库 artifact 检测：识别 plugin / mcp / skill 三类标的。

按 ``extension-spec.md §4.2`` 的优先级在仓库根做轻量探测，返回
``DetectedArtifact`` 列表。纯函数无副作用，方便单测和 splitter 复用。
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

import structlog

logger = structlog.get_logger(__name__)


# 检测结果使用的 artifact 类型，与 ``models.ArtifactType`` 对齐
DetectedKind = Literal["skill", "mcp", "plugin"]


@dataclass(frozen=True, slots=True)
class DetectedArtifact:
    """一次检测到的 artifact 候选。

    ``source_path`` 是相对仓库根的 POSIX 风格路径，作为 ``Skill.source_path``
    与稳定主键 hash 的输入；``metadata`` 透传给后续 adapter 用，避免 adapter
    再次 IO。
    """

    kind: DetectedKind
    source_path: str
    metadata: dict[str, Any] = field(default_factory=dict)


# README 头部用于判定的 MCP 关键词（大小写不敏感）
_MCP_README_PATTERN = re.compile(r"MCP server|Model Context Protocol", re.IGNORECASE)

# 仓库根可能放 MCP 配置的几种约定文件名
_MCP_CONFIG_CANDIDATES: tuple[str, ...] = (
    "mcp.json",
    "mcp-server.json",
    ".mcp/config.json",
)


def _safe_load_json(path: Path) -> dict[str, Any] | None:
    """容错读 JSON：不存在/解析失败都返回 None 并 warn。"""
    try:
        with path.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
    except FileNotFoundError:
        return None
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("detect.json_load_failed", path=str(path), error=str(exc))
        return None
    if not isinstance(data, dict):
        logger.warning("detect.json_not_object", path=str(path))
        return None
    return data


def _readme_head(repo_dir: Path, limit: int = 500) -> str:
    """读 README.md 前 ``limit`` 字符；无 README 返回空串。"""
    # 常见大小写变体都试一遍
    for name in ("README.md", "readme.md", "Readme.md", "README.MD"):
        candidate = repo_dir / name
        if candidate.is_file():
            try:
                return candidate.read_text(encoding="utf-8", errors="ignore")[:limit]
            except OSError as exc:
                logger.warning("detect.readme_read_failed", path=str(candidate), error=str(exc))
                return ""
    return ""


def detect_plugin(repo_dir: Path) -> DetectedArtifact | None:
    """规则 1：仓库根有 ``.claude-plugin/plugin.json`` 即视为 plugin。"""
    manifest_path = repo_dir / ".claude-plugin" / "plugin.json"
    if not manifest_path.is_file():
        return None
    manifest = _safe_load_json(manifest_path)
    if manifest is None:
        return None
    logger.info("detect.plugin_hit", path=".claude-plugin/plugin.json")
    return DetectedArtifact(
        kind="plugin",
        source_path=".claude-plugin/plugin.json",
        metadata={"manifest": manifest},
    )


def _detect_mcp_from_config_file(repo_dir: Path) -> DetectedArtifact | None:
    """规则 2-a：根目录候选文件之一存在即命中。"""
    for rel in _MCP_CONFIG_CANDIDATES:
        candidate = repo_dir / rel
        if not candidate.is_file():
            continue
        data = _safe_load_json(candidate)
        if data is None:
            continue
        logger.info("detect.mcp_hit", source="config_file", path=rel)
        return DetectedArtifact(
            kind="mcp",
            source_path=rel,
            metadata={"config": data, "origin": "config_file"},
        )
    return None


def _detect_mcp_from_package_json(repo_dir: Path) -> DetectedArtifact | None:
    """规则 2-b：``package.json`` 含 ``mcpName`` 或 keywords 命中 MCP。"""
    pkg_path = repo_dir / "package.json"
    if not pkg_path.is_file():
        return None
    pkg = _safe_load_json(pkg_path)
    if pkg is None:
        return None

    has_mcp_name = isinstance(pkg.get("mcpName"), str) and pkg["mcpName"].strip()
    keywords = pkg.get("keywords")
    keyword_hit = False
    if isinstance(keywords, list):
        lowered = {k.lower() for k in keywords if isinstance(k, str)}
        keyword_hit = bool(lowered & {"mcp", "model-context-protocol"})

    if not (has_mcp_name or keyword_hit):
        return None

    logger.info(
        "detect.mcp_hit",
        source="package_json",
        has_mcp_name=bool(has_mcp_name),
        keyword_hit=keyword_hit,
    )
    return DetectedArtifact(
        kind="mcp",
        source_path="package.json",
        metadata={"package": pkg, "origin": "package_json"},
    )


def _detect_mcp_from_readme(repo_dir: Path) -> DetectedArtifact | None:
    """规则 2-c：README 前 500 字符匹配 MCP 关键词。"""
    head = _readme_head(repo_dir, limit=500)
    if not head or not _MCP_README_PATTERN.search(head):
        return None
    logger.info("detect.mcp_hit", source="readme")
    return DetectedArtifact(
        kind="mcp",
        source_path="README.md",
        metadata={"readme_excerpt": head, "origin": "readme"},
    )


def detect_mcp(repo_dir: Path) -> DetectedArtifact | None:
    """规则 2 总入口：按 config_file → package.json → readme 顺序匹配。"""
    for fn in (
        _detect_mcp_from_config_file,
        _detect_mcp_from_package_json,
        _detect_mcp_from_readme,
    ):
        hit = fn(repo_dir)
        if hit is not None:
            return hit
    return None


def detect_artifacts(repo_dir: Path) -> list[DetectedArtifact]:
    """按规则探测仓库根的 plugin/mcp 候选。

    skill 走老路径（``splitter.find_skills``），不在这里枚举；调用方需
    把这里的结果与 ``find_skills`` 合并。返回顺序：plugin → mcp。
    """
    repo_dir = repo_dir.resolve()
    found: list[DetectedArtifact] = []
    plugin = detect_plugin(repo_dir)
    if plugin is not None:
        found.append(plugin)
    mcp = detect_mcp(repo_dir)
    if mcp is not None:
        found.append(mcp)
    logger.info("detect.summary", root=str(repo_dir), count=len(found))
    return found
