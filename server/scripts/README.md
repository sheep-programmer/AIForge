# AIForge server scripts

> 中文 + English

服务端运维 / 数据维护脚本集合。所有脚本都是 stdlib + `pyyaml`，通过 HTTP 调用 AIForge 服务端，不直接 import 业务模块。

Operational / data-maintenance scripts for the AIForge server. Pure stdlib (+ `pyyaml`); everything talks to the server over HTTP — no business module imports.

---

## 通用约定 / Common conventions

- 服务端地址：`--server` 参数，或环境变量 `AIFORGE_SERVER`（默认 `http://localhost:8765`）
- API key：`--api-key`，或环境变量 `AIFORGE_API_KEY`
- 彩色输出：默认开启，TTY 检测；`--no-color` 或 `NO_COLOR=1` 关闭
- 所有脚本均支持 `--help`

```
Server URL:       --server  / $AIFORGE_SERVER  (default http://localhost:8765)
API key:          --api-key / $AIFORGE_API_KEY
Disable colors:   --no-color or NO_COLOR=1
Help:             --help on every script
```

---

## 1. `seed_skills.py` — 批量入库 / Bulk ingest

并发触发多个仓库的 ingest（上限 3），轮询直到全部 done/error。

Concurrently submit ingest jobs for many repos (max 3 in flight), then poll until each finishes.

```bash
# 默认从 examples/popular-skills.yaml 入库
python server/scripts/seed_skills.py

# 指定自定义清单
python server/scripts/seed_skills.py --from-file my-skills.yaml

# 远程服务端 + API key
AIFORGE_API_KEY=xxx python server/scripts/seed_skills.py \
    --server https://aiforge.example.com
```

退出码 / Exit codes：`0` 全部成功 / `1` 部分失败 / `2` 全部失败。

YAML 格式见 [`examples/popular-skills.yaml`](../../examples/popular-skills.yaml)：

```yaml
skills:
  - url: https://github.com/anthropics/skills
    branch: main          # 可选 / optional
    description: 说明      # 可选，仅文档用 / optional, doc-only
```

---

## 2. `benchmark.py` — 推荐管线压测 / Recommend pipeline benchmark

预热 + N 次推荐请求，输出 p50/p95/p99/QPS/失败率。

Warmup then N recommend requests; reports p50/p95/p99/QPS/failure-rate.

```bash
python server/scripts/benchmark.py                       # 100 次
python server/scripts/benchmark.py --queries 500 --top-k 5
python server/scripts/benchmark.py --json-output bench.json
```

内置 20 条多样的中英文 prompt（code review / security / refactor / debug / design / deploy / SQL 迁移 / a11y 等）。

20 diverse Chinese + English prompts are built in.

---

## 3. `admin_cli.py` — 管理 CLI / Admin CLI

面向运维 / 数据维护，**不是给最终用户的**（最终用户用 plugin slash 命令）。

Operator-facing — end users should use plugin slash commands instead.

```bash
# skills
python server/scripts/admin_cli.py skills list --limit 20
python server/scripts/admin_cli.py skills list --repo anthropics/skills
python server/scripts/admin_cli.py skills list --inactive-only
python server/scripts/admin_cli.py skills show <id>
python server/scripts/admin_cli.py skills show <id> --show-body
python server/scripts/admin_cli.py skills activate <id>
python server/scripts/admin_cli.py skills deactivate <id>
python server/scripts/admin_cli.py skills delete <id> --yes

# ingest / job
python server/scripts/admin_cli.py ingest https://github.com/anthropics/skills
python server/scripts/admin_cli.py ingest https://... --wait
python server/scripts/admin_cli.py job <job-id>

# discoveries（需启用 ENABLE_REMOTE_FINDER）
python server/scripts/admin_cli.py discoveries list --decision pending
python server/scripts/admin_cli.py discoveries approve <id> --notes "looks good"
python server/scripts/admin_cli.py discoveries reject  <id>

# health
python server/scripts/admin_cli.py health
python server/scripts/admin_cli.py health --json
```

---

## 4. `export_skills.py` — 导出 / Export

导出当前 server 已收录 skill 的**元数据**到 YAML（不含 body；body 会在导入端重新抓取）。

Dumps skill **metadata** (no body) to YAML for backup / migration. The destination server re-fetches bodies from `source_url`.

```bash
python server/scripts/export_skills.py --output backup.yaml
python server/scripts/export_skills.py --output anthropics.yaml \
    --repo anthropics/skills
```

---

## 5. `import_skills.py` — 导入 / Import

读取 `export_skills.py` 的输出，按 `source_url` 去重后触发 ingest。

Reads an exported YAML, dedupes by `source_url`, and triggers ingest per unique repo.

```bash
python server/scripts/import_skills.py --input backup.yaml
python server/scripts/import_skills.py --input backup.yaml --wait
```

---

## 设计取舍 / Design notes

- **零额外依赖**：除 `pyyaml`（已在 `pyproject.toml` 主依赖）全部 stdlib，便于在任意环境直接运行。
- **不 import 业务模块**：所有交互走 HTTP，脚本与服务端可独立部署、独立升级。
- **错误友好**：连接失败提示具体启动命令，而不是 raw stack trace。
- **进度可见**：seed/benchmark/import 都有单行实时进度（TTY 下）。

- **Zero extra deps** beyond `pyyaml` (in main deps).
- **No business module imports** — pure HTTP boundary, decouples script lifecycle from server.
- **Friendly errors** — connection failures point to the right startup command, not raw stack traces.
- **Live progress** for seed/benchmark/import (TTY-aware single-line updates).
