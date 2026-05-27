"""第二阶段：语义去重。

很多 skill 仓库会发布同名/近义的 SKILL.md（"security-review"、"pr-review-security"），
向量空间里它们贴得很近。我们用 AgglomerativeClustering（cosine 距离）把候选聚类，
每簇按综合分数挑一个代表，避免把三份"几乎一样"的卡片塞给 agent。

代表选择公式：
    score = 0.5 * similarity + 0.3 * log(stars+1)/log(100_000) + 0.2 * recency

recency 用 ``updated_at`` 距今天数映射到 [0, 1]：当天=1，半年前≈0.5，2 年前≈0。
"""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import TYPE_CHECKING

import numpy as np
import structlog

from aiforge.core.db import unpack_embedding
from aiforge.core.models import Skill

if TYPE_CHECKING:
    pass

logger = structlog.get_logger(__name__)

# AgglomerativeClustering 的距离阈值：cosine_distance < 0.15 视为同簇。
# 经验值：sentence-transformers/all-MiniLM-L6-v2 上，0.15 大致对应
# cosine_similarity > 0.85，刚好是"换种说法但讲同一件事"的边界。
_CLUSTER_DISTANCE_THRESHOLD = 0.15

# stars 归一化锚点：10 万星基本是 React/VSCode 级；超过这个数仍按 1.0 算
_STAR_ANCHOR_LOG = math.log(100_000)

# recency 半衰期（天）：半年前的 skill 仍有约 0.5 的新鲜度权重
_RECENCY_HALFLIFE_DAYS = 180.0


def _recency_score(updated_at: datetime | None) -> float:
    """更新时间越近分数越高，指数衰减，范围 [0, 1]。"""
    if updated_at is None:
        return 0.0
    now = datetime.now(timezone.utc)
    # SQLite naive datetime 兼容
    if updated_at.tzinfo is None:
        updated_at = updated_at.replace(tzinfo=timezone.utc)
    age_days = max(0.0, (now - updated_at).total_seconds() / 86400.0)
    return float(math.exp(-math.log(2) * age_days / _RECENCY_HALFLIFE_DAYS))


def _star_score(stars: int) -> float:
    """log-scale，截断到 [0, 1]。0 star 给 0 分。"""
    if stars <= 0:
        return 0.0
    return min(1.0, math.log(stars + 1) / _STAR_ANCHOR_LOG)


def _representative_score(skill: Skill, similarity: float) -> float:
    return (
        0.5 * similarity
        + 0.3 * _star_score(skill.source_stars)
        + 0.2 * _recency_score(skill.updated_at)
    )


def dedup(
    candidates: list[tuple[Skill, float]],
    embedder_dim: int = 384,
    distance_threshold: float = _CLUSTER_DISTANCE_THRESHOLD,
) -> list[tuple[Skill, float]]:
    """聚类去重，每簇返回一个代表。

    Args:
        candidates: ``[(Skill, similarity), ...]``，已按 similarity 降序
        embedder_dim: 向量维度，用来 unpack ``skill.embedding``
        distance_threshold: cosine 距离阈值

    Returns:
        过滤后的 ``[(Skill, similarity), ...]``，保留输入顺序中代表的相对排序。
        每个被选中的 skill 的 ``cluster_id`` 会被原地赋值（簇内 ID 即输入索引）。
    """
    n = len(candidates)
    if n == 0:
        return []
    if n == 1:
        skill, sim = candidates[0]
        skill.cluster_id = 0
        return [(skill, sim)]

    # 构造矩阵：每行一个候选的 embedding
    vecs = np.zeros((n, embedder_dim), dtype=np.float32)
    for i, (skill, _) in enumerate(candidates):
        if skill.embedding:
            vecs[i] = unpack_embedding(skill.embedding, embedder_dim)
        # 缺失向量留 0，与所有真实向量的 cosine 距离都是 1 → 必然落单簇

    labels = _agglomerative_labels(vecs, distance_threshold)

    # 每簇挑代表
    cluster_to_best: dict[int, tuple[int, float]] = {}  # cluster_id -> (idx, score)
    for idx, label in enumerate(labels):
        skill, sim = candidates[idx]
        score = _representative_score(skill, sim)
        prev = cluster_to_best.get(label)
        if prev is None or score > prev[1]:
            cluster_to_best[label] = (idx, score)

    chosen_indices = {idx for idx, _ in cluster_to_best.values()}

    # 给被选中的 skill 写回 cluster_id；保留输入顺序（输入按 similarity 降序）
    result: list[tuple[Skill, float]] = []
    for idx, (skill, sim) in enumerate(candidates):
        if idx not in chosen_indices:
            continue
        skill.cluster_id = int(labels[idx])
        result.append((skill, sim))

    logger.debug(
        "deduper.done",
        before=n,
        after=len(result),
        clusters=len(set(labels.tolist())),
    )
    return result


def _agglomerative_labels(vecs: np.ndarray, threshold: float) -> np.ndarray:
    """跑 AgglomerativeClustering 返回每行的簇标签。

    单独抽出来方便在测试里 mock；同时处理 sklearn 不接受 n=1 的 corner case。
    """
    from sklearn.cluster import AgglomerativeClustering

    if vecs.shape[0] <= 1:
        return np.zeros(vecs.shape[0], dtype=np.int64)

    model = AgglomerativeClustering(
        n_clusters=None,
        metric="cosine",
        linkage="average",
        distance_threshold=threshold,
    )
    labels = model.fit_predict(vecs)
    return np.asarray(labels, dtype=np.int64)
