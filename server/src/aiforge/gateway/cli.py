"""``aiforge-mcp`` 命令入口。

启动顺序：
1. 解析命令行 / 环境变量 → 拿到 server URL、api_key、tag/pin 过滤集
2. 用 ``Registry`` 拉 active MCP 列表
3. 构造 ``GatewayServer``，并发拉起所有下游 proxy
4. 通过 stdio 暴露 MCP server，阻塞到 stdin 关闭
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
from collections.abc import Sequence

import structlog

from .registry import ActiveMCP, Registry
from .server import GatewayServer

DEFAULT_SERVER_URL = "http://localhost:8765"


def _configure_logging(level: str = "INFO") -> None:
    """让 structlog 全部写到 stderr —— stdout 留给 MCP JSON-RPC。"""
    logging.basicConfig(
        stream=sys.stderr,
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(message)s",
    )
    structlog.configure(
        processors=[
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            getattr(logging, level.upper(), logging.INFO)
        ),
        logger_factory=structlog.PrintLoggerFactory(file=sys.stderr),
        cache_logger_on_first_use=True,
    )


def _build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="aiforge-mcp",
        description=(
            "AIForge MCP gateway: aggregate active MCP servers "
            "behind a single stdio MCP server."
        ),
    )
    p.add_argument(
        "--server-url",
        default=os.environ.get("AIFORGE_SERVER_URL", DEFAULT_SERVER_URL),
        help="AIForge server base URL (default: env AIFORGE_SERVER_URL or http://localhost:8765).",
    )
    p.add_argument(
        "--api-key",
        default=os.environ.get("AIFORGE_API_KEY"),
        help="AIForge API key (default: env AIFORGE_API_KEY).",
    )
    p.add_argument(
        "--tag",
        action="append",
        default=None,
        dest="tags",
        help=(
            "Only expose MCPs with this tag (repeatable). "
            "Env: AIFORGE_GATEWAY_ACTIVE_TAGS (csv)."
        ),
    )
    p.add_argument(
        "--pin",
        action="append",
        default=None,
        dest="pins",
        help=(
            "Always include this artifact id (repeatable). "
            "Env: AIFORGE_GATEWAY_PIN_IDS (csv)."
        ),
    )
    p.add_argument(
        "--log-level",
        default=os.environ.get("AIFORGE_LOG_LEVEL", "INFO"),
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
    )
    return p


def _csv_env(name: str) -> list[str] | None:
    raw = os.environ.get(name)
    if not raw:
        return None
    return [s.strip() for s in raw.split(",") if s.strip()]


def _resolve_tags(arg_tags: list[str] | None) -> list[str] | None:
    if arg_tags:
        return arg_tags
    return _csv_env("AIFORGE_GATEWAY_ACTIVE_TAGS")


def _resolve_pins(arg_pins: list[str] | None) -> list[str] | None:
    if arg_pins:
        return arg_pins
    return _csv_env("AIFORGE_GATEWAY_PIN_IDS")


async def _run(args: argparse.Namespace) -> int:
    log = structlog.get_logger("aiforge.gateway.cli")
    active: list[ActiveMCP] = []
    try:
        registry = Registry(
            args.server_url,
            api_key=args.api_key,
            active_tags=_resolve_tags(args.tags),
            pin_ids=_resolve_pins(args.pins),
        )
        active = await registry.load()
    except Exception as exc:  # noqa: BLE001 — registry 失败不应让 gateway 崩溃
        log.error("cli.registry_failed", error=str(exc))

    server = GatewayServer(active)
    try:
        await server.start_proxies()
        log.info("cli.serving", tools=len(server.tool_index))
        await server.serve_stdio()
    except KeyboardInterrupt:
        log.info("cli.interrupted")
    finally:
        await server.shutdown()
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    """``aiforge-mcp`` 程序入口。"""
    parser = _build_arg_parser()
    args = parser.parse_args(argv)
    _configure_logging(args.log_level)
    try:
        return asyncio.run(_run(args))
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    sys.exit(main())
