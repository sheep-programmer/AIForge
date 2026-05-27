"""Gateway 烟雾测试。

只覆盖最关键的纯逻辑：
* Registry 能正确解析 ``/v1/artifacts`` 列表 + ``/v1/artifacts/{id}`` 详情
* tag 过滤 / pin 合并按预期工作
* GatewayServer 的命名空间前缀和路由分派正确

绝不 spawn 真实子进程；下游 proxy 全部 mock 掉。
"""

from __future__ import annotations

from typing import Any

import httpx
import pytest

from aiforge.gateway.proxy import ProxyError, ProxyTool
from aiforge.gateway.registry import ActiveMCP, Registry
from aiforge.gateway.server import (
    GatewayServer,
    _expose_name,
    _split_exposed,
)


def _patch_async_client(monkeypatch: pytest.MonkeyPatch, handler) -> None:  # type: ignore[no-untyped-def]
    """把 httpx.AsyncClient 替换为带 MockTransport 的实例。"""
    orig = httpx.AsyncClient

    def _factory(*args: Any, **kwargs: Any) -> httpx.AsyncClient:
        kwargs.pop("transport", None)
        return orig(*args, transport=_stub_transport(handler), **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", _factory)


# ---------------- registry ----------------


def _make_list_response(items: list[dict[str, Any]]) -> dict[str, Any]:
    return {"total": len(items), "items": items, "limit": 500, "offset": 0}


def _stub_transport(handler) -> httpx.MockTransport:  # type: ignore[no-untyped-def]
    return httpx.MockTransport(handler)


@pytest.mark.asyncio
async def test_registry_parses_list_and_details(monkeypatch: pytest.MonkeyPatch) -> None:
    list_payload = _make_list_response(
        [
            {"id": "a1", "name": "fs", "tags": ["devops"]},
            {"id": "a2", "name": "github", "tags": ["git", "api-integration"]},
        ]
    )
    details: dict[str, dict[str, Any]] = {
        "a1": {
            "id": "a1",
            "name": "fs",
            "mcp_config": {
                "transport": "stdio",
                "command": "npx",
                "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
            },
        },
        "a2": {
            "id": "a2",
            "name": "github",
            "mcp_config": {
                "transport": "stdio",
                "command": "github-mcp",
                "args": [],
            },
        },
    }

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/v1/artifacts":
            assert request.url.params["type"] == "mcp"
            assert request.url.params["active"] == "true"
            return httpx.Response(200, json=list_payload)
        if request.url.path.startswith("/v1/artifacts/"):
            aid = request.url.path.rsplit("/", 1)[-1]
            return httpx.Response(200, json=details[aid])
        return httpx.Response(404)

    _patch_async_client(monkeypatch, handler)

    reg = Registry("http://example.invalid")
    active = await reg.load()

    assert {a.artifact_id for a in active} == {"a1", "a2"}
    by_id = {a.artifact_id: a for a in active}
    assert by_id["a1"].name == "fs"
    assert by_id["a1"].config["transport"] == "stdio"
    assert by_id["a2"].config["command"] == "github-mcp"


@pytest.mark.asyncio
async def test_registry_filters_by_tags(monkeypatch: pytest.MonkeyPatch) -> None:
    list_payload = _make_list_response(
        [
            {"id": "a1", "name": "fs", "tags": ["devops"]},
            {"id": "a2", "name": "git-mcp", "tags": ["git"]},
            {"id": "a3", "name": "scraper", "tags": ["scraping"]},
        ]
    )
    details = {
        aid: {
            "id": aid,
            "name": {"a1": "fs", "a2": "git-mcp", "a3": "scraper"}[aid],
            "mcp_config": {"transport": "stdio", "command": "x", "args": []},
        }
        for aid in ("a1", "a2", "a3")
    }

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/v1/artifacts":
            return httpx.Response(200, json=list_payload)
        aid = request.url.path.rsplit("/", 1)[-1]
        return httpx.Response(200, json=details[aid])

    _patch_async_client(monkeypatch, handler)

    reg = Registry("http://example.invalid", active_tags=["git"])
    active = await reg.load()
    assert [a.artifact_id for a in active] == ["a2"]


@pytest.mark.asyncio
async def test_registry_pin_ids_included_even_if_not_in_filter(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    list_payload = _make_list_response(
        [
            {"id": "a1", "name": "fs", "tags": ["devops"]},
            {"id": "a2", "name": "git-mcp", "tags": ["git"]},
        ]
    )
    details = {
        "a1": {
            "id": "a1",
            "name": "fs",
            "mcp_config": {"transport": "stdio", "command": "x", "args": []},
        },
        "a2": {
            "id": "a2",
            "name": "git-mcp",
            "mcp_config": {"transport": "stdio", "command": "x", "args": []},
        },
    }

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/v1/artifacts":
            return httpx.Response(200, json=list_payload)
        aid = request.url.path.rsplit("/", 1)[-1]
        return httpx.Response(200, json=details[aid])

    _patch_async_client(monkeypatch, handler)

    reg = Registry("http://example.invalid", active_tags=["nonexistent"], pin_ids=["a1"])
    active = await reg.load()
    assert [a.artifact_id for a in active] == ["a1"]


@pytest.mark.asyncio
async def test_registry_skips_items_without_mcp_config(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    list_payload = _make_list_response(
        [{"id": "a1", "name": "broken", "tags": []}, {"id": "a2", "name": "ok", "tags": []}]
    )
    details = {
        "a1": {"id": "a1", "name": "broken", "mcp_config": None},
        "a2": {
            "id": "a2",
            "name": "ok",
            "mcp_config": {"transport": "stdio", "command": "x", "args": []},
        },
    }

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/v1/artifacts":
            return httpx.Response(200, json=list_payload)
        aid = request.url.path.rsplit("/", 1)[-1]
        return httpx.Response(200, json=details[aid])

    _patch_async_client(monkeypatch, handler)

    reg = Registry("http://example.invalid")
    active = await reg.load()
    assert [a.artifact_id for a in active] == ["a2"]


@pytest.mark.asyncio
async def test_registry_handles_server_5xx(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"error": "boom"})

    _patch_async_client(monkeypatch, handler)

    reg = Registry("http://example.invalid")
    active = await reg.load()
    assert active == []


# ---------------- namespace helpers ----------------


def test_expose_name_roundtrip() -> None:
    assert _expose_name("fs", "read_file") == "fs__read_file"
    assert _split_exposed("fs__read_file") == ("fs", "read_file")
    assert _split_exposed("nope") is None
    assert _split_exposed("__leading") is None
    # 内部含 __ 的 tool 名也能拆出来（按第一个 __ 分隔）
    assert _split_exposed("ns__weird__name") == ("ns", "weird__name")


# ---------------- server dispatch ----------------


class _FakeProxy:
    """实现 MCPProxy 用到的最小接口，给 GatewayServer 测试使用。"""

    def __init__(self, name: str, tools: list[ProxyTool], *, fail: bool = False) -> None:
        self.name = name
        self.artifact_id = f"id-{name}"
        self._tools = tools
        self.fail = fail
        self.calls: list[tuple[str, dict[str, Any]]] = []

    @property
    def tools(self) -> list[ProxyTool]:
        return self._tools

    async def call_tool(self, tool_name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        self.calls.append((tool_name, arguments))
        if self.fail:
            raise ProxyError("kaboom")
        return {
            "content": [{"type": "text", "text": f"{self.name}:{tool_name}"}],
            "isError": False,
        }


def _routed_tool(proxy: Any, tool: ProxyTool):  # type: ignore[no-untyped-def]
    from aiforge.gateway.server import _RoutedTool

    return _RoutedTool(
        exposed_name=_expose_name(proxy.name, tool.name),
        original_name=tool.name,
        proxy=proxy,
        description=tool.description,
        input_schema=tool.input_schema,
    )


@pytest.mark.asyncio
async def test_server_initialize_and_tools_list() -> None:
    gw = GatewayServer(active=[])
    p = _FakeProxy("fs", [ProxyTool("read", "Read a file", {"type": "object"})])
    gw.install_tools_for_test({"fs__read": _routed_tool(p, p.tools[0])})

    init = await gw._dispatch({"id": 1, "method": "initialize", "params": {}})
    assert init is not None and init["result"]["serverInfo"]["name"] == "aiforge-gateway"

    listing = await gw._dispatch({"id": 2, "method": "tools/list", "params": {}})
    assert listing is not None
    names = [t["name"] for t in listing["result"]["tools"]]
    assert names == ["fs__read"]


@pytest.mark.asyncio
async def test_server_routes_tools_call_to_correct_proxy() -> None:
    gw = GatewayServer(active=[])
    p_fs = _FakeProxy("fs", [ProxyTool("read", "", {})])
    p_gh = _FakeProxy("github", [ProxyTool("read", "", {})])  # 同名 tool 不冲突
    gw.install_tools_for_test(
        {
            "fs__read": _routed_tool(p_fs, p_fs.tools[0]),
            "github__read": _routed_tool(p_gh, p_gh.tools[0]),
        }
    )

    r1 = await gw._dispatch(
        {"id": 10, "method": "tools/call",
         "params": {"name": "fs__read", "arguments": {"path": "/etc/hosts"}}}
    )
    assert r1 is not None
    assert r1["result"]["content"][0]["text"] == "fs:read"
    assert p_fs.calls == [("read", {"path": "/etc/hosts"})]
    assert p_gh.calls == []

    r2 = await gw._dispatch(
        {"id": 11, "method": "tools/call",
         "params": {"name": "github__read", "arguments": {}}}
    )
    assert r2 is not None
    assert r2["result"]["content"][0]["text"] == "github:read"


@pytest.mark.asyncio
async def test_server_unknown_tool_returns_error() -> None:
    gw = GatewayServer(active=[])
    resp = await gw._dispatch(
        {"id": 1, "method": "tools/call", "params": {"name": "nope__missing", "arguments": {}}}
    )
    assert resp is not None and "error" in resp
    assert resp["error"]["code"] == -32601


@pytest.mark.asyncio
async def test_server_downstream_failure_isolated() -> None:
    gw = GatewayServer(active=[])
    p_bad = _FakeProxy("bad", [ProxyTool("die", "", {})], fail=True)
    gw.install_tools_for_test({"bad__die": _routed_tool(p_bad, p_bad.tools[0])})

    resp = await gw._dispatch(
        {"id": 1, "method": "tools/call", "params": {"name": "bad__die", "arguments": {}}}
    )
    assert resp is not None and "result" in resp
    assert resp["result"]["isError"] is True
    assert "downstream error" in resp["result"]["content"][0]["text"]


@pytest.mark.asyncio
async def test_server_unknown_method_returns_method_not_found() -> None:
    gw = GatewayServer(active=[])
    resp = await gw._dispatch({"id": 7, "method": "resources/list", "params": {}})
    assert resp is not None
    assert resp["error"]["code"] == -32601


@pytest.mark.asyncio
async def test_server_start_proxies_isolates_failures(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """一个 proxy spawn 失败不应影响其它 proxy 注册。"""

    started: list[str] = []

    class _StubProxy:
        def __init__(self, artifact_id: str, name: str, config: dict[str, Any]) -> None:
            self.artifact_id = artifact_id
            self.name = name
            self.config = config
            self._tools = [ProxyTool(f"{name}_tool")]

        @property
        def tools(self) -> list[ProxyTool]:
            return self._tools

        async def start(self) -> None:
            if self.name == "broken":
                raise ProxyError("synthetic spawn fail")
            started.append(self.name)

        async def aclose(self) -> None:
            return None

        async def call_tool(self, *args: Any, **kw: Any) -> dict[str, Any]:
            return {}

    monkeypatch.setattr("aiforge.gateway.server.MCPProxy", _StubProxy)

    active = [
        ActiveMCP("a1", "fs", {"transport": "stdio", "command": "x", "args": []}),
        ActiveMCP("a2", "broken", {"transport": "stdio", "command": "y", "args": []}),
        ActiveMCP("a3", "git", {"transport": "stdio", "command": "z", "args": []}),
    ]
    gw = GatewayServer(active)
    await gw.start_proxies()
    assert set(started) == {"fs", "git"}
    assert set(gw.tool_index.keys()) == {"fs__fs_tool", "git__git_tool"}
