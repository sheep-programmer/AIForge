"""AIForge 插件命令行入口。

对应五个 slash command：``status / add / search / sync / config``。
通过 stdlib argparse + 上述 client / fallback / config 模块实现。
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path
from typing import Any

# 让本目录里的同伴模块能被绝对导入
_LIB_DIR = Path(__file__).resolve().parent
if str(_LIB_DIR) not in sys.path:
    sys.path.insert(0, str(_LIB_DIR))

from client import ServerUnavailable, AIForgeClient  # noqa: E402
from config import describe, load_config, write_config  # noqa: E402
from fallback import count_skills, upsert_skills  # noqa: E402
from install import (  # noqa: E402
    install_mcp,
    install_plugin,
    install_skill,
    list_installed,
    uninstall_mcp,
    uninstall_plugin,
)
from scanner import scan_environment  # noqa: E402


# ---------------------------------------------------------------------------
# 子命令实现
# ---------------------------------------------------------------------------


def cmd_status(_: argparse.Namespace) -> int:
    """显示服务端和本地缓存状态。"""
    cfg = load_config()
    print(f"AIForge 状态")
    print(f"  配置:        {cfg.server_url} (enabled={cfg.enabled})")
    print(f"  本地缓存:    {cfg.local_cache_db}")
    print(f"  缓存 skill 数: {count_skills(cfg.local_cache_db)}")

    client = AIForgeClient(cfg.server_url, timeout=1.5)
    t0 = time.monotonic()
    try:
        health = client.health()
    except ServerUnavailable as exc:
        print(f"  服务端:      不可达 ({exc})")
        print("  提示:        启动服务端或 /aiforge:sync 后再试。")
        return 1
    elapsed_ms = int((time.monotonic() - t0) * 1000)
    print(f"  服务端:      可达 (HTTP {elapsed_ms}ms)")
    print(f"    版本:        {health.get('version', '?')}")
    print(f"    skill 总数:  {health.get('skills_count', '?')}")
    print(f"    reranker:    {'on' if health.get('reranker_available') else 'off'}")
    return 0


def cmd_add(args: argparse.Namespace) -> int:
    """触发服务端入库一个 GitHub skill 仓库。"""
    cfg = load_config()
    client = AIForgeClient(cfg.server_url, timeout=3.0)
    try:
        data = client.ingest(args.github_url, auto_approve=True)
    except ServerUnavailable as exc:
        print(f"无法提交入库任务：{exc}", file=sys.stderr)
        return 1
    job_id = data.get("job_id") or "?"
    status = data.get("status") or "?"
    print(f"已提交入库任务: job_id={job_id} status={status}")
    print(f"可通过 GET {cfg.server_url}/v1/ingest/{job_id} 查询进度。")
    return 0


def cmd_search(args: argparse.Namespace) -> int:
    """在 skill 库里关键词搜索（优先服务端，失败回退本地缓存）。"""
    cfg = load_config()
    query = " ".join(args.query).strip()
    if not query:
        print("用法: /aiforge:search <关键词>", file=sys.stderr)
        return 2

    client = AIForgeClient(cfg.server_url, timeout=2.0)
    items: list[dict[str, Any]] = []
    try:
        items = client.search(query, limit=args.limit)
        source = "服务端"
    except ServerUnavailable:
        # 退到本地：用 SimpleSearcher
        from fallback import SimpleSearcher, load_all

        searcher = SimpleSearcher(load_all(cfg.local_cache_db))
        hits = searcher.search(query, top_k=args.limit)
        items = [
            {
                "id": s.id,
                "name": s.name,
                "description": s.description,
                "source_url": s.source_url,
                "score": score,
            }
            for s, score in hits
        ]
        source = "本地缓存"

    print(f"搜索来源: {source}; 命中 {len(items)} 条")
    for item in items:
        name = item.get("name", "?")
        desc = (item.get("description") or "").strip().splitlines()[:1]
        first_line = desc[0] if desc else ""
        print(f"- {name}  —  {first_line}")
        url = item.get("source_url")
        if url:
            print(f"    {url}")
    return 0


def cmd_sync(_: argparse.Namespace) -> int:
    """从服务端拉取所有 skill 写入本地缓存。"""
    cfg = load_config()
    client = AIForgeClient(cfg.server_url, timeout=5.0)
    print("正在从服务端拉取 skill 列表…")
    try:
        rows = client.list_skills_paged()
    except ServerUnavailable as exc:
        print(f"同步失败：{exc}", file=sys.stderr)
        return 1
    n = upsert_skills(cfg.local_cache_db, rows)
    print(f"已写入本地缓存: {n} 条 → {cfg.local_cache_db}")
    return 0


def cmd_config(args: argparse.Namespace) -> int:
    """显示或修改配置。"""
    cfg = load_config()
    if args.set:
        key, _, value = args.set.partition("=")
        key = key.strip()
        value = value.strip()
        if not key or "=" not in args.set:
            print("用法: /aiforge:config --set key=value", file=sys.stderr)
            return 2
        if not _apply_set(cfg, key, value):
            print(f"未知或不支持的配置项: {key}", file=sys.stderr)
            return 2
        write_config(cfg)
        print(f"已更新 {key} = {value}")
    print(describe(cfg))
    return 0


def cmd_list(args: argparse.Namespace) -> int:
    """列出 artifact，可按 type / tag 过滤；支持 --installed 标注本地状态。"""
    cfg = load_config()
    client = AIForgeClient(cfg.server_url, timeout=3.0)
    try:
        items = client.list_artifacts(type=args.type, tag=args.tag, limit=args.limit)
    except ServerUnavailable as exc:
        print(f"无法拉取 artifact 列表：{exc}", file=sys.stderr)
        return 1

    installed = list_installed() if args.installed else {"mcps": [], "plugins": []}
    installed_mcps = set(installed["mcps"])
    installed_plugins = set(installed["plugins"])

    shown = 0
    for item in items:
        name = str(item.get("name") or "?")
        atype = str(item.get("artifact_type") or item.get("type") or "skill")
        desc = (item.get("description") or "").strip().splitlines()
        first_line = desc[0] if desc else ""

        is_installed = False
        if atype == "mcp" and name in installed_mcps:
            is_installed = True
        elif atype == "plugin" and name in installed_plugins:
            is_installed = True

        if args.installed and not is_installed and atype in {"mcp", "plugin"}:
            continue

        flag = " [已安装]" if is_installed else ""
        artifact_id = item.get("id") or item.get("skill_id") or "?"
        print(f"- [{atype}] {name}{flag}  —  {first_line}")
        print(f"    id: {artifact_id}")
        tags = item.get("tags") or []
        if tags:
            tag_names = [t["name"] if isinstance(t, dict) else str(t) for t in tags]
            print(f"    tags: {', '.join(tag_names)}")
        shown += 1

    print(f"共 {shown} 条" + ("（仅本地已装）" if args.installed else ""))
    return 0


def cmd_install(args: argparse.Namespace) -> int:
    """根据 artifact_id 拉取详情并按类型分发安装。"""
    cfg = load_config()
    client = AIForgeClient(cfg.server_url, timeout=3.0)
    try:
        artifact = client.get_artifact(args.artifact_id)
    except ServerUnavailable as exc:
        print(f"无法获取 artifact 详情：{exc}", file=sys.stderr)
        return 1

    atype = str(artifact.get("artifact_type") or artifact.get("type") or "skill")
    if atype == "mcp":
        print(install_mcp(artifact))
    elif atype == "plugin":
        print(install_plugin(artifact, force=args.force))
    elif atype == "skill":
        print(install_skill(artifact))
    else:
        print(f"安装失败：未知的 artifact_type={atype!r}", file=sys.stderr)
        return 1
    return 0


def cmd_uninstall(args: argparse.Namespace) -> int:
    """根据 artifact_id 拉取详情并按类型分发卸载。"""
    cfg = load_config()
    client = AIForgeClient(cfg.server_url, timeout=3.0)
    try:
        artifact = client.get_artifact(args.artifact_id)
    except ServerUnavailable as exc:
        print(f"无法获取 artifact 详情：{exc}", file=sys.stderr)
        return 1

    name = str(artifact.get("name") or "")
    atype = str(artifact.get("artifact_type") or artifact.get("type") or "skill")
    if atype == "mcp":
        print(uninstall_mcp(name))
    elif atype == "plugin":
        print(uninstall_plugin(name))
    elif atype == "skill":
        print(f"skill {name!r} 无需卸载（推荐器不会持久化到本地）")
    else:
        print(f"卸载失败：未知的 artifact_type={atype!r}", file=sys.stderr)
        return 1
    return 0


def cmd_tag(args: argparse.Namespace) -> int:
    """整体替换 artifact 的 tag 集合。"""
    cfg = load_config()
    client = AIForgeClient(cfg.server_url, timeout=3.0)
    tags = [t.strip() for t in args.tags.split(",") if t.strip()]
    try:
        data = client.set_tags(args.artifact_id, tags)
    except ServerUnavailable as exc:
        print(f"打标失败：{exc}", file=sys.stderr)
        return 1
    applied = data.get("tags") if isinstance(data, dict) else None
    if isinstance(applied, list):
        names = [t["name"] if isinstance(t, dict) else str(t) for t in applied]
        print(f"已更新 tag: {', '.join(names) if names else '(空)'}")
    else:
        print(f"已更新 tag: {', '.join(tags) if tags else '(空)'}")
    return 0


def cmd_autotag(args: argparse.Namespace) -> int:
    """触发服务端自动打标任务并轮询直至完成。"""
    cfg = load_config()
    client = AIForgeClient(cfg.server_url, timeout=5.0)
    ids = None
    if args.ids:
        ids = [s.strip() for s in args.ids.split(",") if s.strip()]
    try:
        data = client.trigger_autotag(ids=ids)
    except ServerUnavailable as exc:
        print(f"触发自动打标失败：{exc}", file=sys.stderr)
        return 1
    job_id = str(data.get("job_id") or "")
    if not job_id:
        print(f"触发自动打标失败：服务端未返回 job_id（{data}）", file=sys.stderr)
        return 1

    print(f"已提交 autotag 任务: job_id={job_id}")
    poll_interval = 2.0
    max_polls = max(1, args.max_polls)
    for i in range(max_polls):
        time.sleep(poll_interval)
        try:
            status = client.get_autotag_status(job_id)
        except ServerUnavailable as exc:
            print(f"轮询失败：{exc}", file=sys.stderr)
            return 1
        state = str(status.get("status") or status.get("state") or "?")
        processed = status.get("processed")
        total = status.get("total")
        progress = ""
        if processed is not None and total is not None:
            progress = f" {processed}/{total}"
        print(f"  [#{i + 1}] status={state}{progress}")
        if state in {"done", "completed", "finished", "failed", "error"}:
            if state in {"failed", "error"}:
                print(f"任务失败：{status.get('error') or status}", file=sys.stderr)
                return 1
            tagged = status.get("tagged") or status.get("results")
            if tagged:
                print(f"完成：处理 {len(tagged) if hasattr(tagged, '__len__') else '?'} 条")
            else:
                print("完成。")
            return 0

    print(f"达到轮询上限（{max_polls} 次）；任务可能仍在执行。", file=sys.stderr)
    return 1


def cmd_scan(args: argparse.Namespace) -> int:
    """扫描本机所有已知 agent（Claude Code / Codex / Cursor / Gemini / Windsurf / VS Code），
    列出已安装的 MCP / plugin / skill。可选 --sync 上报到服务端供 Web 面板展示。"""
    snapshot = scan_environment(include_undetected=args.all)

    if args.json:
        import json as _json

        print(_json.dumps(snapshot, ensure_ascii=False, indent=2))
        return 0

    totals = snapshot["totals"]
    print(f"AIForge 环境扫描 @ {snapshot['machine']}")
    print(
        f"  合计: {totals['mcp']} MCP · {totals['plugin']} plugin · {totals['skill']} skill"
        f"（跨 {len(snapshot['agents'])} 个 agent）"
    )
    for a in snapshot["agents"]:
        mark = "●" if a["detected"] else "○"
        c = a["counts"]
        print(f"\n{mark} {a['display']}  [{c['mcp']} mcp · {c['plugin']} plugin · {c['skill']} skill]")
        for path in a.get("config_paths", []):
            print(f"    config: {path}")
        for m in a["mcps"]:
            extra = f" → {m['command']}" if m.get("command") else (f" → {m['url']}" if m.get("url") else "")
            env = f"  env:{','.join(m['env_keys'])}" if m.get("env_keys") else ""
            print(f"    [mcp]    {m['name']} ({m['transport']}){extra}{env}")
        for p in a["plugins"]:
            ver = f" v{p['version']}" if p.get("version") else ""
            print(f"    [plugin] {p['name']}{ver}")
        for s in a["skills"]:
            print(f"    [skill]  {s['name']}")

    if args.sync:
        cfg = load_config()
        client = AIForgeClient(cfg.server_url, timeout=5.0)
        try:
            resp = client.push_environment(snapshot)
            print(f"\n已上报到服务端: {resp.get('snapshot_id') or 'ok'}（Web 面板 /environment 可见）")
        except ServerUnavailable as exc:
            print(f"\n上报失败（扫描结果仍在上方）：{exc}", file=sys.stderr)
            return 1
    return 0


def _apply_set(cfg: Any, key: str, value: str) -> bool:
    """把字符串 value 写入 cfg 对应字段；返回是否识别到 key。"""
    if key == "server_url":
        cfg.server_url = value
    elif key == "top_k":
        cfg.top_k = int(value)
    elif key == "max_tokens":
        cfg.max_tokens = int(value)
    elif key == "enabled":
        cfg.enabled = value.lower() in {"1", "true", "yes", "on"}
    elif key == "timeout_ms":
        cfg.timeout_ms = int(value)
    elif key == "fallback_warn_once":
        cfg.fallback_warn_once = value.lower() in {"1", "true", "yes", "on"}
    else:
        return False
    return True


# ---------------------------------------------------------------------------
# argparse 入口
# ---------------------------------------------------------------------------


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="aiforge", description="AIForge 插件 CLI")
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("status", help="服务端 / 本地缓存状态")

    p_add = sub.add_parser("add", help="入库一个 GitHub skill 仓库")
    p_add.add_argument("github_url", help="GitHub 仓库 URL")

    p_search = sub.add_parser("search", help="搜索 skill")
    p_search.add_argument("query", nargs="+", help="搜索关键词")
    p_search.add_argument("--limit", type=int, default=10)

    sub.add_parser("sync", help="同步服务端 skill 到本地缓存")

    p_cfg = sub.add_parser("config", help="显示 / 修改配置")
    p_cfg.add_argument("--set", help="key=value，覆盖一项配置")

    p_list = sub.add_parser("list", help="列出 artifact")
    p_list.add_argument("--type", choices=["skill", "mcp", "plugin"], default=None)
    p_list.add_argument("--tag", default=None, help="按 tag 过滤")
    p_list.add_argument("--limit", type=int, default=200)
    p_list.add_argument("--installed", action="store_true", help="仅显示本地已装的 mcp/plugin")

    p_install = sub.add_parser("install", help="按 artifact_id 安装 mcp / plugin")
    p_install.add_argument("artifact_id", help="服务端返回的 artifact id")
    p_install.add_argument("--force", action="store_true", help="覆盖已存在目录")

    p_uninstall = sub.add_parser("uninstall", help="按 artifact_id 卸载 mcp / plugin")
    p_uninstall.add_argument("artifact_id", help="服务端返回的 artifact id")

    p_tag = sub.add_parser("tag", help="整体替换 artifact 的 tag 集")
    p_tag.add_argument("artifact_id", help="目标 artifact id")
    p_tag.add_argument("tags", help="逗号分隔的 tag 列表")

    p_autotag = sub.add_parser("autotag", help="触发服务端自动打标并轮询完成")
    p_autotag.add_argument("--ids", default=None, help="逗号分隔的 artifact id 子集")
    p_autotag.add_argument("--max-polls", type=int, default=60, dest="max_polls")

    p_scan = sub.add_parser("scan", help="扫描本机各 agent 已装的 MCP / plugin / skill")
    p_scan.add_argument("--sync", action="store_true", help="把扫描结果上报服务端供 Web 面板展示")
    p_scan.add_argument("--json", action="store_true", help="输出原始 JSON")
    p_scan.add_argument("--all", action="store_true", help="包含未检测到的 agent（显示为 ○）")

    parser.set_defaults(_handlers={
        "status": cmd_status,
        "add": cmd_add,
        "search": cmd_search,
        "sync": cmd_sync,
        "config": cmd_config,
        "list": cmd_list,
        "install": cmd_install,
        "uninstall": cmd_uninstall,
        "tag": cmd_tag,
        "autotag": cmd_autotag,
        "scan": cmd_scan,
    })
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    handler = args._handlers[args.cmd]
    return int(handler(args) or 0)


if __name__ == "__main__":
    raise SystemExit(main())
