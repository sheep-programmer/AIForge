"""discovery.scorer.score_discovery 单元测试。"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from aiforge.discovery.scorer import score_discovery


def test_empty_data_returns_zero() -> None:
    """完全空字典 → 0.0。"""
    assert score_discovery({}) == 0.0


def test_high_signals_close_to_one() -> None:
    """高 stars + 多 skill + 刚推送 + has_readme → 接近 1.0。"""
    score = score_discovery(
        {
            "source_stars": 100_000,
            "skill_count": 20,
            "pushed_at": datetime.now(timezone.utc),
            "has_readme": True,
        }
    )
    assert 0.95 <= score <= 1.0


def test_old_repo_has_low_recency() -> None:
    """两年前推送的仓库 recency 项应接近 0。"""
    old = datetime.now(timezone.utc) - timedelta(days=365 * 2)
    # 只保留 recency 一项的影响
    score = score_discovery({"source_stars": 0, "skill_count": 0, "pushed_at": old})
    # 老仓库 + 没 readme + 0 stars 时总分主要由 recency 0.2*接近 0 决定
    assert score < 0.05


def test_negative_stars_does_not_crash() -> None:
    """负数 stars 应被裁剪而不是抛错。"""
    score = score_discovery({"source_stars": -100, "skill_count": -5})
    assert 0.0 <= score <= 1.0


def test_extreme_large_values_clamped_to_one() -> None:
    """极大输入仍然 ≤ 1.0。"""
    score = score_discovery(
        {
            "source_stars": 10**12,
            "skill_count": 10_000,
            "pushed_at": datetime.now(timezone.utc),
            "has_readme": True,
        }
    )
    assert 0.0 <= score <= 1.0


def test_pushed_at_as_iso_string() -> None:
    """pushed_at 是 ISO 字符串时也应被识别。"""
    iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    score = score_discovery({"source_stars": 10, "pushed_at": iso})
    assert score > 0.0


def test_pushed_at_invalid_string_is_zero_recency() -> None:
    """无法解析的字符串 → recency 算 0，不抛异常。"""
    score = score_discovery({"pushed_at": "garbage", "source_stars": 0})
    assert score == 0.0


def test_score_is_in_unit_interval() -> None:
    """所有分量裁剪后总分应落在 [0, 1]。"""
    for stars in (0, 1, 100, 100_000, 10**9):
        for cnt in (0, 1, 20, 200):
            s = score_discovery({"source_stars": stars, "skill_count": cnt})
            assert 0.0 <= s <= 1.0


@pytest.mark.parametrize("has_readme,expected_min", [(True, 0.1), (False, 0.0)])
def test_has_readme_contributes_fixed_amount(has_readme: bool, expected_min: float) -> None:
    """has_readme=True 时至少贡献 0.1 分（其他项为 0）。"""
    score = score_discovery(
        {"source_stars": 0, "skill_count": 0, "has_readme": has_readme}
    )
    assert score >= expected_min
    if not has_readme:
        assert score == 0.0
