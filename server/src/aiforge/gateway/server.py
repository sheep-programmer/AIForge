"""对外 MCP server —— 把 N 个下游 server 聚合成 1 个 stdio server。

实现选择
========
规范 7.3 节建议使用官方 ``mcp`` Python SDK，并允许在 SDK API 不明朗时
退回到「直接做 JSON-RPC 子进程对话」。本 MVP **选择后者**：

* 对外（向 Claude Code）和对内（向下游 MCP）都用同一份手写的
  line-delimited JSON-RPC 实现。
* 好处：零额外依赖、协议透明、容易调试。
* 代价：不能享受 SDK 的 schema / capability 协商升级。等需要 prompts、
  resources、sampling 等高级特性时再迁移到官方 SDK。

命名空间规则
============
为避免多个下游 server 暴露同名 tool 冲突，每个 tool 在对外接口上被改名为:

::

    <artifact_name>__<original_tool_name>

收到 ``tools/call`` 时，按 **第一个** ``__`` 分隔（兼容名字本身含双下划线
的 tool）。前缀解析失败或目标 artifact 不存在 → 返回 JSON-RPC 错误。

下游错误隔离
============
一个 proxy 的 ``start`` 失败不会让整个 gateway 启动失败 —— 只是该 proxy
不会出现在 tools/list 里。``tools/call`` 在路由阶段若发现目标已死，会返
回 isError=true 的 result，让上游优雅降级。

stdout 留给 JSON-RPC，所有日志走 stderr（structlog 默认）。
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import sys
from dataclasses import dataclass
from typing import Any

import structlog

from .proxy import MCPProxy, ProxyError
from .registry import ActiveMCP

logger = structlog.get_logger(__name__)


PROTOCOL_VERSION = "2025-03-26"
SERVER_NAME = "aiforge-gateway"
SERVER_VERSION = "0.1.0"


# JSON-RPC 错误码（节选自 spec）
ERR_PARSE = -32700
ERR_INVALID_REQUEST = -32600
ERR_METHOD_NOT_FOUND = -32601
ERR_INVALID_PARAMS = -32602
ERR_INTERNAL = -32603


@dataclass
class _RoutedTool:
    """对外 tools/list 中的一项。"""

    exposed_name: str  # 加了 namespace 前缀
    original_name: str
    proxy: MCPProxy
    description: str
    input_schema: dict[str, Any]


def _expose_name(artifact_name: str, tool_name: str) -> str:
    return f"{artifact_name}__{tool_name}"


def _split_exposed(exposed: str) -> tuple[str, str] | None:
    """把 ``ns__tool`` 拆回 ``(ns, tool)``。失败返回 None。"""
    idx = exposed.find("__")
    if idx <= 0 or idx >= len(exposed) - 2:
        return None
    return exposed[:idx], exposed[idx + 2 :]


class GatewayServer:
    """聚合多个 proxy，对外暴露一个 MCP server。"""

    def __init__(self, active: list[ActiveMCP]) -> None:
        self._active = active
        self._proxies: list[MCPProxy] = []
        self._tools: dict[str, _RoutedTool] = {}
        self._initialized: bool = False

    # ---------- 启动 / 关闭 ----------

    async def start_proxies(self) -> None:
        """并发启动所有下游 proxy，失败的逐个跳过。"""
        proxies = [MCPProxy(a.artifact_id, a.name, a.config) for a in self._active]
        results = await asyncio.gather(
            *(self._start_one(p) for p in proxies), return_exceptions=False
        )
        for proxy, ok in zip(proxies, results, strict=True):
            if ok:
                self._proxies.append(proxy)
        self._rebuild_tool_index()
        logger.info(
            "gateway.proxies_started",
            requested=len(self._active),
            running=len(self._proxies),
            tools=len(self._tools),
        )

    @staticmethod
    async def _start_one(proxy: MCPProxy) -> bool:
        try:
            await proxy.start()
            return True
        except Exception as exc:
            logger.warning(
                "gateway.proxy_start_failed",
                artifact_id=proxy.artifact_id,
                name=proxy.name,
                error=str(exc),
            )
            with contextlib.suppress(Exception):
                await proxy.aclose()
            return False

    async def shutdown(self) -> None:
        await asyncio.gather(*(p.aclose() for p in self._proxies), return_exceptions=True)

    def _rebuild_tool_index(self) -> None:
        idx: dict[str, _RoutedTool] = {}
        for proxy in self._proxies:
            for tool in proxy.tools:
                exposed = _expose_name(proxy.name, tool.name)
                if exposed in idx:
                    logger.warning(
                        "gateway.tool_name_collision",
                        exposed=exposed,
                        existing=idx[exposed].proxy.name,
                        new=proxy.name,
                    )
                    continue
                idx[exposed] = _RoutedTool(
                    exposed_name=exposed,
                    original_name=tool.name,
                    proxy=proxy,
                    description=tool.description,
                    input_schema=tool.input_schema,
                )
        self._tools = idx

    # ---------- 对外 stdio 循环 ----------

    async def serve_stdio(self) -> None:
        """主循环：从 stdin 读 JSON-RPC，把回复写 stdout。"""
        loop = asyncio.get_running_loop()
        reader = asyncio.StreamReader(limit=2**20, loop=loop)
        protocol = asyncio.StreamReaderProtocol(reader)
        await loop.connect_read_pipe(lambda: protocol, sys.stdin)

        writer_transport, writer_proto = await loop.connect_write_pipe(
            asyncio.streams.FlowControlMixin, sys.stdout
        )
        writer = asyncio.StreamWriter(writer_transport, writer_proto, None, loop)
        try:
            while True:
                line = await reader.readline()
                if not line:
                    break
                await self._handle_line(line, writer)
        finally:
            writer.close()

    async def _handle_line(self, line: bytes, writer: asyncio.StreamWriter) -> None:
        try:
            msg = json.loads(line.decode("utf-8").strip())
        except (UnicodeDecodeError, json.JSONDecodeError):
            await self._write(writer, self._error(None, ERR_PARSE, "parse error"))
            return
        if not isinstance(msg, dict):
            await self._write(writer, self._error(None, ERR_INVALID_REQUEST, "not object"))
            return
        # notification（无 id）不需要回复
        if "id" not in msg and isinstance(msg.get("method"), str):
            await self._handle_notification(msg)
            return
        resp = await self._dispatch(msg)
        if resp is not None:
            await self._write(writer, resp)

    @staticmethod
    async def _write(writer: asyncio.StreamWriter, msg: dict[str, Any]) -> None:
        writer.write((json.dumps(msg, ensure_ascii=False) + "\n").encode("utf-8"))
        await writer.drain()

    # ---------- 方法分派 ----------

    async def _handle_notification(self, msg: dict[str, Any]) -> None:
        method = msg.get("method")
        if method == "notifications/initialized":
            self._initialized = True
        # 其它 notification 当前无视

    async def _dispatch(self, msg: dict[str, Any]) -> dict[str, Any] | None:
        rid = msg.get("id")
        method = msg.get("method")
        params = msg.get("params") or {}
        if not isinstance(method, str):
            return self._error(rid, ERR_INVALID_REQUEST, "missing method")
        if not isinstance(params, dict):
            return self._error(rid, ERR_INVALID_PARAMS, "params must be object")

        if method == "initialize":
            return self._ok(rid, self._initialize_result())
        if method == "tools/list":
            return self._ok(rid, {"tools": self._tools_list_payload()})
        if method == "tools/call":
            return await self._tools_call(rid, params)
        if method == "ping":
            return self._ok(rid, {})
        return self._error(rid, ERR_METHOD_NOT_FOUND, f"method {method!r} not supported")

    def _initialize_result(self) -> dict[str, Any]:
        return {
            "protocolVersion": PROTOCOL_VERSION,
            "serverInfo": {"name": SERVER_NAME, "version": SERVER_VERSION},
            "capabilities": {"tools": {"listChanged": False}},
        }

    def _tools_list_payload(self) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        for rt in self._tools.values():
            out.append(
                {
                    "name": rt.exposed_name,
                    "description": rt.description,
                    "inputSchema": rt.input_schema or {"type": "object"},
                }
            )
        return out

    async def _tools_call(self, rid: Any, params: dict[str, Any]) -> dict[str, Any]:
        name = params.get("name")
        arguments = params.get("arguments") or {}
        if not isinstance(name, str):
            return self._error(rid, ERR_INVALID_PARAMS, "'name' must be string")
        if not isinstance(arguments, dict):
            return self._error(rid, ERR_INVALID_PARAMS, "'arguments' must be object")
        routed = self._tools.get(name)
        if routed is None:
            return self._error(rid, ERR_METHOD_NOT_FOUND, f"unknown tool {name!r}")
        try:
            result = await routed.proxy.call_tool(routed.original_name, arguments)
        except ProxyError as exc:
            logger.warning(
                "gateway.tool_call_failed",
                tool=name,
                error=str(exc),
            )
            return self._ok(
                rid,
                {
                    "isError": True,
                    "content": [{"type": "text", "text": f"downstream error: {exc}"}],
                },
            )
        return self._ok(rid, result)

    # ---------- 工具函数 ----------

    @staticmethod
    def _ok(rid: Any, result: dict[str, Any]) -> dict[str, Any]:
        return {"jsonrpc": "2.0", "id": rid, "result": result}

    @staticmethod
    def _error(rid: Any, code: int, message: str) -> dict[str, Any]:
        return {
            "jsonrpc": "2.0",
            "id": rid,
            "error": {"code": code, "message": message},
        }

    # ---------- 测试钩子 ----------

    @property
    def tool_index(self) -> dict[str, _RoutedTool]:
        return self._tools

    def install_tools_for_test(self, mapping: dict[str, _RoutedTool]) -> None:
        """仅供单元测试使用：跳过 spawn，直接注入 routed tools。"""
        self._tools = dict(mapping)
