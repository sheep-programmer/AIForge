#!/usr/bin/env python
"""导出 FastAPI 的 OpenAPI schema 到 JSON。

前端 ``web/lib/api-schema.ts`` 由该文件经 ``openapi-typescript`` 生成，从而让
前端类型直接源自后端 pydantic 契约、消除手工同步漂移。

用法：
    uv run python scripts/export_openapi.py            # 写入 ../web/openapi.json
    uv run python scripts/export_openapi.py -o out.json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from aiforge.main import app

DEFAULT_OUT = Path(__file__).resolve().parents[2] / "web" / "openapi.json"


def main() -> None:
    parser = argparse.ArgumentParser(description="导出 OpenAPI schema 到 JSON")
    parser.add_argument(
        "-o",
        "--out",
        type=Path,
        default=DEFAULT_OUT,
        help=f"输出路径（默认 {DEFAULT_OUT}）",
    )
    args = parser.parse_args()

    schema = app.openapi()
    text = json.dumps(schema, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(text, encoding="utf-8")
    schema_count = len(schema.get("components", {}).get("schemas", {}))
    print(f"已写入 {args.out}（{schema_count} 个 schema 组件）")


if __name__ == "__main__":
    main()
