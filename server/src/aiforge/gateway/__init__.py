"""AIForge MCP 运行时网关包。

该包对外暴露 ``aiforge-mcp`` 命令：一个聚合多个下游 MCP server
的进程，自身以 stdio JSON-RPC 暴露给 Claude Code。详见 ``server.py``。
"""

from __future__ import annotations

__all__ = ["__version__"]

__version__ = "0.1.0"
