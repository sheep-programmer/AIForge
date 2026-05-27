# Changelog

All notable changes documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/).

> 中文: [CHANGELOG.md](CHANGELOG.md)

## [0.2.0] · 2026-05-27

> ⚠️ **Rebrand**: `Skillforge` is now `AIForge` everywhere.
>
> - Python package `skillforge` → `aiforge`
> - Env vars `SKILLFORGE_*` → `AIFORGE_*`
> - Scripts `skillforge-server` → `aiforge-server`; new `aiforge-mcp`
> - Plugin path `~/.claude/plugins/skillforge/` → `~/.claude/plugins/aiforge/`
> - Slash commands `/skillforge:*` → `/aiforge:*`
> - Web localStorage / config dir keys follow suit
> - Hard cut — **no backward-compat aliases** retained

### Added — Unified artifact model
- `Skill` table now carries an `artifact_type` column (`skill` / `mcp` / `plugin`); a single table serves all three
- New `mcp_config` JSON column (transport / command / args / env / url / headers)
- New `plugin_manifest` JSON column (manifest summary + install_url)
- Module alias `Artifact = Skill` for new code
- New API: `GET /v1/artifacts`, `GET /v1/artifacts/{id}` (legacy `/v1/skills` alias retained)

### Added — Flat multi-tag + auto-tagging
- New `tags` table + `skill_tags` join with `source=manual|auto` and optional confidence `score`
- 20 builtin tags (`browser-automation`, `reverse-engineering`, `ui`, `testing`, `security`, `devops`, `db`, `docs`, `code-review`, `refactor`, `build`, `debug`, `api-integration`, `data-pipeline`, `ml`, `mobile`, `cli`, `git`, `auth`, `scraping`) seeded idempotently on startup
- New `aiforge.recommender.tagger` module: reuses the Qwen-1.5B / Haiku reranker to pick 1-3 best-fit tags from the builtin set per artifact
- New API: `/v1/tags*`, `/v1/artifacts/{id}/tags*`, `/v1/admin/autotag*`
- Recommendation responses now include `artifact_type`, `tags`, `mcp_config`, `plugin_manifest`

### Added — MCP / Plugin ingestion
- `ingestion/detectors.py` detects all three artifact kinds (priority: plugin → mcp → skill)
- `ingestion/mcp_adapter.py` parses `mcp.json` / `mcp-server.json` / `.mcp/config.json` / `package.json`
- `ingestion/plugin_adapter.py` parses `.claude-plugin/plugin.json`
- A single repo can produce multiple artifact kinds simultaneously

### Added — MCP runtime gateway
- New process `aiforge-mcp` exposes a single MCP server (stdio JSON-RPC) to Claude Code, internally connects N downstream MCPs
- `tools/call` routed by `<artifact_name>__<tool_name>` namespace
- On startup pulls the active MCP set from the server; filterable by tag / pin id
- One failed downstream doesn't crash the gateway
- MVP scope: stdio downstream only; no hot reload (restart picks up new active set)
- New env: `AIFORGE_GATEWAY_ACTIVE_TAGS`, `AIFORGE_GATEWAY_PIN_IDS`

### Added — Slash commands
- `/aiforge:list [--type=...] [--tag=...] [--installed]` — browse artifacts, including locally-installed markers
- `/aiforge:install <id>` — MCP into `settings.json` (with backup), plugin cloned to `~/.claude/plugins/`
- `/aiforge:uninstall <id>` — reverse
- `/aiforge:tag <id> <tag1,tag2,...>` — manual tagging
- `/aiforge:autotag` — trigger auto-tagging with live progress polling

### Added — Web admin (`web/`)
- Next.js 14 + Tailwind + hand-rolled shadcn-style component library
- Nine routes: Dashboard / Artifacts list & detail / Tags / Ingest / Autotag / Playground / Discovery / Settings
- "Editorial Engineering" design language: warm parchment + oxide green single accent + Fraunces serif + Inter + JetBrains Mono
- Signature visuals: rotating Reactor SVG, bottom LIVE FEED ticker, HealthPill heartbeat
- Falls back to demo data when the backend is offline — fully demoable
- ⌘K command palette, shareable URL state, HelpTip term explanations
- Port 3500; `next.config` rewrites `/api/*` to backend 8765

### Added — Docs
- New `docs/web-admin.md` / `.en.md` (bilingual)
- New `docs/artifact-format.md` / `.en.md` — replaces `docs/skill-format.md`, covers all three artifact formats
- New `docs/extension-spec.md` — internal v0.2 contract

### Changed — Database migration
- Alembic `002_artifact_and_tags.py`: adds `artifact_type` / `mcp_config` / `plugin_manifest` columns, creates `tags` / `skill_tags` tables
- Uses `op.batch_alter_table` to work around SQLite's ALTER limitations
- Safe to apply to existing v0.1 databases (existing rows default to `artifact_type='skill'`)

### Changed — Documentation overhaul
- README.md / README.en.md fully rewritten for three-artifact + Web admin
- docs/architecture.md / .en.md rewritten: new Artifact / Tag / gateway sections, updated data model + API contract
- docs/recommender-internals.md / .en.md adds an auto-tagger section + sequence diagrams
- docs/getting-started.md / .en.md adds Web admin + MCP gateway steps
- docs/server-deployment.md / .en.md refreshed systemd / docker-compose / reverse-proxy examples
- docs/plugin-usage.md / .en.md adds full reference for 5 new commands
- docs/comparison.md / .en.md adds six-way comparison table
- docs/faq.md / .en.md rewritten with 15 Q&As
- docs/roadmap.md / .en.md ticks off v0.2 deliverables, expands v0.3 / v0.4

### Removed
- `docs/skill-format.md` / `.en.md` — folded into `docs/artifact-format.md` / `.en.md`

## [0.1.0] · 2026-05-13

### Fixed
- `core/db.vss_search`: must wrap with `vss_search_params(emb, k)` or FAISS aborts the process
- `core/db.upsert_embedding`: `INSERT OR REPLACE` not supported on sqlite-vss virtual tables; switched to DELETE + INSERT
- `core/models.Skill`: added the `embedding: bytes` column (declared in spec but missing from the ORM, blocking deduper)
- `discovery/scorer.score_discovery`: clamp negative `stars` / `skill_count` before `math.log` to avoid domain errors

### Added
- Initial server: FastAPI + SQLite + sqlite-vss, two-stage recommender
- Initial Claude Code plugin: `UserPromptSubmit` hook + slash commands
- GitHub URL ingestion with multi-skill repo splitting
- Local fallback (BM25 over cached SQLite)
- Remote skill-finder with admin approval queue (off by default)
- Docker Compose deployment
- Seed scripts for popular public skill libraries
- Mermaid architecture + sequence diagrams (`docs/diagrams/`)
- Alembic baseline schema migration
- Comprehensive pytest suite (parser/splitter/deduper/scorer/API integration)
- Admin scripts: `seed_skills` / `benchmark` / `admin_cli` / `export_skills` / `import_skills`
