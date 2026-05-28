"""AIForge 服务端 HTTP 客户端。

仅使用 Python 标准库（urllib + json），保证插件零三方依赖。
"""

from __future__ import annotations

import json
import socket
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any


class ServerUnavailable(RuntimeError):
    """服务端不可达或超时；调用方应切换到本地兜底。"""


@dataclass(slots=True)
class Recommendation:
    """单条 skill 推荐结果。"""

    skill_id: str
    name: str
    description: str
    body: str
    score: float
    source_url: str
    rerank_reason: str
    tokens: int

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "Recommendation":
        """从 server JSON 反序列化，容错填充缺省字段。"""
        return cls(
            skill_id=str(raw.get("skill_id", "")),
            name=str(raw.get("name", "")),
            description=str(raw.get("description", "")),
            body=str(raw.get("body", "")),
            score=float(raw.get("score") or 0.0),
            source_url=str(raw.get("source_url", "")),
            rerank_reason=str(raw.get("rerank_reason") or ""),
            tokens=int(raw.get("tokens") or 0),
        )


@dataclass(slots=True)
class RecommendResponse:
    """``/v1/recommend`` 的响应封装。"""

    recommendations: list[Recommendation]
    candidates_considered: int
    fallback_used: bool


class AIForgeClient:
    """到 AIForge 服务端的精简 HTTP 客户端。"""

    def __init__(self, server_url: str, timeout: float = 0.25) -> None:
        # 去掉末尾斜杠，便于拼接路径
        self.server_url = server_url.rstrip("/")
        self.timeout = timeout

    # ------------------------------------------------------------------
    # 公共方法
    # ------------------------------------------------------------------
    def recommend(
        self,
        prompt: str,
        *,
        top_k: int = 3,
        max_tokens: int = 4000,
        agent: str = "claude-code",
    ) -> RecommendResponse:
        """请求 top-K skill 推荐。

        超时或网络错误统一抛 :class:`ServerUnavailable`，调用方应切兜底。
        """
        payload = {
            "prompt": prompt,
            "agent": agent,
            "top_k": top_k,
            "max_tokens": max_tokens,
        }
        data = self._post_json("/v1/recommend", payload)
        recs = [Recommendation.from_dict(item) for item in data.get("recommendations", [])]
        return RecommendResponse(
            recommendations=recs,
            candidates_considered=int(data.get("candidates_considered") or 0),
            fallback_used=bool(data.get("fallback_used", False)),
        )

    def health(self) -> dict[str, Any]:
        """``GET /v1/health``，原样返回 JSON。"""
        return self._get_json("/v1/health")

    def list_skills_paged(
        self, page_size: int = 200, max_pages: int = 50
    ) -> list[dict[str, Any]]:
        """分页拉取所有 skill（用于 sync 命令）。"""
        skills: list[dict[str, Any]] = []
        offset = 0
        for _ in range(max_pages):
            path = f"/v1/skills?limit={page_size}&offset={offset}"
            data = self._get_json(path)
            # 兼容两种返回结构：直接列表 or {"items": [...]}
            items: list[dict[str, Any]]
            if isinstance(data, list):
                items = data
            elif isinstance(data, dict):
                items = list(data.get("items") or data.get("skills") or [])
            else:
                items = []
            if not items:
                break
            skills.extend(items)
            if len(items) < page_size:
                break
            offset += len(items)
        return skills

    def ingest(self, github_url: str, *, auto_approve: bool = True) -> dict[str, Any]:
        """``POST /v1/ingest``，触发服务端入库一个 GitHub 仓库。"""
        return self._post_json(
            "/v1/ingest",
            {"github_url": github_url, "auto_approve": auto_approve},
            timeout=10.0,
        )

    def search(self, query: str, limit: int = 10) -> list[dict[str, Any]]:
        """通过 ``GET /v1/skills?q=`` 做关键词搜索。"""
        from urllib.parse import quote

        data = self._get_json(f"/v1/skills?q={quote(query)}&limit={limit}", timeout=2.0)
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            return list(data.get("items") or data.get("skills") or [])
        return []

    # ------------------------------------------------------------------
    # Phase 4：artifact / tag / autotag 端点
    # ------------------------------------------------------------------

    def list_artifacts(
        self,
        *,
        type: str | None = None,
        tag: str | None = None,
        limit: int = 200,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """``GET /v1/artifacts``，可按类型 / tag 过滤。"""
        from urllib.parse import urlencode

        params: list[tuple[str, str]] = [("limit", str(limit)), ("offset", str(offset))]
        if type:
            params.append(("type", type))
        if tag:
            params.append(("tag", tag))
        path = f"/v1/artifacts?{urlencode(params)}"
        data = self._get_json(path, timeout=3.0)
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            return list(data.get("items") or data.get("artifacts") or [])
        return []

    def get_artifact(self, artifact_id: str) -> dict[str, Any]:
        """``GET /v1/artifacts/{id}``，返回单条详情。"""
        from urllib.parse import quote

        data = self._get_json(f"/v1/artifacts/{quote(artifact_id)}", timeout=3.0)
        if not isinstance(data, dict):
            raise ServerUnavailable("服务端返回的 artifact 不是 JSON 对象")
        return data

    def set_tags(self, artifact_id: str, tags: list[str]) -> dict[str, Any]:
        """``PUT /v1/artifacts/{id}/tags``，整体替换 tag 集。"""
        from urllib.parse import quote

        return self._request_json(
            "PUT",
            f"/v1/artifacts/{quote(artifact_id)}/tags",
            payload={"tags": list(tags)},
            timeout=3.0,
        )

    def add_tag(self, artifact_id: str, tag: str) -> dict[str, Any]:
        """``POST /v1/artifacts/{id}/tags``，追加单个 tag。"""
        from urllib.parse import quote

        return self._post_json(
            f"/v1/artifacts/{quote(artifact_id)}/tags",
            {"tag": tag},
            timeout=3.0,
        )

    def remove_tag(self, artifact_id: str, tag: str) -> dict[str, Any]:
        """``DELETE /v1/artifacts/{id}/tags/{name}``。"""
        from urllib.parse import quote

        return self._request_json(
            "DELETE",
            f"/v1/artifacts/{quote(artifact_id)}/tags/{quote(tag)}",
            timeout=3.0,
        )

    def trigger_autotag(
        self,
        *,
        ids: list[str] | None = None,
        max_tags: int | None = None,
    ) -> dict[str, Any]:
        """``POST /v1/admin/autotag``，触发自动打标任务。"""
        payload: dict[str, Any] = {}
        if ids:
            payload["ids"] = list(ids)
        if max_tags is not None:
            payload["max_tags"] = int(max_tags)
        return self._post_json("/v1/admin/autotag", payload, timeout=5.0)

    def get_autotag_status(self, job_id: str) -> dict[str, Any]:
        """``GET /v1/admin/autotag/{job_id}``，返回任务状态。"""
        from urllib.parse import quote

        data = self._get_json(f"/v1/admin/autotag/{quote(job_id)}", timeout=3.0)
        if not isinstance(data, dict):
            raise ServerUnavailable("服务端返回的 autotag 状态不是 JSON 对象")
        return data

    # ------------------------------------------------------------------
    # 环境扫描同步
    # ------------------------------------------------------------------

    def push_environment(self, snapshot: dict[str, Any]) -> dict[str, Any]:
        """``POST /v1/environment/scan``，把本机扫描快照上报服务端。"""
        return self._post_json("/v1/environment/scan", snapshot, timeout=5.0)

    def get_environment(self) -> dict[str, Any]:
        """``GET /v1/environment``，取服务端存的最新快照。"""
        data = self._get_json("/v1/environment", timeout=3.0)
        if not isinstance(data, dict):
            raise ServerUnavailable("服务端返回的 environment 不是 JSON 对象")
        return data

    # ------------------------------------------------------------------
    # 内部工具
    # ------------------------------------------------------------------
    def _post_json(
        self, path: str, payload: dict[str, Any], *, timeout: float | None = None
    ) -> dict[str, Any]:
        return self._request_json("POST", path, payload=payload, timeout=timeout)

    def _request_json(
        self,
        method: str,
        path: str,
        *,
        payload: dict[str, Any] | None = None,
        timeout: float | None = None,
    ) -> dict[str, Any]:
        """通用 JSON 请求；支持 GET 以外的 POST / PUT / DELETE。"""
        url = f"{self.server_url}{path}"
        headers = {
            "Accept": "application/json",
            "User-Agent": "aiforge-plugin/0.1.0",
        }
        body: bytes | None = None
        if payload is not None:
            body = json.dumps(payload).encode("utf-8")
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(url, data=body, method=method, headers=headers)
        return self._do_request(req, timeout if timeout is not None else self.timeout)

    def _get_json(self, path: str, *, timeout: float | None = None) -> Any:
        url = f"{self.server_url}{path}"
        req = urllib.request.Request(
            url,
            method="GET",
            headers={
                "Accept": "application/json",
                "User-Agent": "aiforge-plugin/0.1.0",
            },
        )
        return self._do_request(req, timeout if timeout is not None else self.timeout)

    @staticmethod
    def _do_request(req: urllib.request.Request, timeout: float) -> Any:
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw = resp.read()
        except (urllib.error.URLError, socket.timeout, TimeoutError, ConnectionError) as exc:
            raise ServerUnavailable(f"无法连接 AIForge 服务端: {exc}") from exc
        except urllib.error.HTTPError as exc:  # 已被 URLError 捕获，但写明意图
            raise ServerUnavailable(f"服务端返回错误: HTTP {exc.code}") from exc

        if not raw:
            return {}
        try:
            return json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ServerUnavailable(f"服务端返回非 JSON: {exc}") from exc
