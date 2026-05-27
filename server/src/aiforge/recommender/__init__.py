"""推荐引擎：从 prompt 出发，召回 → 去重 → 重排 → 预算裁剪。

公共入口：``recommend()``。其余模块按需子导入。
"""

from __future__ import annotations

from aiforge.recommender.embedder import Embedder, get_embedder
from aiforge.recommender.pipeline import recommend

__all__ = [
    "Embedder",
    "get_embedder",
    "recommend",
]
