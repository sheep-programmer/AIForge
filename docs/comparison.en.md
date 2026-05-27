# AIForge vs the Alternatives

> [中文版本](comparison.md)

This is not a marketing brochure. It's an **honest** comparison. If AIForge is wrong for your setup, we'll say so.

---

## TL;DR

**AIForge is the right tool when:**

- Your team juggles **100+ skills / 10+ MCPs / multiple plugins**, and the count keeps growing
- You've already felt the pain of a 50K+ token system prompt
- You want skills, MCPs, and plugins managed from **one console** instead of bouncing between git, `settings.json`, and `~/.claude/plugins/`
- You're willing to run a $5/month VPS (or just localhost)

**AIForge is the wrong tool when:**

- You have a dozen skills and 2-3 MCPs — installing everything fits in context
- You need agent orchestration (multi-step, ordered tool calls) — that's LangGraph / Autogen territory
- You can't tolerate the ~100-250ms hook overhead
- All your artifacts are air-gapped and no LLM rerank is allowed (fallback mode works, but you lose most of the value)

---

## Side-by-side

| Dimension | **AIForge** | Claude Code built-in skill loading | mcp-marketplace (hypothetical) | Manual `claude mcp add` | Hand-rolled context engineering | Homemade RAG |
|-----------|-------------|------------------------------------|--------------------------------|-------------------------|---------------------------------|--------------|
| Scope (artifact types) | skill + MCP + plugin | skill only | MCP only | MCP only | all | all |
| Centralized registry | Yes (SQLite + Web) | No (filesystem scan) | Yes | No | No | You build it |
| Auto-classification | Small-model tagging + human review | None | Platform-dependent | None | All manual | DIY |
| Token budget control | top-K + MCP gateway, both sides | Install-all, full exposure | Single MCP, full tools | Full tools per MCP | Depends on your prompt craft | DIY |
| Install automation | `/aiforge:install` writes `settings.json` | Drop files in a directory | Platform-dependent | One command per MCP | All manual | Out of scope |
| Runtime tool filtering | Yes (MCP gateway exposes only active set) | n/a | No | No | No | No |
| Self-hostable | Yes (required) | n/a | Platform decides | n/a | n/a | Yes |
| Setup cost | `docker compose up` + one ingest | 0 | 0 | 0 | 0 | Weeks |

---

## vs. Claude Code Built-in Skill Loading

Claude Code already scans `~/.claude/skills/` and loads every SKILL.md into context. **For small libraries, that's fine.**

- **Under ~20 skills**: skip AIForge. Built-in loading is simpler and stays out of your way.
- **100+ skills**: built-in loading dumps every skill description into context. The token bill educates you fast.
- AIForge **does not replace** `~/.claude/skills/` — it adds a router layer in front. They coexist: keep the everyday skills native, let AIForge inject the long tail on demand.

Rule of thumb: the moment you start thinking "which skills should I disable for this task," it's time for AIForge.

---

## vs. Manual `claude mcp add` for Every MCP

One to three MCPs? Just write them into `settings.json`. AIForge is overkill.

Ten or more MCPs running simultaneously and you hit:

- Every MCP exposes its full tool list — a single Playwright MCP advertises 30+ tools
- An agent only uses 2-3 per task; the rest occupy context budget for nothing
- Tool-name collisions (two MCPs both have `read_file`) — agents pick wrong, things break

AIForge's **MCP runtime gateway** handles this:

- Claude Code sees one MCP server (`aiforge-mcp`)
- The gateway decides the active set based on current recommendations, **exposing only tools from active MCPs**
- Tool names are namespaced `<mcp_name>__<tool_name>` — collisions disappear

The cost: one extra process and one JSON-RPC hop. The win: a clean context and zero collisions.

---

## vs. A Homemade RAG

Your team absolutely **could** build this: vector store + LLM rerank + a hook. There's no secret sauce.

What AIForge gives you that's already assembled:

- Full integration with Claude Code's `UserPromptSubmit` hook
- Auto-detection of SKILL.md / `mcp.json` / `.claude-plugin/plugin.json` / `package.json` MCP signals
- Dedupe heuristics for semantically equivalent artifacts (source reputation, freshness, install count)
- A 9-route web admin (dashboard, ingest, autotag, playground, …)
- An out-of-the-box MCP runtime gateway
- Local Ollama reranker by default — zero LLM API spend — with a one-flag switch to Haiku

When DIY wins: you already have an internal platform team, existing vector infra, and special MCP protocol needs. Otherwise AIForge saves you weeks to months of integration work.

---

## vs. Doing Nothing and Just Dealing with the Bloat

Viable short-term. Until one day your system prompt hits 50K+ and the main model starts:

- Forgetting instructions from the top of the conversation
- Picking the wrong tool from the bloated tool list
- Taking visibly longer to respond (the hidden tax of long context)

Our observation: **teams that use agents heavily hit this wall within ~2 months**. AIForge solves it systematically instead of waiting for the next blowup.

---

## What AIForge Is **Not**

Honest list:

1. **Not a general-purpose vector database** — SQLite + sqlite-vss is comfortable up to ~100k artifacts; beyond that, swap in pgvector
2. **Not a centralized MCP discovery service** — we don't run a public catalog; everything lives in **your** instance
3. **Not a Claude Code replacement** — AIForge is a companion to Claude Code, it doesn't stand alone
4. **Not a substitute for human curation** — auto-tagging is a **suggestion**, not authority; every auto tag is editable in the web UI
5. **Not an agent orchestration framework** — we answer "which artifacts now," not "in what order to run them"
6. **Not a hosted SaaS** — no plans to run a hosted service (you're welcome to run one)

---

## Performance & Cost Cheat Sheet

| Approach | Extra per-turn latency | Per-turn injected tokens | Monthly cost (10k requests) |
|----------|------------------------|--------------------------|------------------------------|
| AIForge (Ollama, self-hosted) | +120ms | ~3k | $5 VPS |
| AIForge (Haiku reranker) | +200ms | ~3k | $5 VPS + ~$0.3 Haiku |
| Install everything | 0ms | 30-100k | $0, but main-model token bill balloons |
| Hand-rolled context engineering | 0ms extra | Depends on your craft | $0 |

---

## One-Liner Verdict

- **Small + static library** → no AIForge needed
- **Large + dynamic + want automation** → AIForge
- **Multi-step agent orchestration** → use a different tool; we don't do that
