"""splitter.find_skills 单元测试。"""

from __future__ import annotations

from pathlib import Path

from aiforge.ingestion.splitter import find_skills


def test_finds_three_skills_in_sample_repo(sample_skill_repo: Path) -> None:
    """sample_skill_repo fixture 含 alpha/beta/gamma 三个有效 SKILL.md。"""
    results = find_skills(sample_skill_repo)
    assert len(results) == 3
    names = {parsed.name for _, parsed in results}
    assert names == {"example-skill", "beta-skill", "gamma-skill"}


def test_skips_node_modules(sample_skill_repo: Path) -> None:
    """node_modules 下的 SKILL.md 必须被剪掉。"""
    results = find_skills(sample_skill_repo)
    # fixture 在 node_modules/SKILL.md 写了 "garbage"，若被解析必然失败
    # 但更强的断言：返回路径里不含 node_modules
    for rel_path, _ in results:
        assert "node_modules" not in rel_path.parts


def test_empty_directory_returns_empty_list(tmp_path: Path) -> None:
    """空目录下无 SKILL.md，返回空列表。"""
    empty = tmp_path / "empty"
    empty.mkdir()
    assert find_skills(empty) == []


def test_deeply_nested_skill_is_found(tmp_path: Path) -> None:
    """深嵌套层级也能找到。"""
    deep = tmp_path / "a" / "b" / "c" / "d" / "e" / "f" / "skill"
    deep.mkdir(parents=True)
    (deep / "SKILL.md").write_text(
        """---
name: deep-skill
description: 深嵌套测试
---
body
""",
        encoding="utf-8",
    )
    results = find_skills(tmp_path)
    assert len(results) == 1
    assert results[0][1].name == "deep-skill"


def test_invalid_skill_is_skipped_not_raised(tmp_path: Path) -> None:
    """frontmatter 缺字段的 SKILL.md 应该被跳过而非抛错。"""
    bad = tmp_path / "bad"
    bad.mkdir()
    (bad / "SKILL.md").write_text("no frontmatter at all", encoding="utf-8")

    good = tmp_path / "good"
    good.mkdir()
    (good / "SKILL.md").write_text(
        """---
name: good
description: 有效
---
body
""",
        encoding="utf-8",
    )
    results = find_skills(tmp_path)
    assert len(results) == 1
    assert results[0][1].name == "good"


def test_skips_common_build_dirs(tmp_path: Path) -> None:
    """.git / __pycache__ / dist 等都应被剪枝。"""
    for d in [".git", "__pycache__", "dist", "build", ".venv"]:
        (tmp_path / d).mkdir()
        (tmp_path / d / "SKILL.md").write_text(
            """---
name: junk
description: 不该被收
---
""",
            encoding="utf-8",
        )
    results = find_skills(tmp_path)
    assert results == []


def test_returns_relative_paths(sample_skill_repo: Path) -> None:
    """返回的路径相对于 repo_dir，绝对路径不应出现在结果里。"""
    results = find_skills(sample_skill_repo)
    for rel_path, _ in results:
        assert not rel_path.is_absolute()
