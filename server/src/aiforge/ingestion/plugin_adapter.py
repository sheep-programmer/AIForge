"""Plugin artifact 适配：把 ``.claude-plugin/plugin.json`` 规范化入库。

输出与 ``extension-spec.md §1.2`` 的 ``plugin_manifest`` JSON 一致；同时
产出 name / description / body 供 pipeline 写表与 embedding。
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import structlog

from aiforge.ingestion.detectors import DetectedArtifact

logger = structlog.get_logger(__name__)


# Plugin body 上限：README 全文有助 reranker，但要防止过长撑爆 sqlite 行
_PLUGIN_BODY_LIMIT = 8000

# 透传到 plugin_manifest 的关键字段（其余忽略，避免引入无序字段）
_MANIFEST_KEYS: tuple[str, ...] = (
    "name",
    "version",
    "description",
    "commands",
    "hooks",
    "skills",
    "mcpServers",
    "author",
    "homepage",
    "license",
)


@dataclass(frozen=True, slots=True)
class ParsedPlugin:
    """解析后的 plugin artifact，pipeline 直接消费。"""

    name: str
    description: str
    body: str
    body_tokens: int
    plugin_manifest: dict[str, Any]


def _estimate_tokens(text: str) -> int:
    return max(1, len(text) // 4)


def _readme_body(repo_dir: Path, limit: int = _PLUGIN_BODY_LIMIT) -> str:
    """读 README.md 全文，截到 ``limit`` 字符。"""
    for name in ("README.md", "readme.md", "Readme.md", "README.MD"):
        path = repo_dir / name
        if path.is_file():
            try:
                return path.read_text(encoding="utf-8", errors="ignore")[:limit]
            except OSError as exc:
                logger.warning("plugin_adapter.readme_failed", path=str(path), error=str(exc))
                return ""
    return ""


def _coerce_str(value: Any, default: str = "") -> str:
    if isinstance(value, str):
        return value.strip()
    return default


def _project_manifest(raw: dict[str, Any], source_url: str) -> dict[str, Any]:
    """从原 manifest 抽取保留字段，并补 ``manifest_path`` / ``install_url``。"""
    manifest: dict[str, Any] = {}
    for key in _MANIFEST_KEYS:
        if key in raw:
            manifest[key] = raw[key]
    manifest["manifest_path"] = ".claude-plugin/plugin.json"
    if source_url:
        manifest["install_url"] = source_url
    return manifest


def parse_plugin(
    detected: DetectedArtifact,
    repo_dir: Path,
    source_url: str,
) -> ParsedPlugin | None:
    """把 ``DetectedArtifact(kind='plugin')`` 转成 ``ParsedPlugin``。

    name / description 缺失时回退到仓库名 / README 第一行；保证必有值。
    """
    if detected.kind != "plugin":
        return None

    raw = detected.metadata.get("manifest")
    if not isinstance(raw, dict):
        logger.warning("plugin_adapter.missing_manifest", path=detected.source_path)
        return None

    name = _coerce_str(raw.get("name")) or repo_dir.name or "claude-plugin"
    description = _coerce_str(raw.get("description"))

    body = _readme_body(repo_dir, limit=_PLUGIN_BODY_LIMIT)
    if not description:
        # 从 README 找非空首行兜底；plugin manifest 偶尔会漏 description
        for line in body.splitlines():
            stripped = line.strip().lstrip("#").strip()
            if stripped and not stripped.startswith("!["):
                description = stripped[:256]
                break
    if not description:
        description = f"Claude Code plugin: {name}"

    manifest = _project_manifest(raw, source_url=source_url)

    if not body:
        body = description

    logger.info(
        "plugin_adapter.parsed",
        name=name,
        version=manifest.get("version"),
        commands=len(manifest.get("commands") or []),
    )
    return ParsedPlugin(
        name=name,
        description=description,
        body=body,
        body_tokens=_estimate_tokens(body),
        plugin_manifest=manifest,
    )
