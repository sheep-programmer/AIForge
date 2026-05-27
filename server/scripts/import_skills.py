#!/usr/bin/env python3
"""导入 export_skills.py 产出的 YAML：按 source_url 去重后触发 ingest。

注意：每个 source_url 只触发一次 ingest（即使 YAML 中有多条同 URL 的 skill）。
ingest 完成后，目标实例会从 GitHub 重新拉取并 embed。

示例：
    python server/scripts/import_skills.py --input skills-backup.yaml
    python server/scripts/import_skills.py --input backup.yaml --wait
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

from _common import APIError, Color, add_connection_args, die, make_client

try:
    import yaml  # type: ignore[import-untyped]
except ImportError:
    die("缺少依赖 pyyaml，请先 `pip install pyyaml`", code=2)


def load_payload(path: Path) -> list[str]:
    """返回去重后的 source_url 列表。"""
    if not path.is_file():
        die(f"找不到 YAML：{path}")
    with path.open("r", encoding="utf-8") as f:
        raw = yaml.safe_load(f)
    if not isinstance(raw, dict) or "skills" not in raw:
        die(f"{path} 缺少 'skills' 字段（是否由 export_skills.py 产出？）")
    skills = raw["skills"]
    if not isinstance(skills, list):
        die(f"{path} 的 'skills' 不是列表")
    urls: list[str] = []
    seen: set[str] = set()
    for item in skills:
        url = (item or {}).get("source_url")
        if not url or url in seen:
            continue
        seen.add(url)
        urls.append(url)
    return urls


def main() -> int:
    parser = argparse.ArgumentParser(
        description="从 YAML 导入 skill（按 source_url 去重 + ingest）。",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    add_connection_args(parser)
    parser.add_argument("--input", "-i", required=True, type=Path, help="输入 YAML 路径")
    parser.add_argument("--wait", action="store_true", help="轮询每个 ingest 直到完成")
    args = parser.parse_args()

    client = make_client(args)

    urls = load_payload(args.input)
    if not urls:
        print(Color.yellow("YAML 中无有效 source_url。"))
        return 0
    print(Color.cyan(
        f">> 从 {args.input} 解析出 {Color.bold(str(len(urls)))} 个唯一仓库"
    ))

    # 健康检查
    try:
        client.get("/v1/health", timeout=10)
    except APIError as e:
        die(str(e))

    jobs: list[tuple[str, str]] = []  # (url, job_id)
    failed: list[tuple[str, str]] = []  # (url, error)

    for url in urls:
        try:
            resp = client.post(
                "/v1/ingest",
                body={"github_url": url, "branch": "main", "auto_approve": True},
                timeout=30,
            )
            job_id = resp.get("job_id")
            if not job_id:
                failed.append((url, f"响应缺少 job_id：{resp!r}"))
                continue
            jobs.append((url, job_id))
            print(f"  {Color.green('✓')} 提交 {url}  job={job_id}")
        except APIError as e:
            failed.append((url, str(e)))
            print(f"  {Color.red('✗')} {url}  {e}", file=sys.stderr)

    if args.wait and jobs:
        print()
        print(Color.cyan(">> 轮询所有任务..."))
        pending = dict(jobs)
        done_ok = 0
        done_err = 0
        deadline = time.monotonic() + 1800  # 30 分钟总超时
        while pending and time.monotonic() < deadline:
            for url, jid in list(pending.items()):
                try:
                    job = client.get(f"/v1/ingest/{jid}", timeout=15)
                except APIError as e:
                    print(f"  {Color.red('✗')} {url} 轮询失败：{e}", file=sys.stderr)
                    pending.pop(url)
                    done_err += 1
                    continue
                status = job.get("status")
                if status == "done":
                    print(
                        f"  {Color.green('✓')} {url}  "
                        f"+{job.get('skills_added', 0)} / "
                        f"{job.get('skills_updated', 0)}"
                    )
                    pending.pop(url)
                    done_ok += 1
                elif status == "error":
                    print(
                        f"  {Color.red('✗')} {url}  {job.get('error') or '未知错误'}",
                        file=sys.stderr,
                    )
                    pending.pop(url)
                    done_err += 1
            if pending:
                time.sleep(3)
        if pending:
            print(Color.yellow(f"!! 超时未完成：{list(pending.keys())}"), file=sys.stderr)
            done_err += len(pending)
        print()
        print(
            f">> 完成：成功 {Color.green(str(done_ok))} / "
            f"失败 {Color.red(str(done_err))} / "
            f"提交失败 {Color.red(str(len(failed)))}"
        )
        if done_err or failed:
            return 1
        return 0

    # 不 wait：只报告提交结果
    print()
    print(
        f">> 已提交 {Color.green(str(len(jobs)))} 个任务，"
        f"失败 {Color.red(str(len(failed)))}"
    )
    if failed:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
