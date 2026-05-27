"""审批队列排序打分。

score = 0.4*log(stars+1)/log(100k) + 0.3*skill_count_normalized + 0.2*recency + 0.1*has_readme
所有分量裁剪到 [0, 1]，最终 score ∈ [0, 1]。
"""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any

# 归一化基准
_STAR_DENOM = math.log(100_000.0)
_SKILL_COUNT_FULL = 20         # 20 个 SKILL.md 即认为满分
_RECENCY_HALFLIFE_DAYS = 180.0  # 180 天为衰减半衰期


def score_discovery(data: dict[str, Any]) -> float:
    """根据发现条目算质量分。

    期望字段：
      - source_stars: int
      - skill_count: int
      - pushed_at: datetime | str | None   （ISO 时间或 datetime）
      - has_readme: bool
    缺失字段按 0 处理。
    """
    # 负数 / NaN 一律视为 0：math.log 对非正数会抛 domain error
    stars = max(0.0, float(data.get("source_stars", 0) or 0))
    skill_count = max(0.0, float(data.get("skill_count", 0) or 0))
    pushed_at = data.get("pushed_at")
    has_readme = bool(data.get("has_readme", False))

    star_term = _clamp(math.log(stars + 1.0) / _STAR_DENOM, 0.0, 1.0)
    count_term = _clamp(skill_count / _SKILL_COUNT_FULL, 0.0, 1.0)
    recency_term = _recency(pushed_at)
    readme_term = 1.0 if has_readme else 0.0

    return round(
        0.4 * star_term + 0.3 * count_term + 0.2 * recency_term + 0.1 * readme_term,
        6,
    )


def _recency(value: Any) -> float:
    """指数衰减：刚推过为 1.0，180 天前为 0.5，无信息为 0。"""
    dt = _to_datetime(value)
    if dt is None:
        return 0.0
    now = datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    days = max(0.0, (now - dt).total_seconds() / 86_400.0)
    return _clamp(math.exp(-math.log(2) * days / _RECENCY_HALFLIFE_DAYS), 0.0, 1.0)


def _to_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def _clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))
