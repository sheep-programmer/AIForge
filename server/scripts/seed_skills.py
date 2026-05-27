#!/usr/bin/env python3
"""批量入库 skill 仓库（Python 强化版）。

特性：
- 并发提交 ingest 任务（上限 3），全部异步轮询直到 done/error
- 实时进度条（单行 \\r 重写，零依赖）
- 彩色摘要 + 失败明细
- 退出码：全部成功 0 / 部分失败 1 / 全部失败 2

示例：
    python server/scripts/seed_skills.py
    python server/scripts/seed_skills.py --server http://my-vps:8765
    python server/scripts/seed_skills.py --from-file examples/popular-skills.yaml
    AIFORGE_API_KEY=xxx python server/scripts/seed_skills.py
"""

from __future__ import annotations

import argparse
import concurrent.futures as cf
import sys
import threading
import time
from pathlib import Path
from typing import Any

from _common import APIError, Color, HTTPClient, add_connection_args, die, make_client

try:
    import yaml  # type: ignore[import-untyped]
except ImportError:
    die("缺少依赖 pyyaml，请先 `pip install pyyaml`", code=2)

MAX_CONCURRENT = 3
POLL_INTERVAL_SEC = 2.0
DEADLINE_SEC = 600  # 单仓库最长等待 10 分钟


# ---------- YAML 加载 ----------

def default_yaml_path() -> Path:
    # 脚本位于 server/scripts/seed_skills.py，上溯两级到仓库根
    return Path(__file__).resolve().parents[2] / "examples" / "popular-skills.yaml"


def load_skills_yaml(path: Path) -> list[dict[str, Any]]:
    if not path.is_file():
        die(f"找不到 YAML 文件：{path}")
    with path.open("r", encoding="utf-8") as f:
        raw = yaml.safe_load(f)
    if not isinstance(raw, dict) or "skills" not in raw:
        die(f"{path} 缺少顶层 'skills' 列表")
    items = raw["skills"]
    if not isinstance(items, list) or not items:
        die(f"{path} 的 'skills' 为空")
    cleaned: list[dict[str, Any]] = []
    for i, item in enumerate(items):
        if not isinstance(item, dict) or not item.get("url"):
            die(f"{path}#skills[{i}] 缺少 'url' 字段")
        cleaned.append({
            "url": str(item["url"]).strip(),
            "branch": str(item.get("branch") or "main"),
            "description": str(item.get("description") or ""),
        })
    return cleaned


# ---------- 进度条 ----------

class Progress:
    """线程安全的单行进度条。"""

    def __init__(self, total: int) -> None:
        self.total = total
        self.done = 0
        self.failed = 0
        self.current: dict[str, str] = {}  # url -> status
        self._lock = threading.Lock()
        self._enabled = sys.stderr.isatty()

    def set_status(self, url: str, status: str) -> None:
        with self._lock:
            self.current[url] = status
            self._render()

    def finish(self, url: str, *, ok: bool) -> None:
        with self._lock:
            self.done += 1
            if not ok:
                self.failed += 1
            self.current.pop(url, None)
            self._render()

    def _render(self) -> None:
        if not self._enabled:
            return
        bar_w = 24
        ratio = self.done / self.total if self.total else 1
        filled = int(bar_w * ratio)
        bar = "█" * filled + "·" * (bar_w - filled)
        active = ", ".join(
            f"{u.rsplit('/', 1)[-1]}={s}" for u, s in list(self.current.items())[:2]
        )
        if active:
            active = " | " + active
        line = (
            f"\r[{bar}] {self.done}/{self.total}  失败 {self.failed}{active}"
        )
        # 截到终端宽度（避免 wrap）
        try:
            import shutil
            cols = shutil.get_terminal_size().columns
            if len(line) > cols:
                line = line[: cols - 1]
        except Exception:
            pass
        sys.stderr.write(line.ljust(80) + "\r")
        sys.stderr.flush()

    def clear(self) -> None:
        if self._enabled:
            sys.stderr.write(" " * 80 + "\r")
            sys.stderr.flush()


# ---------- 单仓库流程 ----------

def process_repo(
    client: HTTPClient,
    repo: dict[str, Any],
    progress: Progress,
) -> tuple[str, bool, str]:
    """返回 (url, ok, message)。"""
    url = repo["url"]
    branch = repo["branch"]
    progress.set_status(url, "submitting")

    try:
        resp = client.post(
            "/v1/ingest",
            body={"github_url": url, "branch": branch, "auto_approve": True},
            timeout=30,
        )
    except APIError as e:
        progress.finish(url, ok=False)
        return url, False, f"提交失败：{e}"

    job_id = resp.get("job_id") if isinstance(resp, dict) else None
    if not job_id:
        progress.finish(url, ok=False)
        return url, False, f"响应缺少 job_id：{resp!r}"

    progress.set_status(url, "queued")

    deadline = time.monotonic() + DEADLINE_SEC
    last_status = "pending"
    while time.monotonic() < deadline:
        try:
            job = client.get(f"/v1/ingest/{job_id}", timeout=15)
        except APIError as e:
            progress.finish(url, ok=False)
            return url, False, f"轮询失败：{e}"

        status = job.get("status", "unknown")
        if status != last_status:
            progress.set_status(url, status)
            last_status = status

        if status == "done":
            added = job.get("skills_added", 0)
            updated = job.get("skills_updated", 0)
            progress.finish(url, ok=True)
            return url, True, f"+{added} 新增 / {updated} 更新"
        if status == "error":
            err = job.get("error") or "未知错误"
            progress.finish(url, ok=False)
            return url, False, f"入库失败：{err}"

        time.sleep(POLL_INTERVAL_SEC)

    progress.finish(url, ok=False)
    return url, False, f"超时（>{DEADLINE_SEC}s），job_id={job_id}"


# ---------- main ----------

def main() -> int:
    parser = argparse.ArgumentParser(
        description="批量入库 skill 仓库。",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    add_connection_args(parser)
    parser.add_argument(
        "--from-file",
        type=Path,
        default=default_yaml_path(),
        help="YAML 仓库列表路径（默认 examples/popular-skills.yaml）",
    )
    args = parser.parse_args()

    client = make_client(args, timeout=30)

    # 健康检查
    print(Color.cyan(f">> 检查服务端：{args.server}"))
    try:
        health = client.get("/v1/health", timeout=10)
    except APIError as e:
        die(str(e))
    print(
        f"   状态：{Color.green(health.get('status', '?'))}  "
        f"已收录 skill：{Color.bold(str(health.get('skills_count', 0)))}"
    )

    skills = load_skills_yaml(args.from_file)
    print(Color.cyan(f">> 待入库仓库：{len(skills)} 个（来自 {args.from_file}）"))

    progress = Progress(total=len(skills))
    results: list[tuple[str, bool, str]] = []

    with cf.ThreadPoolExecutor(max_workers=MAX_CONCURRENT) as pool:
        futures = {pool.submit(process_repo, client, r, progress): r["url"] for r in skills}
        for fut in cf.as_completed(futures):
            try:
                results.append(fut.result())
            except Exception as e:  # 不应触发，process_repo 内部已捕获
                url = futures[fut]
                results.append((url, False, f"未预期异常：{e}"))
                progress.finish(url, ok=False)

    progress.clear()

    # 摘要
    print()
    print(Color.bold("== 入库结果 =="))
    ok_count = 0
    fail_count = 0
    for url, ok, msg in sorted(results):
        if ok:
            ok_count += 1
            print(f"  {Color.green('✓')} {url}  {Color.dim(msg)}")
        else:
            fail_count += 1
            print(f"  {Color.red('✗')} {url}  {Color.yellow(msg)}", file=sys.stderr)

    print()
    try:
        final_health = client.get("/v1/health", timeout=10)
        print(
            f">> 库中现有 skill：{Color.bold(str(final_health.get('skills_count', 0)))}"
        )
    except APIError:
        pass

    print(
        f"   成功 {Color.green(str(ok_count))} / 失败 {Color.red(str(fail_count))} "
        f"/ 共 {len(skills)}"
    )

    if fail_count == 0:
        return 0
    if ok_count == 0:
        return 2
    return 1


if __name__ == "__main__":
    sys.exit(main())
