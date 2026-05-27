# Web Admin Console

> [中文版](web-admin.md)

The AIForge web admin (in [`web/`](../web/)) puts artifact browsing, ingest, tagging, recommendation preview, approval queues, and local install into nine routes — so you don't have to live in `curl` to understand your registry.

## Design language

**"Editorial Engineering"** — like a quant terminal meets Stripe Docs meets Linear:

- Warm parchment ground (`#FAFAF7`) plus a hairline grid background — distinct from the dead-white SaaS template
- A single brand accent: oxide green `#0E5C4A` (not the usual purple/blue/emerald)
- Typography: Fraunces (variable serif, display) + Inter (body) + JetBrains Mono (numbers / IDs)
- Global `font-variant-numeric: tabular-nums` — every digit aligns like a data terminal
- Signature elements: three-symbol logo (○ skill / ◆ mcp / ◇ plugin); a bottom-anchored LIVE FEED ticker; a rotating Reactor SVG on the dashboard

## Nine routes

| Path | Content | Main API |
|---|---|---|
| `/` | Dashboard: 4 KPIs, 24h recommendation throughput, recent active artifacts, popular tags, 4-step onboarding | `/v1/health`, `/v1/artifacts`, `/v1/tags` |
| `/artifacts` | List view · left FilterRail (type / tag / active) + right toggle between table & cards · URL state is shareable | `GET /v1/artifacts?type=&tag=&q=` |
| `/artifacts/[id]` | Detail: body, metadata grid, TagEditor chip editor, one-click copy of `mcp_config`, plugin manifest viewer | `GET /v1/artifacts/{id}`, `PUT /v1/artifacts/{id}/tags` |
| `/tags` | Tag management: 20 builtin tags + custom; per-tag usage bar | `/v1/tags`, `POST`, `DELETE` |
| `/ingest` | Paste a GitHub URL → live state-machine timeline (pending → fetching → parsing → embedding → done) | `POST /v1/ingest`, `GET /v1/ingest/{id}` |
| `/autotag` | Trigger auto-tagging + progress bar + ETA + activity stream; candidate tags + LLM backend on the right | `POST /v1/admin/autotag`, `GET /v1/admin/autotag/{id}` |
| `/playground` | Type a prompt → see top-K + ScoreBar + rerank reason + 8 one-click sample prompts | `POST /v1/recommend` |
| `/discovery` | Approval queue for remote-finder discoveries · approve / reject with notes | `/v1/admin/discoveries`, `POST .../approve`, `POST .../reject` |
| `/settings` | API base URL / API key / default top-K / theme / danger-zone reset | (mostly localStorage + `/v1/health` test) |

## Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 14 (App Router) | RSC + static export possible, lets you serve it behind FastAPI |
| Styling | Tailwind CSS + hand-rolled shadcn-style components | All tokens in `tailwind.config.ts`; palette: `parchment-*`, `ink-*`, `oxide-*`, `navy-*`, `amber-*`, `ember-*` |
| State | SWR + URL search params | List data via SWR; filters live in the URL so they're shareable |
| Charts | Recharts | Throughput area chart, score bar, type-mix bar |
| Icons | `lucide-react` | All SVG, zero runtime cost |
| Toast | sonner | Success / failure prompts |

Proxy: `next.config.mjs`'s `rewrites` forwards `/api/*` to `NEXT_PUBLIC_AIFORGE_API` (default `http://127.0.0.1:8765`). In production, do the same `/api/*` rewrite in your reverse proxy.

## Run

### Dev

```bash
cd web
npm install
npm run dev          # → http://localhost:3500
```

Backend not running? The UI silently falls back to demo data from `lib/mock-data.ts` and shows a `DEMO MODE · backend offline` badge at the top. Every page is always demoable.

### Production build

```bash
cd web
npm run build
npm run start        # Node process on :3500
```

Or **export as static** and let FastAPI serve it (v0.3 will ship a Helm chart that bundles this):

```bash
npm run build && cp -r .next/standalone /opt/aiforge-web
```

### Environment variables

| Var | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_AIFORGE_API` | `http://127.0.0.1:8765` | Backend URL. Dev uses the rewrite; production goes through your proxy |
| Browser localStorage `aiforge.api_key` | — | The API key the user enters under `/settings`; write requests automatically attach `Authorization: Bearer <key>` |

## "Beginner-friendly" specifics

- **Every page has a one-liner intro** explaining what it does
- **HelpTip bubbles**: a small `?` next to key terms with a hover explanation (e.g. "auto-tag = Qwen-1.5B picks 1-3 tags from the 20 builtins")
- **Onboarding checklist**: 4 ticked items on the dashboard (ingest → autotag → playground → install locally)
- **Empty states always offer a next step CTA**: instead of "no data", the empty list says "[go ingest a repo](/ingest)"
- **Inline form validation**: a malformed GitHub URL is caught immediately, not at submit
- **Silent degradation**: when the backend is offline, every page falls back to demo data + a DEMO badge — fully demoable offline

## Signals & heartbeat

Three signature visuals on the dashboard mean something:

- **Reactor**: the rotating concentric SVG, top-right. Spinning means `health.embedder_loaded=true`. Stopped means the embedder hasn't loaded yet.
- **HealthPill**: the topbar status pill (HEALTHY / DEGRADED / DOWN / DEMO) refetches `/v1/health` every 12s
- **LIVE FEED**: bottom ticker streaming recent recommend / ingest / autotag events. Mocked for now; v0.3 will wire WebSocket

## Customizing

Want a different accent color? Edit the `oxide` scale in [`tailwind.config.ts`](../web/tailwind.config.ts):

```ts
oxide: {
  500: '#0E5C4A',   // primary
  // ... adjust the rest of the ramp
}
```

Adding a new route? Create a folder + `page.tsx` under `web/app/`, then add an entry to `NAV_GROUPS` in [`components/shell/sidebar.tsx`](../web/components/shell/sidebar.tsx).

## Server contract

`lib/api-types.ts` and `server/src/aiforge/core/schemas.py` are **manually kept in sync**. Update both when the schema changes. Never invent fields on the client side.

## Related docs

- [Getting started](getting-started.en.md) — bring AIForge up from zero
- [Architecture](architecture.en.md) — system overview & API contract
- [Plugin usage](plugin-usage.en.md) — the `/aiforge:*` commands
- [Artifact format](artifact-format.en.md) — what each artifact type stores
