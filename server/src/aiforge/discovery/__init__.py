"""远程发现 + 管理审批模块。

对外暴露：
  - RemoteFinder：GitHub 搜索发现器
  - RemoteFinderScheduler：周期性调度器
  - approve / reject / list_pending：审批操作
  - score_discovery：质量打分（供 API 层排序）
"""

from __future__ import annotations

from .approval import (
    DiscoveryNotFoundError,
    DiscoveryStateError,
    approve,
    list_pending,
    reject,
)
from .finder import DiscoveredRepo, RemoteFinder
from .scheduler import RemoteFinderScheduler
from .scorer import score_discovery

__all__ = [
    "DiscoveredRepo",
    "DiscoveryNotFoundError",
    "DiscoveryStateError",
    "RemoteFinder",
    "RemoteFinderScheduler",
    "approve",
    "list_pending",
    "reject",
    "score_discovery",
]
