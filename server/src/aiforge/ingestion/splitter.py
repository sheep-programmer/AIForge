"""仓库扫描：递归找 SKILL.md，逐个解析；同时识别 MCP / plugin artifact。

老接口 ``find_skills`` 保持不变；新增 ``find_mcps`` / ``find_plugins`` 调用
``detectors`` 模块在仓库根做轻量识别。
"""

from __future__ import annotations

from pathlib import Path

import structlog

from aiforge.ingestion.detectors import DetectedArtifact, detect_mcp, detect_plugin
from aiforge.ingestion.parser import ParsedSkill, parse_skill_file

logger = structlog.get_logger(__name__)


# 明显不该出现 skill 的目录，递归时整段剪掉
_PRUNE_DIRS = frozenset(
    {
        ".git",
        ".hg",
        ".svn",
        "node_modules",
        ".venv",
        "venv",
        "__pycache__",
        ".mypy_cache",
        ".pytest_cache",
        ".ruff_cache",
        "dist",
        "build",
        "target",
        "tests",
        "test",
        ".tox",
        ".idea",
        ".vscode",
    }
)


def _iter_skill_files(repo_dir: Path) -> list[Path]:
    """剪枝式递归，返回所有 SKILL.md 的绝对路径。"""
    results: list[Path] = []
    stack: list[Path] = [repo_dir]
    while stack:
        current = stack.pop()
        try:
            entries = list(current.iterdir())
        except (PermissionError, OSError) as exc:
            logger.warning("splitter.iter_failed", dir=str(current), error=str(exc))
            continue
        for entry in entries:
            if entry.is_symlink():
                # 避免符号链接循环；skill 仓库正常不依赖 symlink
                continue
            if entry.is_dir():
                if entry.name in _PRUNE_DIRS:
                    continue
                stack.append(entry)
            elif entry.is_file() and entry.name == "SKILL.md":
                results.append(entry)
    return results


def find_skills(repo_dir: Path) -> list[tuple[Path, ParsedSkill]]:
    """返回 [(SKILL.md 相对路径, ParsedSkill), ...]，跳过解析失败的条目。

    第一个元素是相对 ``repo_dir`` 的 POSIX 风格路径（用于落入 ``source_path``）。
    """
    repo_dir = repo_dir.resolve()
    files = _iter_skill_files(repo_dir)
    logger.info("splitter.found_files", count=len(files), root=str(repo_dir))

    parsed: list[tuple[Path, ParsedSkill]] = []
    for abs_path in files:
        rel = abs_path.relative_to(repo_dir)
        skill = parse_skill_file(abs_path)
        if skill is None:
            continue
        parsed.append((rel, skill))
    logger.info("splitter.parsed", total=len(files), valid=len(parsed))
    return parsed


def find_mcps(repo_dir: Path) -> list[DetectedArtifact]:
    """识别仓库根的 MCP artifact，最多返回一条。

    采用 ``detectors.detect_mcp`` 的优先级（config 文件 > package.json > README）。
    返回 list 方便和 ``find_skills`` 走同一种聚合循环。
    """
    repo_dir = repo_dir.resolve()
    hit = detect_mcp(repo_dir)
    result = [hit] if hit is not None else []
    logger.info("splitter.find_mcps", count=len(result), root=str(repo_dir))
    return result


def find_plugins(repo_dir: Path) -> list[DetectedArtifact]:
    """识别仓库根的 plugin artifact，最多返回一条。"""
    repo_dir = repo_dir.resolve()
    hit = detect_plugin(repo_dir)
    result = [hit] if hit is not None else []
    logger.info("splitter.find_plugins", count=len(result), root=str(repo_dir))
    return result
