"""脚本共享工具：HTTP 调用、ANSI 颜色、错误格式化。

设计原则：
- 仅依赖 stdlib（urllib / json / os / sys）
- 不 import 业务模块；所有交互走 HTTP
- 颜色可通过 ``NO_COLOR=1`` 或 ``--no-color`` 关闭
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

DEFAULT_SERVER = os.environ.get("AIFORGE_SERVER", "http://localhost:8765")
DEFAULT_API_KEY = os.environ.get("AIFORGE_API_KEY")


# ---------- ANSI 颜色 ----------

class Color:
    """轻量 ANSI 颜色封装。"""

    enabled: bool = True

    @classmethod
    def setup(cls, *, no_color: bool = False) -> None:
        # 优先级：显式 --no-color > NO_COLOR 环境变量 > 是否 TTY
        if no_color or os.environ.get("NO_COLOR"):
            cls.enabled = False
        else:
            cls.enabled = sys.stdout.isatty()

    @classmethod
    def _wrap(cls, code: str, text: str) -> str:
        if not cls.enabled:
            return text
        return f"\033[{code}m{text}\033[0m"

    @classmethod
    def red(cls, t: str) -> str: return cls._wrap("31", t)
    @classmethod
    def green(cls, t: str) -> str: return cls._wrap("32", t)
    @classmethod
    def yellow(cls, t: str) -> str: return cls._wrap("33", t)
    @classmethod
    def blue(cls, t: str) -> str: return cls._wrap("34", t)
    @classmethod
    def magenta(cls, t: str) -> str: return cls._wrap("35", t)
    @classmethod
    def cyan(cls, t: str) -> str: return cls._wrap("36", t)
    @classmethod
    def dim(cls, t: str) -> str: return cls._wrap("2", t)
    @classmethod
    def bold(cls, t: str) -> str: return cls._wrap("1", t)


# ---------- HTTP 客户端 ----------

class APIError(Exception):
    """业务/HTTP 错误，已经包含可读的中文提示。"""


class HTTPClient:
    """阻塞 HTTP 客户端，基于 stdlib urllib。"""

    def __init__(self, base_url: str, api_key: str | None = None, timeout: float = 30.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout

    def _headers(self) -> dict[str, str]:
        h = {"Content-Type": "application/json", "Accept": "application/json"}
        if self.api_key:
            h["Authorization"] = f"Bearer {self.api_key}"
        return h

    def request(
        self,
        method: str,
        path: str,
        *,
        body: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
        timeout: float | None = None,
    ) -> Any:
        url = self.base_url + path
        if params:
            qs = "&".join(
                f"{k}={urllib.parse.quote(str(v))}"
                for k, v in params.items()
                if v is not None
            )
            if qs:
                url += "?" + qs

        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(url, data=data, headers=self._headers(), method=method)

        try:
            with urllib.request.urlopen(req, timeout=timeout or self.timeout) as resp:
                raw = resp.read()
                if not raw:
                    return None
                return json.loads(raw.decode("utf-8"))
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="replace") if e.fp else ""
            detail = err_body
            try:
                parsed = json.loads(err_body)
                detail = parsed.get("detail", err_body)
            except Exception:
                pass
            raise APIError(
                f"服务端返回 HTTP {e.code} ({method} {path})：{detail}"
            ) from None
        except urllib.error.URLError as e:
            raise APIError(
                f"无法连接服务端 {self.base_url}：{e.reason}\n"
                f"  请确认服务已启动：docker compose -f server/docker/docker-compose.yml up -d"
            ) from None
        except TimeoutError:
            raise APIError(f"请求超时：{method} {url}") from None

    def get(self, path: str, **kw: Any) -> Any:
        return self.request("GET", path, **kw)

    def post(self, path: str, **kw: Any) -> Any:
        return self.request("POST", path, **kw)

    def patch(self, path: str, **kw: Any) -> Any:
        return self.request("PATCH", path, **kw)

    def delete(self, path: str, **kw: Any) -> Any:
        return self.request("DELETE", path, **kw)


# ---------- 表格输出 ----------

def render_table(headers: list[str], rows: list[list[str]], *, max_col: int = 60) -> str:
    """渲染纯文本表格，处理 CJK 宽字符。"""

    def _width(s: str) -> int:
        # CJK 宽字符算 2，其他算 1；够用即可
        w = 0
        for ch in s:
            cp = ord(ch)
            if 0x1100 <= cp <= 0x115F or 0x2E80 <= cp <= 0x9FFF or 0xAC00 <= cp <= 0xD7A3 \
                    or 0xF900 <= cp <= 0xFAFF or 0xFE30 <= cp <= 0xFE4F \
                    or 0xFF00 <= cp <= 0xFF60 or 0xFFE0 <= cp <= 0xFFE6:
                w += 2
            else:
                w += 1
        return w

    def _truncate(s: str, n: int) -> str:
        if _width(s) <= n:
            return s
        out = []
        used = 0
        for ch in s:
            w = _width(ch)
            if used + w > n - 1:
                break
            out.append(ch)
            used += w
        return "".join(out) + "…"

    def _pad(s: str, n: int) -> str:
        return s + " " * max(0, n - _width(s))

    matrix = [headers] + [[_truncate(str(c), max_col) for c in r] for r in rows]
    cols = list(zip(*matrix, strict=False)) if matrix else []
    widths = [max(_width(c) for c in col) for col in cols]

    lines = []
    sep = "  "
    lines.append(sep.join(_pad(h, w) for h, w in zip(headers, widths, strict=False)))
    lines.append(sep.join("-" * w for w in widths))
    for r in rows:
        lines.append(
            sep.join(_pad(_truncate(str(c), max_col), w) for c, w in zip(r, widths, strict=False))
        )
    return "\n".join(lines)


# ---------- 通用 argparse 钩子 ----------

def add_connection_args(parser: Any) -> None:
    """为 argparse parser 添加 --server / --api-key / --no-color。"""
    parser.add_argument(
        "--server",
        default=DEFAULT_SERVER,
        help=f"服务端地址（默认 {DEFAULT_SERVER}，或读取 AIFORGE_SERVER）",
    )
    parser.add_argument(
        "--api-key",
        default=DEFAULT_API_KEY,
        help="API key（默认读取 AIFORGE_API_KEY）",
    )
    parser.add_argument(
        "--no-color",
        action="store_true",
        help="禁用彩色输出",
    )


def make_client(args: Any, timeout: float = 30.0) -> HTTPClient:
    Color.setup(no_color=getattr(args, "no_color", False))
    return HTTPClient(args.server, args.api_key, timeout=timeout)


def die(msg: str, code: int = 1) -> None:
    print(Color.red("错误：") + msg, file=sys.stderr)
    sys.exit(code)
