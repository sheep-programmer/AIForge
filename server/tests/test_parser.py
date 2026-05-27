"""parser.parse_skill_file 单元测试。"""

from __future__ import annotations

from pathlib import Path

import pytest

from aiforge.ingestion.parser import ParsedSkill, parse_skill_file


def _write(tmp_path: Path, content: str) -> Path:
    """写一个临时 SKILL.md 并返回路径。"""
    path = tmp_path / "SKILL.md"
    path.write_text(content, encoding="utf-8")
    return path


def test_valid_frontmatter_parses_successfully(tmp_path: Path) -> None:
    """合法 frontmatter 必须返回完整 ParsedSkill。"""
    path = _write(
        tmp_path,
        """---
name: security-review
description: 审计代码安全风险
---
# Body

正文内容。
""",
    )
    result = parse_skill_file(path)
    assert result is not None
    assert isinstance(result, ParsedSkill)
    assert result.name == "security-review"
    assert result.description == "审计代码安全风险"
    assert "正文内容" in result.body


def test_missing_name_returns_none(tmp_path: Path) -> None:
    """缺 name 字段必须返回 None。"""
    path = _write(
        tmp_path,
        """---
description: 只有 description
---
body
""",
    )
    assert parse_skill_file(path) is None


def test_missing_description_returns_none(tmp_path: Path) -> None:
    """缺 description 字段必须返回 None。"""
    path = _write(
        tmp_path,
        """---
name: only-name
---
body
""",
    )
    assert parse_skill_file(path) is None


def test_empty_body_is_accepted(tmp_path: Path) -> None:
    """body 为空仍然合法，但 body_tokens 至少为 1。"""
    path = _write(
        tmp_path,
        """---
name: empty-body
description: 没有正文
---
""",
    )
    result = parse_skill_file(path)
    assert result is not None
    assert result.body.strip() == ""
    assert result.body_tokens >= 1  # _estimate_tokens 保证下限是 1


def test_body_tokens_estimate_is_reasonable(tmp_path: Path) -> None:
    """body_tokens 应接近 len(body)//4。"""
    body = "a" * 400  # 400 字符 → 约 100 token
    path = _write(
        tmp_path,
        f"""---
name: long-body
description: 长正文
---
{body}
""",
    )
    result = parse_skill_file(path)
    assert result is not None
    # body 包含原字符串和可能的尾部换行，估算 ±10% 内
    assert 90 <= result.body_tokens <= 110


def test_utf8_chinese_body_is_preserved(tmp_path: Path) -> None:
    """中文 body 必须完整保留（UTF-8 字节正确解码）。"""
    chinese = "这是一段中文。包含特殊符号：🎯 测试。"
    path = _write(
        tmp_path,
        f"""---
name: chinese-skill
description: 中文测试
---
{chinese}
""",
    )
    result = parse_skill_file(path)
    assert result is not None
    assert chinese in result.body


def test_blank_name_string_returns_none(tmp_path: Path) -> None:
    """name 是空白字符串视为缺失。"""
    path = _write(
        tmp_path,
        """---
name: "   "
description: 描述
---
body
""",
    )
    assert parse_skill_file(path) is None


def test_nonexistent_file_returns_none(tmp_path: Path) -> None:
    """读不到的文件返回 None（不抛异常）。"""
    assert parse_skill_file(tmp_path / "does-not-exist.md") is None


@pytest.mark.parametrize(
    "name_val,desc_val,expect_none",
    [
        ("good", "good", False),
        ("", "good", True),
        ("good", "", True),
        (None, "good", True),
        ("good", None, True),
    ],
)
def test_required_field_parametrized(
    tmp_path: Path, name_val: str | None, desc_val: str | None, expect_none: bool
) -> None:
    """参数化覆盖 name/description 各种缺失组合。"""
    lines = ["---"]
    if name_val is not None:
        lines.append(f'name: "{name_val}"')
    if desc_val is not None:
        lines.append(f'description: "{desc_val}"')
    lines.append("---")
    lines.append("body")
    path = _write(tmp_path, "\n".join(lines))
    result = parse_skill_file(path)
    if expect_none:
        assert result is None
    else:
        assert result is not None
