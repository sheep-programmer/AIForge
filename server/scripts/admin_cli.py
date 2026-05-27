#!/usr/bin/env python3
"""AIForge 管理 CLI（面向运维 / 数据维护）。

子命令一览：
    skills list                列出 skill（支持分页 / 过滤）
    skills show <id>           查看 skill 详情
    skills activate <id>       启用 skill
    skills deactivate <id>     停用 skill
    skills delete <id>         删除 skill（需 --yes 跳过确认）
    ingest <github-url>        触发入库
    job <job-id>               查询入库任务状态
    discoveries list           列出待审批的远程发现
    discoveries approve <id>   批准发现
    discoveries reject <id>    拒绝发现
    health                     查看服务端健康

配置：
    --server / AIFORGE_SERVER         默认 http://localhost:8765
    --api-key / AIFORGE_API_KEY       可选鉴权

示例：
    python server/scripts/admin_cli.py skills list --limit 10
    python server/scripts/admin_cli.py ingest https://github.com/anthropics/skills
    python server/scripts/admin_cli.py skills delete abc123 --yes
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from typing import Any

from _common import (
    APIError,
    Color,
    HTTPClient,
    add_connection_args,
    die,
    make_client,
    render_table,
)


# ---------- skills 子命令 ----------

def cmd_skills_list(client: HTTPClient, args: argparse.Namespace) -> int:
    params: dict[str, Any] = {"limit": args.limit, "offset": args.offset}
    if args.repo:
        params["source_repo"] = args.repo
    if args.inactive_only:
        params["active"] = "false"
    elif args.active_only:
        params["active"] = "true"
    if args.query:
        params["q"] = args.query

    try:
        resp = client.get("/v1/skills", params=params)
    except APIError as e:
        die(str(e))

    items = resp.get("items", [])
    total = resp.get("total", len(items))
    if not items:
        print(Color.yellow("（无结果）"))
        return 0

    rows = [
        [
            it["id"][:12],
            it["name"],
            it["source_repo"],
            f"{it['source_stars']}★",
            Color.green("on") if it["is_active"] else Color.red("off"),
            str(it["recommend_count"]),
            str(it["body_tokens"]),
        ]
        for it in items
    ]
    print(render_table(
        ["id", "name", "repo", "stars", "active", "rec_cnt", "tokens"],
        rows,
    ))
    print()
    print(Color.dim(
        f"显示 {len(items)} / 共 {total}（offset={args.offset} limit={args.limit}）"
    ))
    return 0


def cmd_skills_show(client: HTTPClient, args: argparse.Namespace) -> int:
    try:
        s = client.get(f"/v1/skills/{args.skill_id}")
    except APIError as e:
        die(str(e))

    print(Color.bold(s["name"]) + Color.dim(f"  ({s['id']})"))
    print(Color.dim("─" * 60))
    print(f"  description    : {s['description']}")
    print(f"  source_repo    : {s['source_repo']}  ({s['source_stars']}★)")
    print(f"  source_url     : {s['source_url']}")
    print(f"  source_path    : {s['source_path']}")
    print(f"  license        : {s.get('license') or '-'}")
    print(f"  active         : {Color.green('yes') if s['is_active'] else Color.red('no')}")
    print(f"  approved       : {Color.green('yes') if s['is_approved'] else Color.yellow('no')}")
    print(f"  cluster_id     : {s.get('cluster_id') or '-'}")
    print(f"  body_tokens    : {s['body_tokens']}")
    print(f"  recommend_cnt  : {s['recommend_count']}")
    print(f"  last_recommend : {s.get('last_recommended_at') or '-'}")
    print(f"  created_at     : {s['created_at']}")
    print(f"  updated_at     : {s['updated_at']}")

    if args.show_body:
        print()
        print(Color.bold("── BODY ──"))
        print(s["body"])
    return 0


def cmd_skills_set_active(
    client: HTTPClient, args: argparse.Namespace, *, active: bool
) -> int:
    try:
        client.patch(f"/v1/skills/{args.skill_id}", body={"is_active": active})
    except APIError as e:
        die(str(e))
    verb = "启用" if active else "停用"
    print(Color.green(f"已{verb} skill {args.skill_id}"))
    return 0


def cmd_skills_delete(client: HTTPClient, args: argparse.Namespace) -> int:
    if not args.yes:
        try:
            answer = input(
                f"确认删除 skill {args.skill_id}？此操作不可逆 [y/N] "
            ).strip().lower()
        except EOFError:
            answer = ""
        if answer != "y":
            print("已取消。")
            return 0
    try:
        client.delete(f"/v1/skills/{args.skill_id}")
    except APIError as e:
        die(str(e))
    print(Color.green(f"已删除 skill {args.skill_id}"))
    return 0


# ---------- ingest / job ----------

def cmd_ingest(client: HTTPClient, args: argparse.Namespace) -> int:
    try:
        resp = client.post(
            "/v1/ingest",
            body={"github_url": args.github_url, "branch": args.branch, "auto_approve": True},
            timeout=30,
        )
    except APIError as e:
        die(str(e))

    job_id = resp.get("job_id")
    print(Color.green(f"已提交：job_id={job_id}  status={resp.get('status')}"))

    if not args.wait:
        print(Color.dim(f"使用 `admin_cli.py job {job_id}` 查询进度。"))
        return 0

    print(Color.cyan(">> 轮询任务直到完成..."))
    return _wait_job(client, job_id)


def cmd_job(client: HTTPClient, args: argparse.Namespace) -> int:
    try:
        job = client.get(f"/v1/ingest/{args.job_id}")
    except APIError as e:
        die(str(e))
    _print_job(job)
    return 0


def _print_job(job: dict[str, Any]) -> None:
    status = job.get("status", "?")
    color = {
        "done": Color.green,
        "error": Color.red,
    }.get(status, Color.yellow)
    print(f"job_id      : {job['job_id']}")
    print(f"source_url  : {job['source_url']}")
    print(f"status      : {color(status)}")
    print(f"skills_added: {job.get('skills_added', 0)}")
    print(f"skills_updd : {job.get('skills_updated', 0)}")
    print(f"created_at  : {job.get('created_at')}")
    print(f"finished_at : {job.get('finished_at') or '-'}")
    if job.get("error"):
        print(f"error       : {Color.red(job['error'])}")


def _wait_job(client: HTTPClient, job_id: str, timeout: int = 600) -> int:
    deadline = time.monotonic() + timeout
    last_status = ""
    while time.monotonic() < deadline:
        try:
            job = client.get(f"/v1/ingest/{job_id}")
        except APIError as e:
            die(str(e))
        status = job.get("status", "?")
        if status != last_status:
            print(f"  status: {Color.cyan(status)}")
            last_status = status
        if status == "done":
            print(Color.green(
                f"完成。新增 {job.get('skills_added', 0)} / "
                f"更新 {job.get('skills_updated', 0)}"
            ))
            return 0
        if status == "error":
            print(Color.red(f"失败：{job.get('error') or '未知'}"), file=sys.stderr)
            return 1
        time.sleep(2)
    print(Color.yellow(f"超时（>{timeout}s）"), file=sys.stderr)
    return 1


# ---------- discoveries ----------

def cmd_discoveries_list(client: HTTPClient, args: argparse.Namespace) -> int:
    params: dict[str, Any] = {}
    if args.decision:
        params["decision"] = args.decision
    try:
        items = client.get("/v1/admin/discoveries", params=params)
    except APIError as e:
        die(str(e))
    if not items:
        print(Color.yellow("（无待审批的发现）"))
        return 0
    rows = [
        [
            it["id"][:12],
            it["source_repo"],
            f"{it['source_stars']}★",
            str(it["skill_count"]),
            it["found_via"],
            it["decision"],
        ]
        for it in items
    ]
    print(render_table(
        ["id", "repo", "stars", "skills", "found_via", "decision"], rows
    ))
    print()
    print(Color.dim(f"共 {len(items)} 条"))
    return 0


def cmd_discoveries_decide(
    client: HTTPClient, args: argparse.Namespace, *, approve: bool
) -> int:
    path = f"/v1/admin/discoveries/{args.discovery_id}/{'approve' if approve else 'reject'}"
    try:
        resp = client.post(path, body={"notes": args.notes})
    except APIError as e:
        die(str(e))
    verb = "批准" if approve else "拒绝"
    print(Color.green(f"已{verb}：{resp}"))
    if approve and resp.get("ingest_job_id"):
        print(Color.dim(
            f"提示：ingest 任务 {resp['ingest_job_id']}，可用 "
            f"`admin_cli.py job {resp['ingest_job_id']}` 查询进度"
        ))
    return 0


# ---------- health ----------

def cmd_health(client: HTTPClient, args: argparse.Namespace) -> int:
    try:
        h = client.get("/v1/health")
    except APIError as e:
        die(str(e))
    if args.json:
        print(json.dumps(h, indent=2, ensure_ascii=False))
        return 0
    status = h.get("status", "?")
    color = {"ok": Color.green, "degraded": Color.yellow, "error": Color.red}.get(status, str)
    print(f"status            : {color(status)}")
    print(f"version           : {h.get('version')}")
    print(f"skills_count      : {Color.bold(str(h.get('skills_count', 0)))}")
    print(f"reranker_available: {h.get('reranker_available')}")
    print(f"embedder_loaded   : {h.get('embedder_loaded')}")
    print(f"uptime_seconds    : {h.get('uptime_seconds')}")
    return 0


# ---------- 解析器 ----------

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="AIForge 管理 CLI。",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    add_connection_args(parser)

    sub = parser.add_subparsers(dest="command", required=True, metavar="<command>")

    # skills
    sp_skills = sub.add_parser("skills", help="skill 库管理")
    sp_skills_sub = sp_skills.add_subparsers(dest="action", required=True)

    p = sp_skills_sub.add_parser("list", help="列出 skill")
    p.add_argument("--limit", type=int, default=50)
    p.add_argument("--offset", type=int, default=0)
    p.add_argument("--repo", help="按 source_repo 过滤（owner/repo）")
    p.add_argument("--query", "-q", help="按 query 全文过滤")
    g = p.add_mutually_exclusive_group()
    g.add_argument("--inactive-only", action="store_true")
    g.add_argument("--active-only", action="store_true")
    p.set_defaults(func=cmd_skills_list)

    p = sp_skills_sub.add_parser("show", help="查看 skill 详情")
    p.add_argument("skill_id")
    p.add_argument("--show-body", action="store_true", help="打印完整 markdown body")
    p.set_defaults(func=cmd_skills_show)

    p = sp_skills_sub.add_parser("activate", help="启用 skill")
    p.add_argument("skill_id")
    p.set_defaults(func=lambda c, a: cmd_skills_set_active(c, a, active=True))

    p = sp_skills_sub.add_parser("deactivate", help="停用 skill")
    p.add_argument("skill_id")
    p.set_defaults(func=lambda c, a: cmd_skills_set_active(c, a, active=False))

    p = sp_skills_sub.add_parser("delete", help="删除 skill")
    p.add_argument("skill_id")
    p.add_argument("--yes", "-y", action="store_true", help="跳过确认")
    p.set_defaults(func=cmd_skills_delete)

    # ingest
    p = sub.add_parser("ingest", help="触发入库")
    p.add_argument("github_url")
    p.add_argument("--branch", default="main")
    p.add_argument("--wait", action="store_true", help="轮询直到任务完成")
    p.set_defaults(func=cmd_ingest)

    # job
    p = sub.add_parser("job", help="查询入库任务状态")
    p.add_argument("job_id")
    p.set_defaults(func=cmd_job)

    # discoveries
    sp_disc = sub.add_parser("discoveries", help="远程发现审批")
    sp_disc_sub = sp_disc.add_subparsers(dest="action", required=True)

    p = sp_disc_sub.add_parser("list", help="列出待审批发现")
    p.add_argument("--decision", choices=["pending", "approved", "rejected"])
    p.set_defaults(func=cmd_discoveries_list)

    p = sp_disc_sub.add_parser("approve", help="批准发现")
    p.add_argument("discovery_id")
    p.add_argument("--notes", help="备注")
    p.set_defaults(func=lambda c, a: cmd_discoveries_decide(c, a, approve=True))

    p = sp_disc_sub.add_parser("reject", help="拒绝发现")
    p.add_argument("discovery_id")
    p.add_argument("--notes", help="备注")
    p.set_defaults(func=lambda c, a: cmd_discoveries_decide(c, a, approve=False))

    # health
    p = sub.add_parser("health", help="查看服务端健康")
    p.add_argument("--json", action="store_true", help="输出 JSON")
    p.set_defaults(func=cmd_health)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    client = make_client(args)
    return int(args.func(client, args) or 0)


if __name__ == "__main__":
    sys.exit(main())
