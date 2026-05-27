"""SKILL.md 解析：frontmatter + body。"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import frontmatter
import structlog

logger = structlog.get_logger(__name__)


@dataclass(frozen=True, slots=True)
class ParsedSkill:
    """单个 SKILL.md 解析结果。"""

    name: str
    description: str
    body: str
    body_tokens: int


def _estimate_tokens(text: str) -> int:
    """粗略 token 数：按 4 字符/ token 估算，足够预算控制使用。"""
    return max(1, len(text) // 4)


def parse_skill_file(path: Path) -> ParsedSkill | None:
    """解析一个 SKILL.md。frontmatter 缺 name/description 则返回 None。"""
    try:
        post = frontmatter.load(str(path))
    except Exception as exc:
        logger.warning("skill.parse_failed", path=str(path), error=str(exc))
        return None

    name_raw = post.metadata.get("name")
    desc_raw = post.metadata.get("description")

    if not isinstance(name_raw, str) or not name_raw.strip():
        logger.warning("skill.missing_name", path=str(path))
        return None
    if not isinstance(desc_raw, str) or not desc_raw.strip():
        logger.warning("skill.missing_description", path=str(path))
        return None

    body = post.content or ""
    return ParsedSkill(
        name=name_raw.strip(),
        description=desc_raw.strip(),
        body=body,
        body_tokens=_estimate_tokens(body),
    )
