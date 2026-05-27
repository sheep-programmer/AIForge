"""github.normalize_repo_url + parse_owner_repo 单元测试。"""

from __future__ import annotations

import pytest

from aiforge.ingestion.github import (
    GitHubURLError,
    normalize_repo_url,
    parse_owner_repo,
)


@pytest.mark.parametrize(
    "url,expected_owner,expected_repo",
    [
        ("https://github.com/anthropic/skills", "anthropic", "skills"),
        ("https://github.com/anthropic/skills.git", "anthropic", "skills"),
        ("https://github.com/anthropic/skills/", "anthropic", "skills"),
        ("http://github.com/owner/repo", "owner", "repo"),
        ("https://github.example.com/owner/repo", "owner", "repo"),
    ],
)
def test_parse_owner_repo_valid(url: str, expected_owner: str, expected_repo: str) -> None:
    """合法 URL 应正确抽出 owner/repo。"""
    owner, repo = parse_owner_repo(url)
    assert owner == expected_owner
    assert repo == expected_repo


@pytest.mark.parametrize(
    "url",
    [
        "",
        "not-a-url",
        "https://github.com/",
        "https://github.com/onlyowner",
        "https://github.com/a/b/c/d",  # 路径过深
        "ftp:///bad",  # 无 netloc
    ],
)
def test_parse_owner_repo_invalid_raises(url: str) -> None:
    """非法 URL 抛 GitHubURLError（继承 ValueError）。"""
    with pytest.raises(ValueError):
        parse_owner_repo(url)


def test_normalize_strips_git_suffix() -> None:
    """.git 后缀应被去掉。"""
    assert (
        normalize_repo_url("https://github.com/anthropic/skills.git")
        == "https://github.com/anthropic/skills"
    )


def test_normalize_strips_trailing_slash() -> None:
    """尾斜杠应被去掉。"""
    assert (
        normalize_repo_url("https://github.com/anthropic/skills/")
        == "https://github.com/anthropic/skills"
    )


def test_normalize_preserves_scheme() -> None:
    """scheme（http vs https）必须保留，不强制改写。"""
    assert normalize_repo_url("http://github.com/o/r") == "http://github.com/o/r"
    assert normalize_repo_url("https://github.com/o/r") == "https://github.com/o/r"


def test_normalize_idempotent() -> None:
    """对已归一化的 URL 再 normalize 结果不变。"""
    canonical = "https://github.com/owner/repo"
    assert normalize_repo_url(canonical) == canonical
    assert normalize_repo_url(normalize_repo_url(canonical)) == canonical


def test_normalize_invalid_raises() -> None:
    """非法 URL 同样抛 GitHubURLError。"""
    with pytest.raises(GitHubURLError):
        normalize_repo_url("not://valid")
