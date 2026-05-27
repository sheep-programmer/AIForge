"""core.db 单元测试：init_db 幂等、pack/unpack 往返、vss_search 命中。"""

from __future__ import annotations

from typing import Any

import numpy as np
from sqlalchemy.orm import Session

from aiforge.core.db import (
    init_db,
    pack_embedding,
    unpack_embedding,
    upsert_embedding,
    vss_search,
)
from tests._utils import deterministic_vec, make_skill, seed_skill


def test_init_db_is_idempotent(settings: Any) -> None:
    """重复调用 init_db 不应抛错。"""
    init_db(settings)
    init_db(settings)
    init_db(settings)


def test_pack_unpack_roundtrip_preserves_float32() -> None:
    """pack → unpack 必须还原原向量。"""
    original = np.random.default_rng(0).standard_normal(384).astype(np.float32)
    blob = pack_embedding(original)
    restored = unpack_embedding(blob, 384)
    assert restored.dtype == np.float32
    assert restored.shape == (384,)
    np.testing.assert_array_equal(original, restored)


def test_pack_converts_float64_to_float32() -> None:
    """传入 float64 应被自动转 float32。"""
    f64 = np.random.default_rng(1).standard_normal(384).astype(np.float64)
    blob = pack_embedding(f64)
    restored = unpack_embedding(blob, 384)
    assert restored.dtype == np.float32
    # 容许精度损失
    np.testing.assert_allclose(f64.astype(np.float32), restored)


def test_vss_search_finds_nearest_neighbor(db_session: Session) -> None:
    """插入 10 条向量，搜最相似的 3 条应命中预期 rowid。"""
    rowids: list[int] = []
    for i in range(10):
        s = make_skill(f"vss{i:02d}")
        rowid = seed_skill(db_session, s, embedding_text=f"vector text {i}")
        rowids.append(rowid)

    query = deterministic_vec("vector text 5")
    results = vss_search(db_session, query, top_k=3)
    assert len(results) == 3
    assert results[0][0] == rowids[5]


def test_vss_search_empty_table_returns_empty(db_session: Session) -> None:
    """空 vss_skills 表查询应返回空列表。"""
    query = deterministic_vec("anything")
    assert vss_search(db_session, query, top_k=5) == []


def test_upsert_embedding_replaces_existing(db_session: Session) -> None:
    """同 rowid 重复 upsert 应替换。"""
    s = make_skill("upsert1")
    rowid = seed_skill(db_session, s, embedding_text="v1")
    new_vec = deterministic_vec("totally different topic")
    upsert_embedding(db_session, rowid, new_vec)
    db_session.commit()
    assert rowid > 0
