"""AIForge ``UserPromptSubmit`` hook 主入口。

Claude Code 通过 stdin 把一个 JSON 对象传进来，其中 ``prompt`` 字段是用户
即将提交的提问。我们：

1. 调服务端拿推荐；服务端不可达则切本地兜底；
2. 把推荐渲染为 ``<aiforge-recommendations>`` 块；
3. 通过 stdout 输出 ``{"hookSpecificOutput": {...}}``，让 Claude Code
   把内容追加到上下文。

任何异常都不应阻塞用户提问 —— 失败时输出空 JSON ``{}`` 即可。
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path
from typing import Any

# 同目录下的模块用绝对路径导入：插件被 Claude Code 拷到 ~/.claude/plugins/...
# 时，hook 启动的 cwd 不确定，必须主动把 lib/ 加入 sys.path。
_LIB_DIR = Path(__file__).resolve().parent
if str(_LIB_DIR) not in sys.path:
    sys.path.insert(0, str(_LIB_DIR))

from client import ServerUnavailable, AIForgeClient  # noqa: E402
from config import Config, ensure_dirs, load_config  # noqa: E402
from fallback import count_skills, recommend_local  # noqa: E402
from injector import format_injection  # noqa: E402


def _read_stdin_json() -> dict[str, Any]:
    """读取 stdin 的 JSON；失败返回空 dict。"""
    try:
        raw = sys.stdin.read()
    except (OSError, ValueError):
        return {}
    if not raw.strip():
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def _extract_prompt(payload: dict[str, Any]) -> str:
    """从 Claude Code hook payload 里抽出用户 prompt。

    Claude Code 当前 schema 使用 ``prompt`` 字段；兼容旧版的
    ``user_prompt`` / ``message`` 备选。
    """
    for key in ("prompt", "user_prompt", "message", "text"):
        val = payload.get(key)
        if isinstance(val, str) and val.strip():
            return val
    return ""


def _emit_injection(text: str) -> None:
    """按 Claude Code hook 协议把注入文本写到 stdout。"""
    if not text:
        # 协议允许空对象表示 no-op
        sys.stdout.write("{}\n")
        return
    output = {
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": text,
        }
    }
    sys.stdout.write(json.dumps(output, ensure_ascii=False))
    sys.stdout.write("\n")


def _session_id() -> str:
    """尽可能从环境拿稳定的 session ID，用于"每 session 只警告一次"。"""
    for key in ("CLAUDE_SESSION_ID", "CLAUDE_CODE_SESSION_ID", "AIFORGE_SESSION_ID"):
        if val := os.environ.get(key):
            return val
    # 退而求其次：父进程 PID（同一次 Claude Code 进程内 hook 多次共享）
    return f"pid-{os.getppid()}"


def _already_warned(cfg: Config, session_id: str) -> bool:
    """检查本 session 是否已发出过兜底警告。"""
    if not cfg.fallback_warn_once:
        return False
    f = cfg.session_state_file
    if not f.is_file():
        return False
    try:
        state = json.loads(f.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    return session_id in (state.get("warned_sessions") or [])


def _mark_warned(cfg: Config, session_id: str) -> None:
    """记录本 session 已警告，避免后续 hook 重复刷屏。"""
    ensure_dirs(cfg)
    state: dict[str, Any] = {}
    f = cfg.session_state_file
    if f.is_file():
        try:
            state = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            state = {}
    warned = list(state.get("warned_sessions") or [])
    if session_id not in warned:
        warned.append(session_id)
        # 限制最多 50 条，防止无界增长
        warned = warned[-50:]
    state["warned_sessions"] = warned
    try:
        f.write_text(json.dumps(state, ensure_ascii=False), encoding="utf-8")
    except OSError:
        # 写不进就算了，不应影响主流程
        pass


def _warn_once(cfg: Config, message: str) -> None:
    """每 session 只把警告写一次到 stderr。"""
    sid = _session_id()
    if _already_warned(cfg, sid):
        return
    sys.stderr.write(f"[aiforge] {message}\n")
    _mark_warned(cfg, sid)


def main() -> int:
    """hook 主流程。"""
    start = time.monotonic()
    payload = _read_stdin_json()
    prompt = _extract_prompt(payload)

    cfg = load_config()
    if not cfg.enabled or not prompt:
        _emit_injection("")
        return 0

    client = AIForgeClient(cfg.server_url, timeout=cfg.timeout_seconds)
    resp = None
    try:
        resp = client.recommend(
            prompt, top_k=cfg.top_k, max_tokens=cfg.max_tokens
        )
    except ServerUnavailable as exc:
        # 切兜底
        if count_skills(cfg.local_cache_db) == 0:
            _warn_once(
                cfg,
                f"服务端不可达且本地缓存为空（{exc}）。"
                "请启动服务端或执行 /aiforge:sync。",
            )
            _emit_injection("")
            return 0
        _warn_once(
            cfg,
            f"服务端不可达，已切换到本地兜底（{exc}）。"
            "提示仅显示一次/会话。",
        )
        try:
            resp = recommend_local(
                cfg.local_cache_db,
                prompt,
                top_k=cfg.top_k,
                max_tokens=cfg.max_tokens,
            )
        except Exception as inner:  # noqa: BLE001
            sys.stderr.write(f"[aiforge] 本地兜底失败: {inner}\n")
            _emit_injection("")
            return 0
    except Exception as exc:  # noqa: BLE001
        # 任何意外异常都不能阻塞用户
        sys.stderr.write(f"[aiforge] 推荐失败: {exc}\n")
        _emit_injection("")
        return 0

    if resp is None or not resp.recommendations:
        _emit_injection("")
        return 0

    text = format_injection(resp)
    _emit_injection(text)

    # 给好奇的用户留一行调试线索（写 stderr，不会污染 hook 输出）
    elapsed_ms = int((time.monotonic() - start) * 1000)
    names = ", ".join(r.name for r in resp.recommendations) or "(空)"
    mode = "fallback" if resp.fallback_used else "server"
    sys.stderr.write(f"[aiforge] {mode} {elapsed_ms}ms · {names}\n")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except Exception as exc:  # noqa: BLE001
        # 绝不让 hook 崩掉用户输入
        sys.stderr.write(f"[aiforge] hook 顶层异常: {exc}\n")
        sys.stdout.write("{}\n")
        raise SystemExit(0)
