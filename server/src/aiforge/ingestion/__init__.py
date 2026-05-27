"""Ingestion 模块：GitHub 仓库 → SKILL.md 解析 → 向量入库。

对外暴露 ``ingest`` 入口；其余 helper 通过子模块直接 import。
"""

from __future__ import annotations

from aiforge.ingestion.pipeline import IngestPipeline, ingest

__all__ = ["IngestPipeline", "ingest"]
