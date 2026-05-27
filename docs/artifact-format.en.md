# Artifact format

> [中文版本](artifact-format.md)
> Related: [Plugin usage](plugin-usage.en.md) · [Quickstart](getting-started.en.md) · [Project README](../README.en.md) · [Extension spec](extension-spec.md)

AIForge unifies three Claude Code extensions under one type: **artifact**. The
three kinds are `skill`, `mcp`, and `plugin`. This doc is for **repo authors**
— it tells you what your repo needs to look like to be detected and recommended
correctly.

If you only want to run the plugin, read
[getting-started.en.md](getting-started.en.md) first.

---

## 1. Overview

| `artifact_type` | Primary payload | Detection signal | Use |
|---|---|---|---|
| `skill` | `SKILL.md` | Filename + valid frontmatter | Injected verbatim when the recommender picks it |
| `mcp`   | `mcp_config` JSON | Several conventions (see §3) | Installed into `settings.json`'s `mcpServers` |
| `plugin`| `plugin_manifest` JSON | `.claude-plugin/plugin.json` | `git clone`d into `~/.claude/plugins/<name>/` |

### 1.1 Detection priority

When `POST /v1/ingest` receives a GitHub repo:

1. **plugin** — `.claude-plugin/plugin.json` at root → one plugin artifact
2. **mcp** — any of the signals in §3 → one mcp artifact
3. **skill** — recursive scan for `SKILL.md` (prunes `.git` / `node_modules` /
   `dist` / etc.)

> A single repo **can** produce multiple artifacts. The `aiforge` plugin repo
> itself is both a plugin and ships one embedded skill, producing two artifacts
> that share `source_url`.

### 1.2 Shared columns

Every artifact, regardless of type, writes:

| Field | Source |
|-------|--------|
| `id` | `SHA256(source_url + source_path)[:16]` |
| `artifact_type` | `skill` / `mcp` / `plugin` |
| `name` | Whatever the adapter extracts |
| `description` | Short description (used in search + listings) |
| `body` | Text used by the recommender / injection |
| `source_url` | Original GitHub URL |
| `source_path` | Repo-relative POSIX path |
| `embedding` | `all-MiniLM-L6-v2` encoding of `name + description` |

`mcp` / `plugin` also persist `mcp_config` or `plugin_manifest` as a JSON column.

---

## 2. Skill format

### 2.1 Where the file lives

A file literally named `SKILL.md` (case-sensitive) at any depth. The splitter
walks the tree but prunes:

```
.git .hg .svn  node_modules  .venv venv __pycache__
.mypy_cache .pytest_cache .ruff_cache
dist build target  tests test
.tox .idea .vscode
```

### 2.2 Frontmatter (required)

```markdown
---
name: security-review
description: Audits code for OWASP top-10 vulnerabilities with a focus on injection, auth, and crypto issues
---

# Security review

...
```

| Field | Type | Required | Notes |
|-------|:---:|:---:|-------|
| `name` | string | yes | Slugified unique name; empty string is treated as missing |
| `description` | string | yes | 1–3 sentences; the embedder leans heavily on this |

> Missing or non-string `name` / `description` → the SKILL.md is **skipped**
> with a log entry. Other fields (`version`, `tags`, `language`, ...) are
> currently **ignored** without error.

### 2.3 Body authoring

- **Free-form markdown**, no required structure
- Token estimate uses **4 chars / token**. 400–1200 tokens is the sweet spot:
  - Too short (< 200): the reranker has no signal, more detailed competitors win
  - Too long (> 2000): exceeds plugin `max_tokens` and gets truncated, burns
    user budget
- Write for the **agent**, not for humans:
  - Bad: "This is a skill that helps with code review."
  - Good: "When the user asks to review a PR or asks 'is this safe / can we
    merge?', execute: 1) ..."
- The first paragraph matters most — the embedder consumes `description` +
  first ~500 chars of body together; this paragraph decides recall

### 2.4 Full example

```markdown
---
name: run-failing-tests
description: Locates the failing tests near recent changes, reruns them, proposes minimal fixes
---

# Run failing tests

## When to use
- User says "tests are broken / run the tests / why is the test failing"
- User pastes a pytest / jest / go test error

## Steps
1. `git status` + `git diff --name-only HEAD~1` to scope the change
2. Run `pytest -x` / `vitest --run` in the matching test dirs
3. Take the first failure, analyse the traceback, isolate the **minimal repro**
4. Propose fix candidates + reasoning. Do not edit files without explicit OK.

## Don't
- Don't stub assertions to "fix" the test
- Don't silently catch the exception
```

> Every paragraph is an agent-actionable instruction: trigger words → steps →
> boundary. This kind of skill ranks well and gets used correctly.

---

## 3. MCP format

AIForge doesn't require a single rigid schema — it **tolerantly** sniffs the
signals it knows.

### 3.1 Detection rules (priority order)

First match wins:

1. **Config file**: any of these at the repo root
   - `mcp.json`
   - `mcp-server.json`
   - `.mcp/config.json`
2. **package.json signal**: contains `"mcpName"`, **or** `"keywords"` includes
   `"mcp"` / `"model-context-protocol"`
3. **README first 500 chars**: regex `/MCP server|Model Context Protocol/i`

### 3.2 How `name` is derived

```
config file's "name" field
  → package.json's "mcpName" / "name"
  → repo directory name (fallback)
  → "mcp-server" (last resort)
```

### 3.3 `mcp_config` JSON shape

The server normalises whatever it finds into one of three shapes, all of which
are directly compatible with Claude Code's `settings.json`
`mcpServers.<name>` slot — `/aiforge:install` writes them verbatim.

**stdio** (most common):
```json
{
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"],
  "env": {"FOO": "bar"}
}
```

**http**:
```json
{
  "transport": "http",
  "url": "https://api.example.com/mcp",
  "headers": {"Authorization": "Bearer ..."}
}
```

**sse**:
```json
{
  "transport": "sse",
  "url": "https://api.example.com/sse"
}
```

### 3.4 Authoring best practices

If your repo is principally an MCP server, do **at least one** of:

- Drop a root `mcp.json` with `name` / `command` / `args` filled
- Add `"mcpName"` to `package.json` or include `mcp` in `keywords`
- Lead the README with "An MCP server for ..."

### 3.5 `body` and `description`

- `body`: README truncated to **2000 chars**; falls back to `description`
  when no README exists
- `description`: pulled from the config file or `package.json`'s
  `description`; on miss it falls back to the first non-empty README line
  (stripping `#` and image syntax), capped at 256 chars; finally
  `"MCP server from <repo_name>"`

---

## 4. Plugin format

### 4.1 Detection

Single rule: `.claude-plugin/plugin.json` at the repo root that parses as a
JSON object.

### 4.2 `plugin_manifest` JSON shape

AIForge keeps these keys (others are dropped to avoid SQLite row bloat):

| Key | Type | Use |
|-----|------|-----|
| `name` | string | Plugin name; also becomes `~/.claude/plugins/<name>/` |
| `version` | string | Human-readable version |
| `description` | string | Short text for ranking and listings |
| `commands` | string[] | Relative paths e.g. `"commands/foo.md"` |
| `hooks` | object | e.g. `{"UserPromptSubmit": "hooks/on-prompt"}` |
| `skills` | string[] | Relative paths to embedded SKILL.md files |
| `mcpServers` | object | MCP servers the plugin ships |
| `author` / `homepage` / `license` | string | Metadata |

Plus two synthesised fields:

- `manifest_path = ".claude-plugin/plugin.json"`
- `install_url = <source_url>` — used by `/aiforge:install` for `git clone`

### 4.3 Full example

The `aiforge` plugin manifest itself:

```json
{
  "name": "aiforge",
  "version": "0.1.0",
  "description": "Intelligent skill recommendation + injection for Claude Code",
  "author": "AIForge contributors",
  "homepage": "https://github.com/aiforge/aiforge",
  "hooks": {
    "UserPromptSubmit": "${CLAUDE_PLUGIN_ROOT}/hooks/on-user-prompt"
  },
  "commands": [
    "commands/status.md",
    "commands/add.md",
    "commands/search.md",
    "commands/sync.md",
    "commands/config.md",
    "commands/list.md",
    "commands/install.md",
    "commands/uninstall.md",
    "commands/tag.md",
    "commands/autotag.md"
  ],
  "skills": ["skills/aiforge/SKILL.md"]
}
```

Each `.md` in `commands` becomes a slash command; the SKILL.md files in
`skills` are also indexed as standalone skill artifacts.

### 4.4 Install behavior

`/aiforge:install <plugin-artifact-id>` is equivalent to:

```bash
git clone --depth 1 <install_url> ~/.claude/plugins/<name>/
```

Claude Code auto-scans `~/.claude/plugins/` at startup, so `settings.json` is
**not** touched.

### 4.5 `body` and `description`

- `body`: README truncated to **8000 chars** (more generous than mcp because
  plugins usually have real docs)
- `description`: `plugin.json` `description` → README first line → `"Claude
  Code plugin: <name>"`

---

## 5. Mixed repos

One repo can carry several artifact types. Two common shapes:

### 5.1 Plugin + embedded skills

```
my-bundle/
├── .claude-plugin/
│   └── plugin.json          ← triggers plugin detection
├── skills/
│   ├── tdd/
│   │   └── SKILL.md         ← skill #1
│   └── refactor/
│       └── SKILL.md         ← skill #2
├── commands/
│   └── ...
└── README.md
```

Result: 1 plugin artifact + 2 skill artifacts, **sharing one `source_url`**,
distinguished by `source_path`.

### 5.2 MCP + skill recipes

```
playwright-toolkit/
├── package.json             ← keywords: ["mcp"] → triggers mcp detection
├── src/server.js
├── skills/
│   ├── e2e-test/
│   │   └── SKILL.md         ← teach the agent how to use this MCP for E2E
│   └── visual-regression/
│       └── SKILL.md
└── README.md
```

Result: 1 mcp + 2 skills. The recommender can inject the mcp's tools and the
skill steps together for the right prompt.

### 5.3 Three-in-one

Totally allowed. `plugin` + `mcp` + multiple `skill`s coexist in one repo as
long as each kind satisfies its own detection rules.

---

## 6. What AIForge does NOT do

Drawing the boundary explicitly:

1. **Doesn't execute any code from your repo** — ingestion only reads files;
   no `npm install`, no `pip install`, no build step. An MCP's `command` only
   runs after **you** `install` it, and then it's Claude Code that spawns it.
2. **Doesn't encrypt secrets** — fields in `mcp_config.env` land as **plain
   JSON** in the server's SQLite and in your `~/.claude/settings.json`. For
   production setups, reference env var names instead of inlining values.
   End-to-end encryption is on the v0.3 roadmap.
3. **Doesn't lint or format** — broken markdown in your SKILL.md is stored as-is;
   rendering issues are on you
4. **Doesn't verify license compatibility** — confirm the source repo's
   LICENSE permits downstream use before ingesting
5. **Doesn't review permissions** — an MCP can run shell, read files, fetch
   the network. Audit it like you would `npm install`-ing a fresh package

---

## 7. Author cheatsheet, by type

**Skill authors**
- Write `description` as a **trigger scenario**, not "what this is"
- Body uses imperative step-by-step; don't let the agent improvise
- Keep it 400–1200 tokens; split bigger skills into smaller ones
- Name with kebab-case verb phrases: `security-review` / `run-failing-tests`
- Never write "see docs/setup.md" — the reranker can't see external files

**MCP authors**
- Prefer a root `mcp.json` — most reliable detection, cleanest `mcp_config`
- Open the README with "MCP server for X" — helps detection and reranker both
- `env` should reference **variable names** (e.g. `OPENAI_API_KEY`), not
  hardcoded values
- Give your tools short, unique names — the gateway exposes them as
  `<server>__<tool>`

**Plugin authors**
- `plugin.json`'s `description` should make the problem-it-solves obvious
- Fill `commands` / `skills` / `hooks` / `mcpServers` only as needed; empty is fine
- README ≤ 8000 chars; the rest is truncated
- Embedded SKILL.md files must follow §2 or they get skipped
