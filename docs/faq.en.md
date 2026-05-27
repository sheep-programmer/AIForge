# FAQ

> [中文版本](faq.md)

Grouped by topic. Skim to what matters.

---

## Setup

### Q: Do I need a GPU?

No. The embedder (`all-MiniLM-L6-v2`) produces 384-dim vectors fast on CPU. Qwen2.5-1.5B via Ollama takes about 1s per rerank on CPU. A GPU is only useful for throughput; small teams don't need one.

### Q: How much disk?

Roughly 2 GB for model caches (embedder + Qwen) plus ~10 MB per 1000 artifacts in SQLite (including vectors). Ten thousand artifacts come in under 100 MB.

### Q: Can I use the Anthropic API instead of local Ollama?

Yes. Two env vars and you're done:

```bash
export AIFORGE_RERANKER=haiku
export AIFORGE_ANTHROPIC_API_KEY=sk-ant-...
```

Haiku gives slightly better ranking quality and costs about **$0.05 per 1000 rerank calls**. Good fit if you're latency-sensitive and prefer not to run an Ollama process.

### Q: Does AIForge work without the web admin?

Yes. Server + plugin is a complete loop on its own: the plugin calls `/v1/recommend` on each prompt, the server returns top-K, the hook injects them. The web admin is nice-to-have — you can still ingest, tag, and install via the `/aiforge:*` commands.

---

## Behavior

### Q: Does the plugin send my code to the AIForge server?

A: **Only the `prompt` text.** No file contents. No git history. No env vars. Verify in `plugin/lib/client.py` — the `recommend()` function only puts the prompt string into the JSON body.

Further: the default reranker is local Ollama, so the prompt doesn't even leave your machine. Only when you explicitly set `AIFORGE_RERANKER=haiku` does the prompt go to the Anthropic API.

### Q: What if the recommended skill is wrong?

Recommendations are **instructions, not rules**. Agents can ignore them. You can also:

- `/aiforge:list` to see the full library, find the artifact that **should** have been recommended
- `/aiforge:tag <id> <tags>` to give it more accurate tags
- Next similar prompt will reflect the change

### Q: How does auto-tagging stay accurate?

It doesn't, perfectly. Small models drift. Recommended workflow:

1. After each large ingest batch, run `/aiforge:autotag`
2. Open the web admin's `/tags` page and scan for suspicious classifications
3. Override with `/aiforge:tag` where wrong (manual tags have `source=manual`; future autotag runs won't touch them)

Treat auto-tagging as **a first draft that saves 80% of the labor**, not as the final answer.

---

## Cost

### Q: Operating cost?

**$5/month VPS plus zero LLM API cost** with the default Ollama setup. If you switch to the Haiku reranker: roughly a few cents per 1000 prompts. A 50-person team can stay under $5/month all-in.

### Q: Will the small reranker be smart enough?

Surprisingly, yes. The task is narrow: "of these 5 sub-200-word descriptions, which best matches this prompt?" No reasoning, no world knowledge required. We benchmarked Qwen-1.5B against Claude Sonnet on internal sets — the quality gap is small enough that most use cases won't notice.

Reach for Haiku when you need a little more quality. There's no reason to default to Sonnet.

---

## Architecture

### Q: Why SQLite vs Postgres?

**Zero ops.** Embedded, single file, backup = `cp`, migrate = `scp`. With `sqlite-vss` it handles k-NN well at the 10k-100k artifact scale.

If you ever cross ~1M artifacts: the recommender's interface is clean enough that swapping to pgvector is roughly a 200-line adapter. We're not locking you in — SQLite is just **the lower-friction choice at the current scale**.

### Q: Why not use the official MCP SDK?

We use parts of it, but the v0.2 gateway MVP is hand-rolled JSON-RPC. The official Python SDK's API surface is still drifting between 1.x versions — signatures change between minor releases. We chose to stabilize our own protocol layer first; **migrating to the official SDK is on the v0.3 roadmap**.

### Q: Why a unified artifact table instead of three separate ones?

95% of the fields are shared (name, description, source_url, embedding, tags, created_at...). Only a few type-specific fields (`mcp_config`, `plugin_manifest`) live in JSON columns. Benefits:

- One copy of query / filter / sort logic
- The recommendation pipeline treats all three artifact kinds the same
- The web admin's `/artifacts` is a single unified view

The cost: JSON-column queries are slower than normalized columns. But this is off the hot path — recommendation only needs the embedding.

---

## Security

### Q: Does AIForge ever execute code from ingested repos?

**Never.** The ingester only reads these files:

- `SKILL.md` (as markdown text)
- `mcp.json` / `mcp-server.json` / `.mcp/config.json` (as JSON)
- `.claude-plugin/plugin.json` (as JSON)
- `package.json` (parsing `mcpName` / `keywords`)
- `README.md` head (up to 2000 chars)

`.py` / `.js` / `.sh` files in the repo **are never opened**.

### Q: Where are MCP `env` secrets stored?

Currently as plain JSON inside SQLite. **v0.2 has no dedicated secret encryption.** Practical mitigations today:

- Encrypt the SQLite file at rest (file-level or volume-level)
- Set `AIFORGE_API_KEY` and restrict the write API to a private network
- For truly sensitive credentials (production keys), don't install through AIForge yet — write them manually into `settings.json`

v0.3 adds a per-artifact encrypted secret store so sensitive fields can live behind their own key.

---

## Roadmap

### Q: Cross-agent support — Codex / Cursor / Gemini CLI?

Yes, **explicitly on the v0.3 roadmap**. All three have `UserPromptSubmit`-equivalent hooks. The server is plain HTTP, so a new hook adapter is the main work — the protocol side is stable.

Want to help us bring up one of these adapters? Open a GitHub issue and claim it.

### Q: When does the web admin get English?

v0.3. Today every route is in Chinese. The i18n cost is mostly translation — the framework (next-intl) is already wired in.

---

## Misc

### Q: Private skill repos — how to ingest?

```bash
export AIFORGE_GITHUB_TOKEN=ghp_...
curl -X POST http://127.0.0.1:8765/v1/ingest \
  -d '{"github_url": "https://github.com/yourorg/private-skills"}'
```

The token needs `repo` scope.

### Q: Commercial use?

Apache 2.0 — go for it.
