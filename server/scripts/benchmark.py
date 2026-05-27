#!/usr/bin/env python3
"""推荐管线 benchmark：测延迟、QPS、失败率。

示例：
    python server/scripts/benchmark.py
    python server/scripts/benchmark.py --queries 500 --top-k 5
    python server/scripts/benchmark.py --json-output bench.json
"""

from __future__ import annotations

import argparse
import json
import math
import random
import sys
import time
from pathlib import Path
from typing import Any

from _common import APIError, Color, add_connection_args, die, make_client, render_table

# 多样化的真实 prompt（覆盖中英文 + 主流编程场景）
PROMPTS: list[str] = [
    "审查这个 PR 看看有没有安全问题",
    "请帮我重构这段 Python 代码，让它更可读",
    "为这个函数写单元测试，覆盖边界条件",
    "调试一下为什么这个 React 组件每次都重新渲染",
    "我想把 SQL 查询从 PostgreSQL 迁移到 SQLite",
    "设计一个 RESTful API 用于管理用户订阅",
    "把这个应用部署到 AWS Lambda + API Gateway",
    "写一份中文文档说明这个模块的用法",
    "优化前端打包体积，目前 main.js 超过 2MB",
    "找出这个 Node.js 服务的内存泄漏",
    "Review my Dockerfile for security best practices",
    "Help me write a GitHub Actions workflow for CI/CD",
    "Refactor this callback-based code to async/await",
    "Add proper error handling and logging to this script",
    "Generate TypeScript types from this JSON schema",
    "Design a dark-mode-friendly color palette for this UI",
    "Audit the OWASP top-10 risks in this Express app",
    "Improve the accessibility (a11y) of this form component",
    "Profile and speed up this slow database query",
    "Convert this REST endpoint into a GraphQL resolver",
]


def percentile(sorted_values: list[float], p: float) -> float:
    if not sorted_values:
        return 0.0
    if len(sorted_values) == 1:
        return sorted_values[0]
    k = (len(sorted_values) - 1) * p
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return sorted_values[int(k)]
    return sorted_values[f] + (sorted_values[c] - sorted_values[f]) * (k - f)


def run_once(client: Any, prompt: str, top_k: int) -> tuple[float, bool, str]:
    """返回 (耗时秒, 是否成功, 错误信息)。"""
    start = time.perf_counter()
    try:
        client.post(
            "/v1/recommend",
            body={"prompt": prompt, "top_k": top_k},
            timeout=30,
        )
        return time.perf_counter() - start, True, ""
    except APIError as e:
        return time.perf_counter() - start, False, str(e)


def fmt_ms(seconds: float) -> str:
    return f"{seconds * 1000:.1f} ms"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="推荐管线 benchmark：测延迟、QPS、失败率。",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    add_connection_args(parser)
    parser.add_argument("--queries", type=int, default=100, help="测试请求数（默认 100）")
    parser.add_argument("--top-k", type=int, default=3, help="每次推荐返回数（默认 3）")
    parser.add_argument("--warmup", type=int, default=5, help="预热请求数（默认 5）")
    parser.add_argument("--json-output", type=Path, help="把结果写入 JSON 文件")
    parser.add_argument("--seed", type=int, default=42, help="prompt 选取随机种子")
    args = parser.parse_args()

    if args.queries < 1:
        die("--queries 必须 >= 1")

    client = make_client(args, timeout=30)
    rng = random.Random(args.seed)

    # 健康检查
    print(Color.cyan(f">> 检查服务端：{args.server}"))
    try:
        health = client.get("/v1/health", timeout=10)
    except APIError as e:
        die(str(e))
    print(
        f"   状态：{Color.green(health.get('status', '?'))}  "
        f"已收录 skill：{Color.bold(str(health.get('skills_count', 0)))}  "
        f"reranker：{health.get('reranker_available')}"
    )

    if health.get("skills_count", 0) == 0:
        print(Color.yellow("   ! 警告：库中无任何 skill，benchmark 结果意义有限。"))

    # 预热
    if args.warmup > 0:
        print(Color.cyan(f">> 预热 {args.warmup} 次..."))
        for _ in range(args.warmup):
            run_once(client, rng.choice(PROMPTS), args.top_k)

    # 正式跑
    print(Color.cyan(f">> 正式 benchmark：{args.queries} 次请求, top_k={args.top_k}"))
    latencies: list[float] = []
    failures: list[str] = []
    total_start = time.perf_counter()

    for i in range(args.queries):
        prompt = rng.choice(PROMPTS)
        elapsed, ok, err = run_once(client, prompt, args.top_k)
        if ok:
            latencies.append(elapsed)
        else:
            failures.append(err)
        if (i + 1) % 10 == 0 or i == args.queries - 1:
            sys.stderr.write(
                f"\r  进度 {i + 1}/{args.queries}  "
                f"成功 {len(latencies)}  失败 {len(failures)}".ljust(80)
            )
            sys.stderr.flush()
    sys.stderr.write("\n")

    wall_time = time.perf_counter() - total_start
    sorted_lat = sorted(latencies)

    stats = {
        "queries": args.queries,
        "top_k": args.top_k,
        "warmup": args.warmup,
        "succeeded": len(latencies),
        "failed": len(failures),
        "failure_rate": len(failures) / args.queries if args.queries else 0.0,
        "wall_time_sec": wall_time,
        "qps": len(latencies) / wall_time if wall_time > 0 else 0.0,
        "latency_ms": {
            "min": (sorted_lat[0] * 1000) if sorted_lat else 0.0,
            "max": (sorted_lat[-1] * 1000) if sorted_lat else 0.0,
            "mean": (sum(sorted_lat) / len(sorted_lat) * 1000) if sorted_lat else 0.0,
            "p50": percentile(sorted_lat, 0.50) * 1000,
            "p95": percentile(sorted_lat, 0.95) * 1000,
            "p99": percentile(sorted_lat, 0.99) * 1000,
        },
    }

    # 报告
    print()
    print(Color.bold("== Benchmark 结果 =="))
    print(
        render_table(
            ["指标", "值"],
            [
                ["请求总数", str(stats["queries"])],
                ["成功", Color.green(str(stats["succeeded"]))],
                ["失败", Color.red(str(stats["failed"])) if stats["failed"] else "0"],
                ["失败率", f"{stats['failure_rate'] * 100:.2f}%"],
                ["墙钟时长", f"{stats['wall_time_sec']:.2f} s"],
                ["QPS", f"{stats['qps']:.2f}"],
                ["延迟 min", fmt_ms(stats["latency_ms"]["min"] / 1000)],
                ["延迟 mean", fmt_ms(stats["latency_ms"]["mean"] / 1000)],
                ["延迟 p50", fmt_ms(stats["latency_ms"]["p50"] / 1000)],
                ["延迟 p95", fmt_ms(stats["latency_ms"]["p95"] / 1000)],
                ["延迟 p99", fmt_ms(stats["latency_ms"]["p99"] / 1000)],
                ["延迟 max", fmt_ms(stats["latency_ms"]["max"] / 1000)],
            ],
        )
    )

    if failures:
        print()
        print(Color.yellow("== 失败样本（前 5 条）=="))
        for msg in failures[:5]:
            print(f"  - {msg}")

    if args.json_output:
        args.json_output.parent.mkdir(parents=True, exist_ok=True)
        args.json_output.write_text(json.dumps(stats, indent=2, ensure_ascii=False))
        print()
        print(Color.cyan(f">> 已写入 JSON：{args.json_output}"))

    # 退出码：失败率 > 0 时非 0
    if stats["failed"] == args.queries:
        return 2
    if stats["failed"] > 0:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
