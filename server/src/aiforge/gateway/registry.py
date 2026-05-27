"""Active MCP 集合加载器。

向 AIForge server 询问哪些 ``artifact_type='mcp'`` 当前是 active 的，
并把 ``mcp_config`` 拉回来交给 gateway 使用。

设计要点：
* ``/v1/artifacts`` 列表接口返回 ``SkillBrief``，不包含 ``mcp_config``，
  因此本模块在列表之后会逐条调 ``/v1/artifacts/{id}`` 拿详情。
* ``active_tags`` 过滤：只在客户端做（用列表里的 ``tags`` 字段），避免在
  server 端反复发查询。
* ``pin_ids`` 是 **额外** 强制加入的 artifact id 列表，即便不在过滤后的
  active 集合内也会出现在最终结果中。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx
import structlog

logger = structlog.get_logger(__name__)


@dataclass
class ActiveMCP:
    """gateway 关心的一条 MCP artifact。"""

    artifact_id: str
    name: str  # 用作 tool namespace 前缀
    config: dict[str, Any]  # 即 Skill.mcp_config

    def __post_init__(self) -> None:
        if not isinstance(self.config, dict):
            raise TypeError(f"config must be dict, got {type(self.config).__name__}")


class Registry:
    """从 AIForge server 加载 active MCP 集合。"""

    def __init__(
        self,
        aiforge_url: str,
        *,
        api_key: str | None = None,
        active_tags: list[str] | None = None,
        pin_ids: list[str] | None = None,
        timeout: float = 10.0,
    ) -> None:
        self.aiforge_url = aiforge_url.rstrip("/")
        self.api_key = api_key
        self.active_tags = [t.lower() for t in active_tags] if active_tags else None
        self.pin_ids = list(pin_ids) if pin_ids else []
        self.timeout = timeout

    # ---------- 内部 ----------

    def _headers(self) -> dict[str, str]:
        headers: dict[str, str] = {"accept": "application/json"}
        if self.api_key:
            headers["x-api-key"] = self.api_key
        return headers

    @staticmethod
    def _matches_tags(item_tags: list[str], wanted: list[str]) -> bool:
        """item 至少命中 wanted 里的一个 tag（OR 语义）。"""
        item_set = {t.lower() for t in item_tags}
        return any(w in item_set for w in wanted)

    # ---------- 公共 ----------

    async def load(self) -> list[ActiveMCP]:
        """拉取并组装 active MCP 列表。

        步骤：
        1. ``GET /v1/artifacts?type=mcp&active=true&limit=500`` 取候选 id + tags
        2. 客户端按 ``active_tags`` 过滤（如有）
        3. 把 ``pin_ids`` 并入（即使不在过滤结果里）
        4. 每个 id 调 ``/v1/artifacts/{id}`` 拿 ``mcp_config``
        5. 没有 ``mcp_config`` 或 transport 缺失的条目跳过 + 警告
        """
        async with httpx.AsyncClient(timeout=self.timeout, headers=self._headers()) as client:
            briefs = await self._list_active(client)
            chosen_ids = self._select_ids(briefs)
            results: list[ActiveMCP] = []
            for aid in chosen_ids:
                detail = await self._fetch_detail(client, aid)
                if detail is None:
                    continue
                cfg = detail.get("mcp_config")
                name = detail.get("name") or aid
                if not isinstance(cfg, dict) or not cfg.get("transport"):
                    logger.warning(
                        "registry.skip_missing_config", artifact_id=aid, name=name
                    )
                    continue
                results.append(ActiveMCP(artifact_id=aid, name=name, config=cfg))
        logger.info("registry.loaded", count=len(results))
        return results

    async def _list_active(self, client: httpx.AsyncClient) -> list[dict[str, Any]]:
        url = f"{self.aiforge_url}/v1/artifacts"
        params = {"type": "mcp", "active": "true", "limit": 500}
        try:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            logger.error("registry.list_failed", url=url, error=str(exc))
            return []
        body = resp.json()
        items = body.get("items") if isinstance(body, dict) else None
        if not isinstance(items, list):
            logger.error("registry.list_bad_shape", body_type=type(body).__name__)
            return []
        return items

    def _select_ids(self, briefs: list[dict[str, Any]]) -> list[str]:
        """根据 active_tags 过滤，再合并 pin_ids（去重，保持顺序）。"""
        keep: list[str] = []
        seen: set[str] = set()
        for it in briefs:
            aid = it.get("id")
            if not isinstance(aid, str):
                continue
            if self.active_tags is not None:
                item_tags = it.get("tags") or []
                if not isinstance(item_tags, list):
                    item_tags = []
                if not self._matches_tags(item_tags, self.active_tags):
                    continue
            if aid not in seen:
                seen.add(aid)
                keep.append(aid)
        for pid in self.pin_ids:
            if pid not in seen:
                seen.add(pid)
                keep.append(pid)
        return keep

    async def _fetch_detail(
        self, client: httpx.AsyncClient, artifact_id: str
    ) -> dict[str, Any] | None:
        url = f"{self.aiforge_url}/v1/artifacts/{artifact_id}"
        try:
            resp = await client.get(url)
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            logger.warning("registry.detail_failed", artifact_id=artifact_id, error=str(exc))
            return None
        try:
            return resp.json()  # type: ignore[no-any-return]
        except ValueError as exc:
            logger.warning("registry.detail_bad_json", artifact_id=artifact_id, error=str(exc))
            return None
