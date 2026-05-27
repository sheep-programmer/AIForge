#!/usr/bin/env python3
"""导出已入库 skill 为可分享 / 可迁移的 YAML。

仅导出元数据（name / description / source 信息 / is_active），
不导出 body —— body 会在目标实例 ingest 时从 source_url 重新抓取。

示例：
    python server/scripts/export_skills.py --output skills-backup.yaml
    python server/scripts/export_skills.py --repo anthropics/skills --output anthropics.yaml
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from _common import APIError, Color, add_connection_args, die, make_client

try:
    import yaml  # type: ignore[import-untyped]
except ImportError:
    die("缺少依赖 pyyaml，请先 `pip install pyyaml`", code=2)

PAGE_SIZE = 200


def fetch_all(client: Any, repo: str | None) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    offset = 0
    while True:
        params: dict[str, Any] = {"limit": PAGE_SIZE, "offset": offset}
        if repo:
            params["source_repo"] = repo
        try:
            resp = client.get("/v1/skills", params=params)
        except APIError as e:
            die(str(e))
        batch = resp.get("items", [])
        if not batch:
            break
        items.extend(batch)
        offset += len(batch)
        if len(batch) < PAGE_SIZE:
            break
    return items


def main() -> int:
    parser = argparse.ArgumentParser(
        description="导出 skill 元数据到 YAML。",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    add_connection_args(parser)
    parser.add_argument("--output", "-o", required=True, type=Path, help="输出 YAML 路径")
    parser.add_argument("--repo", help="仅导出指定 owner/repo")
    args = parser.parse_args()

    client = make_client(args)

    print(Color.cyan(f">> 从 {args.server} 拉取 skill 列表..."))
    brief_items = fetch_all(client, args.repo)
    print(f"   共 {Color.bold(str(len(brief_items)))} 条")

    # 拉详情拿到 source_path（list 接口不返回）
    skills_out: list[dict[str, Any]] = []
    for i, item in enumerate(brief_items, 1):
        try:
            detail = client.get(f"/v1/skills/{item['id']}")
        except APIError as e:
            print(Color.yellow(f"   ! 跳过 {item['id']}：{e}"), file=sys.stderr)
            continue
        skills_out.append({
            "name": detail["name"],
            "description": detail["description"],
            "source_url": detail["source_url"],
            "source_path": detail["source_path"],
            "source_repo": detail["source_repo"],
            "is_active": detail["is_active"],
        })
        if i % 20 == 0 or i == len(brief_items):
            sys.stderr.write(f"\r   拉取详情 {i}/{len(brief_items)}".ljust(60))
            sys.stderr.flush()
    sys.stderr.write("\n")

    payload = {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "source_server": args.server,
        "count": len(skills_out),
        "skills": skills_out,
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as f:
        yaml.safe_dump(payload, f, allow_unicode=True, sort_keys=False)

    print(Color.green(f">> 已导出 {len(skills_out)} 条到 {args.output}"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
