"""远程 skill 发现：通过 GitHub Search API 找含 SKILL.md 的高质量仓库。

绝不在 `enable_remote_finder=False` 时发任何外部请求 —— 调用方负责检查。
"""

from __future__ import annotations

import asyncio
import hashlib
import json
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Literal

import httpx
import structlog
from sqlalchemy import select
from sqlalchemy.orm import Session

from aiforge.config import Settings, get_settings
from aiforge.core.models import PendingDiscovery, Skill

logger = structlog.get_logger(__name__)

# GitHub Search 限速：未认证 10 req/min，认证 30 req/min。统一取 30，留余量。
_AUTH_INTERVAL_SECONDS = 2.1  # 30/min → 2s/req，多留 0.1s 抖动
_ANON_INTERVAL_SECONDS = 6.5  # 10/min → 6s/req，多留 0.5s 抖动

_GITHUB_API = "https://api.github.com"
_SEARCH_CODE = "/search/code"
_SEARCH_REPOS = "/search/repositories"
_REPO_CONTENTS = "/repos/{repo}/contents/{path}"

FoundVia = Literal["github-search", "trending", "user-suggest"]


@dataclass(slots=True)
class DiscoveredRepo:
    """单个发现的仓库，准备写入 pending_discoveries。"""

    source_url: str
    source_repo: str  # "owner/repo"
    source_stars: int
    skill_count: int
    sample_skill_names: list[str] = field(default_factory=list)
    found_via: FoundVia = "github-search"
    pushed_at: datetime | None = None
    has_readme: bool = False


class RemoteFinder:
    """GitHub 远程发现器。两种来源：code-search 和 trending repo-search。"""

    def __init__(
        self,
        settings: Settings | None = None,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self._settings = settings or get_settings()
        self._owned_client = http_client is None
        self._client = http_client or httpx.AsyncClient(
            timeout=httpx.Timeout(15.0, connect=5.0),
            follow_redirects=True,
        )
        self._interval = (
            _AUTH_INTERVAL_SECONDS if self._settings.github_token else _ANON_INTERVAL_SECONDS
        )

    async def aclose(self) -> None:
        if self._owned_client:
            await self._client.aclose()

    async def __aenter__(self) -> RemoteFinder:
        return self

    async def __aexit__(self, *_: object) -> None:
        await self.aclose()

    # ---------- 公共入口 ----------

    async def discover(
        self,
        session: Session,
        *,
        per_source_limit: int = 30,
    ) -> list[DiscoveredRepo]:
        """跑一轮发现：返回**新增**的 DiscoveredRepo 列表（已写入 pending_discoveries）。

        - 跳过已在 skills 表的 source_url
        - 跳过已在 pending_discoveries 表的 source_url（任意决定）
        """
        if not self._settings.enable_remote_finder:
            logger.info("remote_finder.disabled")
            return []

        known_skill_urls = _existing_skill_urls(session)
        known_pending_urls = _existing_pending_urls(session)
        seen: set[str] = known_skill_urls | known_pending_urls

        results: list[DiscoveredRepo] = []
        try:
            via_code = await self._search_code(per_source_limit, seen)
            results.extend(via_code)
            seen.update(r.source_url for r in via_code)

            via_trending = await self._search_trending(per_source_limit, seen)
            results.extend(via_trending)
        except httpx.HTTPError as exc:
            logger.warning("remote_finder.http_error", error=str(exc))

        for repo in results:
            _persist_discovery(session, repo)
        session.commit()

        logger.info(
            "remote_finder.round_done",
            new_discoveries=len(results),
            already_known=len(seen) - len(results),
        )
        return results

    # ---------- GitHub 调用 ----------

    async def _search_code(self, limit: int, seen: set[str]) -> list[DiscoveredRepo]:
        """Code Search：filename:SKILL.md + language:Markdown。"""
        params = {
            "q": "filename:SKILL.md language:Markdown",
            "per_page": min(limit, 100),
            "sort": "indexed",
        }
        data = await self._gh_get(_SEARCH_CODE, params=params)
        items = data.get("items", []) if data else []

        # 按 repo 聚合：一次 code-search 可能返回同一 repo 的多份 SKILL.md
        grouped: dict[str, list[dict[str, Any]]] = {}
        for it in items:
            repo = it.get("repository") or {}
            full_name = repo.get("full_name")
            if not full_name:
                continue
            grouped.setdefault(full_name, []).append(it)

        out: list[DiscoveredRepo] = []
        for full_name, hits in grouped.items():
            url = f"https://github.com/{full_name}"
            if url in seen:
                continue
            repo_meta = await self._repo_meta(full_name)
            if repo_meta is None:
                continue
            sample = [_basename(h.get("path", "")) for h in hits[:5] if h.get("path")]
            out.append(
                DiscoveredRepo(
                    source_url=url,
                    source_repo=full_name,
                    source_stars=int(repo_meta.get("stargazers_count", 0)),
                    skill_count=len(hits),
                    sample_skill_names=sample,
                    found_via="github-search",
                    pushed_at=_parse_dt(repo_meta.get("pushed_at")),
                    has_readme=bool(repo_meta.get("description")),
                )
            )
            if len(out) >= limit:
                break
        return out

    async def _search_trending(self, limit: int, seen: set[str]) -> list[DiscoveredRepo]:
        """Repo Search：topic:claude-code + topic:skills，按 star 倒序。"""
        params = {
            "q": "topic:claude-code topic:skills",
            "sort": "stars",
            "order": "desc",
            "per_page": min(limit, 100),
        }
        data = await self._gh_get(_SEARCH_REPOS, params=params)
        items = data.get("items", []) if data else []

        out: list[DiscoveredRepo] = []
        for repo in items:
            full_name = repo.get("full_name")
            if not full_name:
                continue
            url = f"https://github.com/{full_name}"
            if url in seen:
                continue
            sample, count = await self._probe_skill_files(full_name)
            if count == 0:
                # trending repo 没有可识别的 SKILL.md，跳过
                continue
            out.append(
                DiscoveredRepo(
                    source_url=url,
                    source_repo=full_name,
                    source_stars=int(repo.get("stargazers_count", 0)),
                    skill_count=count,
                    sample_skill_names=sample,
                    found_via="trending",
                    pushed_at=_parse_dt(repo.get("pushed_at")),
                    has_readme=bool(repo.get("description")),
                )
            )
            if len(out) >= limit:
                break
        return out

    async def _repo_meta(self, full_name: str) -> dict[str, Any] | None:
        """拉取仓库元数据（star、pushed_at 等）。"""
        return await self._gh_get(f"/repos/{full_name}")

    async def _probe_skill_files(self, full_name: str) -> tuple[list[str], int]:
        """轻探测：用 code search 限定到该 repo 拿 SKILL.md 列表。"""
        params = {
            "q": f"repo:{full_name} filename:SKILL.md",
            "per_page": 10,
        }
        data = await self._gh_get(_SEARCH_CODE, params=params)
        if not data:
            return [], 0
        items = data.get("items", [])
        names = [_basename(it.get("path", "")) for it in items[:5] if it.get("path")]
        total = int(data.get("total_count", len(items)))
        return names, total

    async def _gh_get(
        self, path: str, *, params: dict[str, Any] | None = None
    ) -> dict[str, Any] | None:
        """GET GitHub API，遵守限速。"""
        await asyncio.sleep(self._interval)
        headers = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "aiforge-finder",
        }
        if self._settings.github_token:
            headers["Authorization"] = f"Bearer {self._settings.github_token}"
        url = path if path.startswith("http") else f"{_GITHUB_API}{path}"
        resp = await self._client.get(url, params=params, headers=headers)
        if resp.status_code == 403 and "rate limit" in resp.text.lower():
            reset = int(resp.headers.get("X-RateLimit-Reset", "0"))
            wait = max(0, reset - int(datetime.now(UTC).timestamp())) + 1
            logger.warning("remote_finder.rate_limited", wait_seconds=wait)
            await asyncio.sleep(min(wait, 120))
            return None
        if resp.status_code >= 400:
            logger.warning(
                "remote_finder.api_error",
                path=path,
                status=resp.status_code,
                body=resp.text[:200],
            )
            return None
        body: dict[str, Any] = resp.json()
        return body


# ---------- 内部工具 ----------


def _existing_skill_urls(session: Session) -> set[str]:
    rows = session.execute(select(Skill.source_url)).all()
    return {r[0] for r in rows}


def _existing_pending_urls(session: Session) -> set[str]:
    rows = session.execute(select(PendingDiscovery.source_url)).all()
    return {r[0] for r in rows}


def _persist_discovery(session: Session, repo: DiscoveredRepo) -> None:
    """写入一条 pending_discoveries 行（id 由 source_url 哈希派生，保证幂等）。"""
    discovery_id = hashlib.sha256(repo.source_url.encode("utf-8")).hexdigest()[:16]
    row = PendingDiscovery(
        id=discovery_id,
        source_url=repo.source_url,
        source_repo=repo.source_repo,
        source_stars=repo.source_stars,
        skill_count=repo.skill_count,
        sample_skill_names=json.dumps(repo.sample_skill_names, ensure_ascii=False),
        found_via=repo.found_via,
        decision="pending",
    )
    session.merge(row)
    logger.info(
        "remote_finder.discovered",
        repo=repo.source_repo,
        stars=repo.source_stars,
        skill_count=repo.skill_count,
        via=repo.found_via,
    )


def _basename(path: str) -> str:
    """从 'skills/foo/SKILL.md' 提取 'foo'；纯根 'SKILL.md' 时返回 'SKILL'。"""
    if not path:
        return ""
    parts = [p for p in path.split("/") if p]
    if len(parts) >= 2 and parts[-1].upper() == "SKILL.MD":
        return parts[-2]
    return parts[-1].removesuffix(".md").removesuffix(".MD") or path


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
