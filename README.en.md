<div align="center">

# AIForge

**Unified registry & router for agent skills, MCP servers, and Claude Code plugins.**

AIForge collects fragmented **skills**, **MCP servers**, and **Claude Code plugins** into a single table, then has a small model hand-pick only the few that matter for each conversation. One control plane; zero clutter in your context window.

[简体中文](README.md) ·
[Quick Start](#quick-start) ·
[Web Admin](#web-admin-console) ·
[How it works](#how-it-works) ·
[Server](server/) · [Plugin](plugin/) · [Web](web/) · [Docs](docs/)

</div>

---

## Why AIForge

By 2026 the Claude Code / Codex / Cursor extension ecosystem has exploded:

- `anthropics/skills`, `obra/superpowers`, `vercel-labs/skills`, `pbakaus/impeccable` — over ten thousand public skills
- `@modelcontextprotocol/server-*`, `@playwright/mcp`, countless self-hosted MCP servers — exposing hundreds of tools
- A Claude Code plugin marketplace that's already fragmenting

Three different artifact ecosystems, three old problems:

1. **Token waste** — loading 200 skills + 30 MCPs' tool lists eats half your context budget before you say a word.
2. **Capability conflicts** — three `review` skills, two `verify` skills, four test runners, five browser-automation MCPs. Agents pick at random or, worse, run them all.
3. **Fragmented management** — skills in git, MCP config in `settings.json`, plugins in `~/.claude/plugins/`. Nothing tells you what you actually have installed.

**AIForge solves all three.**

- A self-hosted server indexes your skill / MCP / plugin repositories
- For each user prompt, a small model picks the top *N* (default 3) artifacts that match the task and injects them
- MCP tools no longer flood your context — a runtime gateway exposes **only the tools belonging to the currently active set**
- A web admin console gives you one place for browsing, tagging, ingesting, auto-classification, recommendation preview, approval queues, and local install

## Web Admin Console

Nine routes, dense enterprise-grade UI, all in zh-Hans for now (English i18n landing in v0.3).

```
/                  Dashboard: KPIs, throughput chart, recent activity, 4-step onboarding
/artifacts         Browse all artifacts (skill / mcp / plugin); filter by type / tag / repo
/artifacts/[id]    Detail: body, metadata, tag editor, one-click copy of mcp_config, plugin manifest
/tags              20 built-in tags + custom; per-tag usage bar
/ingest            Paste GitHub URL → shallow clone → live state-machine timeline
/autotag           Small-model batch classification with progress bar + ETA + live stream
/playground        Type a prompt, see top-K recommendations with score bars + rerank reasons
/discovery         Approval queue for remote-finder discoveries
/settings          API base URL, API key, default top-K, theme
```

Try it:

```bash
cd web
npm install
npm run dev          # → http://localhost:3500
```

The web app falls back to demo data when the backend isn't reachable, so the UI is always demoable.

## How it works

```
┌─────────────────┐        ┌─────────────────────────────────────────┐
│  Claude Code    │  HTTP  │  AIForge server                          │
│  (plugin/hook)  │ ─────▶ │  ┌──────────┐   ┌──────────────────┐    │
│                 │        │  │ embed    │ ─▶│  vector index    │    │
│ UserPromptSubmit│        │  └──────────┘   └──────────────────┘    │
│      hook       │        │       │                 │                │
│        │        │        │       ▼                 ▼                │
│        ▼        │        │  ┌──────────┐    ┌──────────────┐       │
│  inject top-N   │ ◀───── │  │ rerank   │ ─▶ │ dedup + pick │       │
│  into context   │        │  │ Qwen-1.5B│    └──────────────┘       │
└─────────────────┘        │  │ or Haiku │                            │
        ▲                  │  └──────────┘                             │
        │                  │                                           │
        │  MCP stdio       │  ┌──────────────────────────────────┐    │
┌───────┴─────────┐ ◀───── │  │ Artifact registry (SQLite)       │    │
│ aiforge-mcp     │        │  │ one table, three kinds           │    │
│ runtime gateway │        │  │ + flat multi-tag (manual / auto) │    │
└─────────────────┘        │  └──────────────────────────────────┘    │
                           └─────────────────────────────────────────┘
```

When the server is unreachable, the plugin transparently degrades to **local fallback**: a cached SQLite + keyword index keeps recommendations flowing, just without small-model reranking.

## Quick Start

### 1. Run the server

```bash
git clone https://github.com/<you>/aiforge.git
cd aiforge/server
docker compose -f docker/docker-compose.yml up -d
# HTTP API → http://localhost:8765
```

Seed it:

```bash
curl -X POST http://localhost:8765/v1/ingest \
  -H 'Content-Type: application/json' \
  -d '{"github_url": "https://github.com/obra/superpowers-skills"}'

curl -X POST http://localhost:8765/v1/ingest \
  -H 'Content-Type: application/json' \
  -d '{"github_url": "https://github.com/anthropics/skills"}'
```

Ingest auto-detects what's in the repo — `.claude-plugin/plugin.json` → plugin row; `mcp.json` → mcp row; each `SKILL.md` → skill row. A single repo can produce multiple kinds simultaneously.

### 2. Install the plugin (auto-inject recommendations)

```bash
cd aiforge/plugin
./install.sh --server http://localhost:8765
```

Writes a `UserPromptSubmit` hook into `~/.claude/settings.json`; drops the plugin at `~/.claude/plugins/aiforge/`.

### 3. (Optional but recommended) Run the web admin

```bash
cd aiforge/web
npm install
npm run dev          # → http://localhost:3500
```

### 4. (Optional) Run the MCP runtime gateway

Have Claude Code connect to a single MCP that AIForge routes to N downstreams:

```jsonc
// ~/.claude/settings.json
{
  "mcpServers": {
    "aiforge": { "command": "aiforge-mcp" }
  }
}
```

On startup `aiforge-mcp` pulls the active MCP set from the server, spawns each downstream, aggregates their tool lists, and routes calls via the `<name>__<tool>` namespace.

## Key features

- **Unified artifact model** — one `Skill` table carries skill / mcp / plugin rows discriminated by `artifact_type`; one `/v1/artifacts` API on top
- **Flat multi-tag grouping** — 20 built-in tags (browser-automation, reverse-engineering, ui, testing, security ...) plus anything you add
- **Small-model auto-tagging** — the reranker doubles as a classifier; pick 1-3 tags per artifact from the built-in set, serial batch with progress
- **Two-stage recommender** — `all-MiniLM-L6-v2` recall top-30; Qwen2.5-1.5B (or Haiku) reranks to top-3
- **MCP runtime gateway** — a single `aiforge-mcp` process aggregates many downstream MCPs and namespaces their tools
- **Auto dedupe** — cluster semantically equivalent artifacts; pick the best representative by source reputation, recency, and install count
- **One-click install** — web panel or `/aiforge:install` writes MCPs into `settings.json` (with backup) and clones plugins into `~/.claude/plugins/`
- **Remote skill-finder** (off by default) — scans GitHub for high-quality new repos into a **manual approval queue**
- **Local fallback** — server down? cached SQLite keeps the plugin working
- **Self-host friendly** — runs on a $5/mo VPS; default models cost nothing in API

## Slash commands

Available after the plugin is installed:

```
/aiforge:status              # server health + local cache state
/aiforge:add <github-url>    # ingest a repo
/aiforge:search <query>      # keyword search artifacts
/aiforge:sync                # pull latest index to local cache
/aiforge:config              # view / edit plugin config
/aiforge:list [--type=...]   # list artifacts (with installed markers)
/aiforge:install <id>        # install MCP into settings.json / plugin into ~/.claude/plugins
/aiforge:uninstall <id>      # reverse of install
/aiforge:tag <id> <t1,t2>    # manually tag an artifact
/aiforge:autotag             # trigger auto-tagging with live progress
```

## Architecture

See [docs/architecture.en.md](docs/architecture.en.md) (English) / [docs/architecture.md](docs/architecture.md) (Chinese). Mermaid sources in [docs/diagrams/](docs/diagrams/).

| Component | Choice | Why |
|---|---|---|
| HTTP API | FastAPI + Uvicorn | async, built-in OpenAPI, mature ecosystem |
| Vector store | SQLite + sqlite-vss | zero ops, embedded, fast enough up to ~100k artifacts |
| Embedder | sentence-transformers (`all-MiniLM-L6-v2`) | 384-dim, CPU-friendly, well-benchmarked |
| Reranker / tagger | Ollama (Qwen2.5-1.5B, default) / Claude Haiku API | tiny, fast, surprisingly good at ranking |
| MCP gateway | asyncio + JSON-RPC | no extra deps; SDK migration deferred |
| Web admin | Next.js 14 + Tailwind + hand-rolled shadcn-style components | static export, can be served by FastAPI |
| Plugin | bash + Python (stdlib only) | native Claude Code, zero third-party deps |

## Status

- [x] Server core
- [x] Two-stage recommender
- [x] GitHub ingest
- [x] Plugin + hook
- [x] Local fallback
- [x] Remote finder (with manual approval)
- [x] **Unified artifact model** (skill / mcp / plugin) · `v0.2`
- [x] **Flat multi-tag + auto-tagging** · `v0.2`
- [x] **Web admin console** (9 routes) · `v0.2`
- [x] **MCP runtime gateway MVP** (stdio) · `v0.2`
- [ ] Gateway hot reload, HTTP/SSE downstream, dynamic active set · `v0.3`
- [ ] Cross-agent support — Codex / Cursor / Gemini CLI · `v0.3`
- [ ] Online recommendation-quality eval + A/B · `v0.3`

## Contributing

See [CONTRIBUTING.en.md](CONTRIBUTING.en.md). Most-wanted contributions right now:

1. Real-world artifact corpora for recommendation / tagging quality tests
2. Dedup test cases
3. Reranker / tagger prompt improvements
4. Web admin i18n (English / 日本語 / Deutsch)

## License

Apache 2.0 — see [LICENSE](LICENSE).
