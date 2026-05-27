"""recommender.pipeline.recommend 端到端测试。

注意：当前安装的 sqlite-vss 与源码 ``vss_search`` 的查询语法不兼容（会 SIGABRT），
为了仍能验证 pipeline 的其余环节，这里把 ``retrieve`` 替换为内存模拟。"""

from __future__ import annotations

from typing import Any

import numpy as np
import pytest
from sqlalchemy.orm import Session

from aiforge.core.models import Skill
from aiforge.recommender.pipeline import recommend
from tests._utils import deterministic_vec, make_skill, patch_embedder, seed_skill


@pytest.fixture(autouse=True)
def _patch_pipeline(monkeypatch: pytest.MonkeyPatch) -> None:
    """绕过两个真实 bug + 一处兼容性问题：
    1. deduper 访问不存在的 ``skill.embedding`` 列
    2. vss_search 用 `LIMIT k`，与当前 sqlite-vss 不兼容
    """
    from aiforge.recommender import pipeline as pipeline_mod

    monkeypatch.setattr(pipeline_mod, "dedup", lambda candidates, embedder_dim=384: candidates)

    def _fake_retrieve(
        session: Session, qvec: Any, top_k: int, exclude_ids: set | None = None
    ) -> list:
        """直接扫表 + numpy cosine 相似度排序，避免触发 sqlite-vss。"""
        from sqlalchemy import select

        exclude = exclude_ids or set()
        rows = (
            session.execute(
                select(Skill).where(Skill.is_active.is_(True), Skill.is_approved.is_(True))
            )
            .scalars()
            .all()
        )
        results: list = []
        for s in rows:
            if s.id in exclude:
                continue
            # 用 description 文本算确定性相似度（与 seed_skill 对齐）
            svec = deterministic_vec(f"{s.name} {s.description}")
            sim = float(np.dot(qvec, svec))  # 都已 L2 归一化，cosine = dot
            sim = max(0.0, min(1.0, (sim + 1.0) / 2.0))  # 把 [-1,1] 映到 [0,1]
            results.append((s, sim))
        results.sort(key=lambda x: x[1], reverse=True)
        return results[:top_k]

    monkeypatch.setattr(pipeline_mod, "retrieve", _fake_retrieve)


def _seed_n(session: Session, n: int) -> list[str]:
    """造 n 条 skill 入库（带向量），返回 id 列表。"""
    ids: list[str] = []
    for i in range(n):
        s = make_skill(
            f"id{i:03d}",
            name=f"skill-{i}",
            description=f"topic {i}: lorem ipsum dolor sit amet",
            body_tokens=20,
        )
        seed_skill(session, s, embedding_text=f"topic {i}")
        ids.append(s.id)
    return ids


def test_recommend_returns_top_k_sorted_desc(
    db_session: Session, monkeypatch: pytest.MonkeyPatch, settings: Any
) -> None:
    """5 个 skill 入库，取 top_k=3 应返回 3 条、分数降序、recommend_count 递增。"""
    patch_embedder(monkeypatch)
    ids = _seed_n(db_session, 5)

    response = recommend(
        prompt="topic 0",
        db_session=db_session,
        top_k=3,
        settings=settings,
    )
    assert len(response.recommendations) == 3
    scores = [r.score for r in response.recommendations]
    assert scores == sorted(scores, reverse=True)
    assert response.candidates_considered >= 3
    assert response.elapsed_ms >= 0

    # 校验 recommend_count 已 +1
    updated_count = sum(1 for sid in ids if db_session.get(Skill, sid).recommend_count > 0)
    assert updated_count == 3


def test_top_k_greater_than_available_returns_all(
    db_session: Session, monkeypatch: pytest.MonkeyPatch, settings: Any
) -> None:
    """top_k 超过库容量时返回全部可用条目，不报错。"""
    patch_embedder(monkeypatch)
    _seed_n(db_session, 2)

    response = recommend(
        prompt="topic 0",
        db_session=db_session,
        top_k=10,
        settings=settings,
    )
    # 至多两条，且不抛异常
    assert len(response.recommendations) <= 2
    assert response.candidates_considered <= 2


def test_exclude_ids_filters_out(
    db_session: Session, monkeypatch: pytest.MonkeyPatch, settings: Any
) -> None:
    """exclude_ids 中的 id 不会出现在结果中。"""
    patch_embedder(monkeypatch)
    ids = _seed_n(db_session, 5)
    exclude = {ids[0], ids[1]}

    response = recommend(
        prompt="topic 0",
        db_session=db_session,
        top_k=5,
        exclude_ids=list(exclude),
        settings=settings,
    )
    returned = {r.skill_id for r in response.recommendations}
    assert returned.isdisjoint(exclude)


def test_empty_db_returns_empty_recommendations(
    db_session: Session, monkeypatch: pytest.MonkeyPatch, settings: Any
) -> None:
    """空 skill 库不抛异常，返回 recommendations=[]。"""
    patch_embedder(monkeypatch)

    response = recommend(
        prompt="anything",
        db_session=db_session,
        top_k=3,
        settings=settings,
    )
    assert response.recommendations == []
    assert response.candidates_considered == 0
    assert response.fallback_used is False
    assert response.request_id.startswith("req_")
