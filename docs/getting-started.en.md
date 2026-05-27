# 15-minute tour of AIForge

> [中文版](getting-started.md)

This guide assumes you already have Claude Code installed but have never touched AIForge. By the end you'll have:

- A local AIForge server running via docker compose
- A working Claude Code plugin whose `UserPromptSubmit` hook injects recommended artifacts on every prompt
- A Next.js web admin with 9 pages showing every artifact, tag, and ingestion job
- (Optionally) the `aiforge-mcp` runtime gateway, so N downstream MCP servers look like one to your agent

Every step ends with a verifiable `curl` or UI check. Don't move on until one passes.

---

## 0. What you need

| Tool | Why | Version |
|------|-----|---------|
| Docker + docker compose v2 | The server | 24+ |
| Node.js | The web admin | 20+ |
| Python | Plugin install (the hook is a stdlib py3 script); also for running the server natively | 3.11+ |
| `curl` / `jq` | Verifying the API | any recent |

You do **not** need an Anthropic API key. The default reranker uses local Ollama + Qwen2.5-1.5B — zero API spend.

---

## 1. The 5-minute path: docker compose all-in

```bash
git clone https://github.com/<you>/aiforge.git    # placeholder; use your fork
cd aiforge
docker compose -f server/docker/docker-compose.yml up -d
```

The container binds `127.0.0.1:8765` (**loopback only by default** — public exposure must go through nginx; see server-deployment). Give it ~20s to load the sentence-transformer weights, then:

```bash
curl http://127.0.0.1:8765/v1/health | jq
# {
#   "status": "ok",
#   "version": "0.2.0",
#   "artifacts_count": 0,
#   "reranker_available": false
# }
```

`artifacts_count: 0` is correct — we haven't ingested anything. `reranker_available: false` is because the default compose sets `AIFORGE_RERANKER=none` (fastest path). To enable the Ollama reranker, use [examples/docker-compose.with-ollama.yml](../examples/docker-compose.with-ollama.yml).

### Seed your first repo

```bash
# Pull in Anthropic's official skill library
curl -X POST http://127.0.0.1:8765/v1/ingest \
  -H 'Content-Type: application/json' \
  -d '{"github_url": "https://github.com/anthropics/skills"}'
# → {"job_id": "01J...", "status": "queued"}
```

Ingestion is async. Poll the job:

```bash
JOB=01J...
curl -s http://127.0.0.1:8765/v1/ingest/$JOB | jq
# status transitions queued → cloning → splitting → embedding → done
```

The pipeline auto-detects:
- `.claude-plugin/plugin.json` at repo root → plugin row
- `mcp.json` or `package.json` with an `mcpName` field → mcp row
- Every `SKILL.md` it can find → skill row

A single repo emitting all three is normal. That's the point of v0.2's **unified artifact model**.

---

## 2. Verify the server is healthy

```bash
curl -s http://127.0.0.1:8765/v1/health | jq '.artifacts_count'
# 39                                # depends on which repo you ingested

curl -s http://127.0.0.1:8765/v1/artifacts | jq '.total'
# 39

# Filter by type
curl -s 'http://127.0.0.1:8765/v1/artifacts?type=skill'  | jq '.total'
curl -s 'http://127.0.0.1:8765/v1/artifacts?type=mcp'    | jq '.total'
curl -s 'http://127.0.0.1:8765/v1/artifacts?type=plugin' | jq '.total'

# Actually call the recommender
curl -s -X POST http://127.0.0.1:8765/v1/recommend \
  -H 'Content-Type: application/json' \
  -d '{"prompt": "review this PR for SQL injection", "top_k": 3}' \
  | jq '.recommendations[] | {name, score, rerank_reason}'
```

Three scored hits is success. Without a reranker you get pure vector cosine — still useful.

---

## 3. Install the Claude Code plugin

```bash
cd plugin
./install.sh --server http://127.0.0.1:8765
```

The script:

1. Copies the entire `plugin/` directory to `~/.claude/plugins/aiforge/` (use `--dev` to symlink instead)
2. Writes `server_url`, `top_k`, `timeout_ms` to `~/.config/aiforge/config.toml`
3. Claude Code picks up the bundled `.claude-plugin/plugin.json` and registers a `UserPromptSubmit` hook

What the hook does: every time you hit Enter, Claude Code pipes a JSON payload (including your prompt) over stdin to `~/.claude/plugins/aiforge/hooks/on-user-prompt` **before** the model call. The hook calls `/v1/recommend`, formats the top-3 artifacts as a system note, and injects them back. Budget is 250 ms — if the server times out, it falls back to the local cache silently.

Restart Claude Code so it picks up the new plugin, then:

```
/aiforge:status        # → server ok / cache N / last recommend ...
```

---

## 4. Watch a recommendation land

In a fresh session, try:

```
> Audit src/auth/login.py for SQL injection
```

The first line above the response will read:

```
[aiforge] loaded: anthropics:security-review, superpowers:pre-commit, ljg-skills:concept-anatomist
```

That's the hook at work — three artifact bodies are now in the system message. If the injection feels noisy, flip `enabled = false` in `~/.config/aiforge/config.toml`.

You can also preview from the CLI without burning a Claude turn:

```bash
/aiforge:search "browser end-to-end test"
```

---

## 5. Open the web admin

```bash
cd web
npm install            # ~30s the first time
npm run dev            # → http://localhost:3500
```

If the backend is unreachable, the frontend falls back to demo data — the UI is always demoable.

A whirlwind tour of the 9 routes:

| Path | What it's for |
|------|---------------|
| `/` | Dashboard: KPI cards, recommendation traffic chart, 4-step onboarding |
| `/artifacts` | Browse every artifact, filter by type / tag / repo |
| `/artifacts/[id]` | Detail: body, metadata, tag editor, copy-to-clipboard `mcp_config` |
| `/tags` | 20 builtin tags + custom; visualizes which tags are popular |
| `/ingest` | Paste a GitHub URL → live state-machine timeline (clone / split / embed / done) |
| `/autotag` | Kick off bulk auto-tag + progress bar + live activity stream |
| `/playground` | Type a prompt, see top-K with score bars and rerank reasons |
| `/discovery` | Approval queue for repos the remote finder surfaced |
| `/settings` | API URL, Bearer key, default top-K, theme |

Detailed operator manual: [web-admin.md](web-admin.md) (coming soon).

---

## 6. (Optional) Wire up the MCP runtime gateway

If you have 5 MCP servers configured (filesystem, playwright, brave-search, postgres, github), Claude Code dumps every tool list into context at startup — thousands of tokens before you've typed anything.

AIForge's answer: **`aiforge-mcp` is one MCP server to Claude Code, but it connects to N downstream MCP servers** and only exposes the active subset.

Install:

```bash
cd server
pip install -e .                                       # installs the aiforge-mcp entrypoint
which aiforge-mcp                                      # confirm it's on PATH
```

Or, without polluting global Python:

```bash
uv tool install --from ./server aiforge
```

Wire it into `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "aiforge": {
      "command": "aiforge-mcp",
      "env": { "AIFORGE_SERVER_URL": "http://127.0.0.1:8765" }
    }
  }
}
```

On startup `aiforge-mcp`:
1. Calls `GET /v1/artifacts?type=mcp&active=true`
2. Spawns each active MCP as a stdio child
3. Aggregates their tool lists, namespaced as `<artifact_name>__<tool_name>`
4. Claude Code sees one MCP server named `aiforge`

The MVP doesn't hot-reload — restart Claude Code after editing the active set. Full design: [extension-spec.md §7](extension-spec.md).

---

## 7. Common next steps

### Bulk-ingest 7 popular skill repos

```bash
./examples/seed-popular-skills.sh
# obra/superpowers-skills, anthropics/skills, pbakaus/impeccable,
# garrytan/gstack, lijigang/ljg-skills, vercel-labs/skills,
# affaan-m/everything-claude-code
```

You should land in the low hundreds of artifacts.

### Run autotag

Fresh artifacts have no tags. Let the small model pick 1-3 of the 20 builtin tags per artifact:

```bash
curl -X POST http://127.0.0.1:8765/v1/admin/autotag \
  -H 'Content-Type: application/json' \
  -d '{"limit": 200}'
# → {"job_id": "...", "total": 200}

# Or hit "Start" on the /autotag page in the web admin — friendlier progress UI
```

You need the Ollama reranker on (no LLM backend = no tagger). See [server-deployment.md §1](server-deployment.md).

### Review the discovery queue

With the remote finder enabled (off by default), it scans GitHub trending daily and parks high-signal new repos on `/discovery` **for your approval**. Nothing reaches the live index until you say yes.

```bash
# Try it once:
AIFORGE_ENABLE_REMOTE_FINDER=true \
  docker compose -f server/docker/docker-compose.yml up -d
```

### Ship it to a VPS

See [server-deployment.en.md](server-deployment.en.md): sizing, systemd, nginx + TLS, backups, upgrades, hardening.

---

## 8. Troubleshooting

### `Bind for 0.0.0.0:8765 failed: port is already allocated`

Something else is on 8765. Edit `server/docker/docker-compose.yml`:

```yaml
ports:
  - "127.0.0.1:18765:8765"      # host 18765, container still 8765
```

Then install the plugin with `--server http://127.0.0.1:18765`.

### `reranker_available: false` never flips

The default compose has `AIFORGE_RERANKER=none`, so it stays false. For local LLM reranking:

```bash
docker compose -f examples/docker-compose.with-ollama.yml up -d
docker compose -f examples/docker-compose.with-ollama.yml exec ollama \
  ollama pull qwen2.5:1.5b
```

The model is ~1 GB; first pull takes a minute.

### `libblas.so.3: cannot open shared object file`

`sqlite-vss` needs BLAS at runtime when you run **without** Docker. Ubuntu/Debian:

```bash
sudo apt install libblas3 liblapack3
```

The Docker image ships these — host doesn't need them.

### First ingest feels slow

Cold start loads the sentence-transformer weights (~90 MB) and warms the first encode batch. A hundred-SKILL repo in 30-60s is normal. Subsequent ingests are fast — weights stay resident.

### `/aiforge:status` says the server is unreachable

```bash
# 1) Is the server up?
curl -fsS http://127.0.0.1:8765/v1/health

# 2) Does the plugin point at the right URL?
cat ~/.config/aiforge/config.toml | grep server_url

# 3) Is the hook wired in?
jq '.hooks.UserPromptSubmit' ~/.claude/settings.json
```

Fix whichever fails.

---

## Where to next

- Go to production: [server-deployment.en.md](server-deployment.en.md)
- Architecture deep dive: [architecture.en.md](architecture.en.md)
- Full slash-command reference: [plugin-usage.en.md](plugin-usage.en.md)
- Recommender internals: [recommender-internals.en.md](recommender-internals.en.md)
- Operational FAQ: [faq.en.md](faq.en.md)
