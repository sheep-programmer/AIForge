"""recommender.deduper.dedup 单元测试。

注意：Skill ORM 模型没有 ``embedding`` 列，但 ``deduper`` 通过 ``skill.embedding``
读取打包后的字节。测试里我们直接在 ORM 实例上动态附加该属性绕过这个不一致。
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from aiforge.core.db import pack_embedding
from aiforge.recommender.deduper import dedup
from tests._utils import deterministic_vec, make_skill


def _attach_embedding(skill: Any, vec: Any) -> None:
    """把 packed 向量字节挂到 Skill 实例（绕过模型未声明 embedding 列）。"""
    skill.embedding = pack_embedding(vec)


def test_semantically_equivalent_skills_collapse_to_one() -> None:
    """两个向量几乎一样的 skill 应被聚到同簇，只保留一个代表。"""
    base = deterministic_vec("security review code")

    s1 = make_skill("s1", source_stars=10)
    s2 = make_skill("s2", source_stars=500)
    _attach_embedding(s1, base)
    _attach_embedding(s2, base.copy())  # 完全相同的向量 → cosine 距离 0

    result = dedup([(s1, 0.9), (s2, 0.88)])
    assert len(result) == 1
    # 代表应是 stars 高的
    assert result[0][0].id == "s2"


def test_distinct_skills_kept_in_separate_clusters() -> None:
    """两个语义不同的 skill 应分到不同簇，都被保留。"""
    v1 = deterministic_vec("security review code")
    v2 = deterministic_vec("video editing with ffmpeg")

    s1 = make_skill("s1")
    s2 = make_skill("s2")
    _attach_embedding(s1, v1)
    _attach_embedding(s2, v2)

    result = dedup([(s1, 0.85), (s2, 0.80)])
    assert len(result) == 2
    assert {s.id for s, _ in result} == {"s1", "s2"}


def test_representative_uses_highest_score() -> None:
    """同簇内代表挑综合分（含 stars + recency）最高的。"""
    vec = deterministic_vec("same topic")
    now = datetime.now(UTC)

    low = make_skill("low", source_stars=1, updated_at=now - timedelta(days=900))
    high = make_skill("high", source_stars=10_000, updated_at=now)
    medium = make_skill("medium", source_stars=100, updated_at=now - timedelta(days=30))
    for s in (low, high, medium):
        _attach_embedding(s, vec)

    # 同 similarity 让 stars/recency 决定胜负
    result = dedup([(low, 0.9), (high, 0.9), (medium, 0.9)])
    assert len(result) == 1
    assert result[0][0].id == "high"


def test_empty_input_returns_empty() -> None:
    """空输入直接返回空列表。"""
    assert dedup([]) == []


def test_single_candidate_returned_as_is() -> None:
    """只有一个候选，原样返回并设置 cluster_id=0。"""
    s = make_skill("solo")
    _attach_embedding(s, deterministic_vec("solo"))
    result = dedup([(s, 0.5)])
    assert len(result) == 1
    assert result[0][0].cluster_id == 0


def test_cluster_id_is_set_on_chosen_representatives() -> None:
    """被选中的 skill 必须写入 cluster_id（int 类型）。"""
    s1 = make_skill("s1")
    s2 = make_skill("s2")
    _attach_embedding(s1, deterministic_vec("topic A"))
    _attach_embedding(s2, deterministic_vec("topic B"))

    result = dedup([(s1, 0.9), (s2, 0.8)])
    for skill, _ in result:
        assert skill.cluster_id is not None
        assert isinstance(skill.cluster_id, int)
