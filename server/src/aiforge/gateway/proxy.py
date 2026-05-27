"""下游 MCP server 代理。

每个实例代表 **一个** 下游 MCP server。本模块直接用 ``asyncio.subprocess``
做 line-delimited JSON-RPC，不依赖 ``mcp`` SDK —— 这样可以在 SDK 缺席
或版本漂移时仍有稳定行为，符合规范第 7.3/7.4 节 MVP 要求。

协议片段（stdio transport）：
* 每条消息一行 UTF-8 JSON，``\\n`` 结尾
* 必走 ``initialize`` 握手 + ``notifications/initialized`` 通知
* ``tools/list`` 取工具表
* ``tools/call`` 路由到具体工具

HTTP / SSE transport 在 MVP 范围之外，命中时只 log warning 并跳过。
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import os
from dataclasses import dataclass, field
from typing import Any

import structlog

logger = structlog.get_logger(__name__)


PROTOCOL_VERSION = "2025-03-26"  # MCP 协议版本字符串
DEFAULT_REQUEST_TIMEOUT = 30.0


class ProxyError(RuntimeError):
    """代理通讯失败时抛出。"""


@dataclass
class ProxyTool:
    """下游声明的一个 tool。"""

    name: str  # 原始名（未加 namespace 前缀）
    description: str = ""
    input_schema: dict[str, Any] = field(default_factory=dict)


class MCPProxy:
    """一个下游 MCP server 的客户端代理（stdio transport）。"""

    def __init__(
        self,
        artifact_id: str,
        name: str,
        config: dict[str, Any],
        *,
        request_timeout: float = DEFAULT_REQUEST_TIMEOUT,
    ) -> None:
        self.artifact_id = artifact_id
        self.name = name  # namespace 前缀来源
        self.config = config
        self.request_timeout = request_timeout

        self._proc: asyncio.subprocess.Process | None = None
        self._reader_task: asyncio.Task[None] | None = None
        self._stderr_task: asyncio.Task[None] | None = None
        self._next_id: int = 0
        self._pending: dict[int, asyncio.Future[dict[str, Any]]] = {}
        self._tools: list[ProxyTool] = []
        self._started: bool = False
        self._closed: bool = False
        self._write_lock = asyncio.Lock()

    # ---------- 生命周期 ----------

    async def start(self) -> None:
        """spawn 子进程 + initialize + tools/list。失败抛 ProxyError。"""
        transport = self.config.get("transport", "stdio")
        if transport != "stdio":
            raise ProxyError(f"transport {transport!r} not supported in MVP (only stdio)")

        command = self.config.get("command")
        if not isinstance(command, str) or not command:
            raise ProxyError("mcp_config missing 'command'")
        args_raw = self.config.get("args") or []
        if not isinstance(args_raw, list):
            raise ProxyError("'args' must be a list")
        args = [str(a) for a in args_raw]

        env_overlay = self.config.get("env") or {}
        if not isinstance(env_overlay, dict):
            raise ProxyError("'env' must be an object")
        env = os.environ.copy()
        env.update({str(k): str(v) for k, v in env_overlay.items()})

        logger.info(
            "proxy.spawn",
            artifact_id=self.artifact_id,
            name=self.name,
            command=command,
            args=args,
        )
        try:
            self._proc = await asyncio.create_subprocess_exec(
                command,
                *args,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
            )
        except (FileNotFoundError, PermissionError, OSError) as exc:
            raise ProxyError(f"spawn failed: {exc}") from exc

        self._reader_task = asyncio.create_task(self._read_loop(), name=f"proxy-reader-{self.name}")
        # 持引用，避免事件循环 GC 掉 drain 任务（同时也满足 RUF006）
        self._stderr_task = asyncio.create_task(
            self._drain_stderr(), name=f"proxy-stderr-{self.name}"
        )

        await self._handshake()
        await self._refresh_tools()
        self._started = True

    async def aclose(self) -> None:
        """优雅关闭子进程。"""
        if self._closed:
            return
        self._closed = True
        proc = self._proc
        if proc is None:
            return
        with contextlib.suppress(Exception):
            if proc.stdin is not None and not proc.stdin.is_closing():
                proc.stdin.close()
        try:
            await asyncio.wait_for(proc.wait(), timeout=2.0)
        except TimeoutError:
            proc.kill()
            await proc.wait()
        if self._reader_task is not None:
            self._reader_task.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await self._reader_task

    # ---------- 公共 API ----------

    @property
    def tools(self) -> list[ProxyTool]:
        return list(self._tools)

    async def call_tool(self, tool_name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        """转发 tools/call 到下游。返回下游原始 result 对象。"""
        if not self._started:
            raise ProxyError("proxy not started")
        return await self._request(
            "tools/call",
            {"name": tool_name, "arguments": arguments or {}},
        )

    # ---------- 协议握手 ----------

    async def _handshake(self) -> None:
        init_params = {
            "protocolVersion": PROTOCOL_VERSION,
            "clientInfo": {"name": "aiforge-gateway", "version": "0.1.0"},
            "capabilities": {},
        }
        await self._request("initialize", init_params)
        # 按 MCP 规范发送 initialized 通知（无 id, 无回复）
        await self._send({"jsonrpc": "2.0", "method": "notifications/initialized"})

    async def _refresh_tools(self) -> None:
        try:
            result = await self._request("tools/list", {})
        except ProxyError as exc:
            logger.warning(
                "proxy.tools_list_failed",
                artifact_id=self.artifact_id,
                name=self.name,
                error=str(exc),
            )
            self._tools = []
            return
        tools_raw = result.get("tools") if isinstance(result, dict) else None
        if not isinstance(tools_raw, list):
            self._tools = []
            return
        parsed: list[ProxyTool] = []
        for t in tools_raw:
            if not isinstance(t, dict):
                continue
            tn = t.get("name")
            if not isinstance(tn, str) or not tn:
                continue
            parsed.append(
                ProxyTool(
                    name=tn,
                    description=str(t.get("description") or ""),
                    input_schema=t.get("inputSchema") or {},
                )
            )
        self._tools = parsed
        logger.info(
            "proxy.tools_loaded",
            name=self.name,
            count=len(parsed),
            tools=[t.name for t in parsed],
        )

    # ---------- JSON-RPC 收发 ----------

    async def _request(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        rid = self._next_id
        self._next_id += 1
        fut: asyncio.Future[dict[str, Any]] = asyncio.get_running_loop().create_future()
        self._pending[rid] = fut
        msg = {"jsonrpc": "2.0", "id": rid, "method": method, "params": params}
        await self._send(msg)
        try:
            return await asyncio.wait_for(fut, timeout=self.request_timeout)
        except TimeoutError as exc:
            self._pending.pop(rid, None)
            raise ProxyError(f"timeout waiting for {method}") from exc

    async def _send(self, msg: dict[str, Any]) -> None:
        proc = self._proc
        if proc is None or proc.stdin is None or proc.stdin.is_closing():
            raise ProxyError("downstream stdin closed")
        line = (json.dumps(msg, ensure_ascii=False) + "\n").encode("utf-8")
        async with self._write_lock:
            proc.stdin.write(line)
            try:
                await proc.stdin.drain()
            except (BrokenPipeError, ConnectionResetError) as exc:
                raise ProxyError(f"stdin write failed: {exc}") from exc

    async def _read_loop(self) -> None:
        """持续读子进程 stdout，把回复派发给对应的 future。"""
        proc = self._proc
        if proc is None or proc.stdout is None:
            return
        try:
            while True:
                line = await proc.stdout.readline()
                if not line:
                    break
                try:
                    msg = json.loads(line.decode("utf-8").strip())
                except (UnicodeDecodeError, json.JSONDecodeError):
                    logger.debug("proxy.read_bad_line", name=self.name, raw=line[:120])
                    continue
                self._dispatch(msg)
        finally:
            # 进程结束时，把还在等回复的 future 全部失败掉
            for fut in self._pending.values():
                if not fut.done():
                    fut.set_exception(ProxyError("downstream closed"))
            self._pending.clear()

    def _dispatch(self, msg: dict[str, Any]) -> None:
        if not isinstance(msg, dict):
            return
        rid = msg.get("id")
        if rid is None:
            # notification or server-initiated request — 暂时忽略（MVP 不响应）
            return
        fut = self._pending.pop(rid, None)
        if fut is None or fut.done():
            return
        if "error" in msg:
            err = msg["error"]
            fut.set_exception(
                ProxyError(f"downstream error: {err}")
                if isinstance(err, dict | str)
                else ProxyError("downstream error")
            )
            return
        result = msg.get("result")
        fut.set_result(result if isinstance(result, dict) else {})

    async def _drain_stderr(self) -> None:
        """把下游 stderr 实时转发到我们的日志，避免缓冲区填满。"""
        proc = self._proc
        if proc is None or proc.stderr is None:
            return
        try:
            while True:
                line = await proc.stderr.readline()
                if not line:
                    break
                logger.debug(
                    "proxy.stderr",
                    name=self.name,
                    line=line.decode("utf-8", errors="replace").rstrip(),
                )
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.debug("proxy.stderr_drain_error", name=self.name, error=str(exc))
