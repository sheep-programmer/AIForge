# Roadmap

> [中文版本](roadmap.md)

Public plan for what's next. Push back, claim items. Dates are **targets, not promises**.

---

## Version overview

| Version | Theme | Status |
|---------|-------|--------|
| v0.1 | Recommender MVP | Shipped |
| v0.2 | Unified Artifact + Web Admin | Shipped |
| v0.3 | Cross-agent + Gateway hardening | In flight |
| v0.4+ | Federation, marketplace, A/B, learning signals | Exploring |

---

## Shipped

### v0.1 — Recommender MVP

The core skill-recommendation loop, end to end.

- [x] FastAPI server + health-check API
- [x] sqlite-vss vector search
- [x] `all-MiniLM-L6-v2` embedder
- [x] Two-stage recommender (vector recall → Ollama / Haiku / no-rerank backends)
- [x] Dedup + reputation scoring
- [x] GitHub ingest + multi-skill repo splitting
- [x] Claude Code plugin + `UserPromptSubmit` hook
- [x] Local fallback (cached SQLite keeps the plugin working when the server is down)
- [x] Remote finder scaffold (off by default) + manual approval queue
- [x] Docker image + multi-arch release

### v0.2 — Unified Artifact + Web Admin

Upgrade from "skill router" to "one-stop manager for skills / MCPs / plugins."

- [x] **Unified artifact data model** — one `Skill` table carries all three kinds via an `artifact_type` column; new `/v1/artifacts` API on top; legacy `/v1/skills` preserved for compatibility
- [x] **MCP / Plugin ingestion** — auto-detects `mcp.json`, `.claude-plugin/plugin.json`, and `package.json` MCP signals; a single repo can emit multiple artifact kinds
- [x] **Flat multi-tag system** — 20 built-in tags (browser-automation / reverse-engineering / ui / testing / security / ...) plus arbitrary custom tags; `source=manual|auto` distinguishes provenance
- [x] **Small-model auto-tagging** — reuses Qwen2.5-1.5B, serial batching with progress bar + ETA
- [x] **Web admin console (9 routes)** — dashboard / artifacts / tags / ingest / autotag / playground / discovery / settings; enterprise-density UI; falls back to demo data when the backend isn't reachable
- [x] **MCP runtime gateway MVP** — `aiforge-mcp` is one MCP server outward, connects to N downstream MCPs inward, routes by `<name>__<tool>` namespace, stdio transport
- [x] **Expanded plugin commands** — `/aiforge:list` / `install` / `uninstall` / `tag` / `autotag`

---

## In flight

### v0.3 — Cross-agent + Gateway hardening

This milestone solves two things: bring the MCP gateway from MVP to production-ready, and let AIForge step outside Claude Code.

- [ ] **MCP gateway hot reload** — swap the active set without restarting the gateway process; today you restart `aiforge-mcp`, which is not viable long-term
- [ ] **HTTP / SSE downstream transport** — currently only stdio downstreams are supported; the growing population of cloud-hosted MCPs uses HTTP/SSE, this must work
- [ ] **Dynamic active set** — the active set should track each turn's **recommendation result**, not just a preconfigured tag list. The whole point of the gateway is exposing only what's needed right now
- [ ] **Cross-agent — Codex** — Codex CLI prompt-hook integration
- [ ] **Cross-agent — Cursor** — via the Continue extension or native skill API
- [ ] **Cross-agent — Gemini CLI** — once Google's upstream hook protocol stabilizes
- [ ] **Web admin i18n** — English first; the framework is in place, mostly translation work
- [ ] **Online recommendation-quality evaluation** — sample a sliver of production traffic, score with a larger model, monitor for quality drift over time
- [ ] **Per-artifact secret store** — encrypt MCP `env` secrets independently; today they're plain JSON, which is a non-starter for sensitive deployments
- [ ] **Migrate to the official MCP Python SDK** — the v0.2 gateway is hand-rolled JSON-RPC; we'll move once SDK 1.x API surface stabilizes
- [ ] **Prometheus `/metrics`** — recommend latency, hit rate, cache hits, gateway active-set size
- [ ] **Automatic alembic migrations** — zero-touch upgrades

---

## v0.4 and beyond (more speculative)

- [ ] **Federated registries** — multiple AIForge instances discover each other's artifacts; a natural fit for "company-wide + team-private" two-tier setups
- [ ] **Public AIForge.dev catalog (opt-in submit)** — artifact authors can list their repos in a public index; purely opt-in, instances choose whether to pull
- [ ] **Skill marketplace UI in the web admin** — a browse page next to `/discovery` for the public catalog; ingest with one click
- [ ] **Recommendation A/B framework** — split prompt traffic across reranker prompts / models to compare ranking quality
- [ ] **Learning signals** — accept / reject / ignore feedback influences the next ranking
- [ ] **Chained recommendations** — return an **ordered** sequence of artifacts, not just a set

---

## What we won't do

- **Hosted SaaS** — AIForge is open-source self-host; no hosted service from us (you're welcome to run one)
- **Agent orchestration** — we answer "which artifacts now," not "in what order to run them." For that, use LangGraph / Autogen
- **Training our own embedder / reranker** — we use off-the-shelf OSS models; if quality lags, we swap to a better OSS model rather than training
- **Centralized MCP discovery service** — we're not aiming to become a new MCP "app store"; if a public catalog ships, it'll be opt-in and decentralized

---

## Design principles (why we ship some things and not others)

1. **Small core, big ecosystem** — AIForge itself only does registry, recommendation, and routing; artifacts come from the ecosystem
2. **Zero centralized dependencies** — self-hosting is first-class; any public services (like a future AIForge.dev) stay opt-in
3. **Local-first** — Ollama reranker and SQLite storage by default; no cloud services required
4. **Human in the loop** — automation (tagging, discovery, recommendation) is always overrideable by a human
5. **Your data, your machine** — no anonymous telemetry, no "cloud sync"; your SQLite is the single source of truth

---

## Influencing the roadmap

- Thumbs-up GitHub issues — we sort by reactions
- Open a real-world case study issue — the fastest way to bump priority
- Send a PR for a v0.3 item — we'll embrace it
- Open an RFC in Discussions for v0.4 directions
