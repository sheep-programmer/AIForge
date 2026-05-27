# Plugin usage

> [中文版本](plugin-usage.md)
> Related: [Quickstart](getting-started.en.md) · [Artifact format](artifact-format.en.md) · [Project README](../README.en.md)

The complete manual for the AIForge plugin. Prerequisite: you have installed
the plugin per [getting-started](getting-started.en.md). If you only want a
slash-command cheatsheet, jump to [Slash command reference](#3-slash-command-reference).

---

## 1. What the plugin actually does

Two things, after install:

1. A **`UserPromptSubmit` hook** (`plugin/hooks/on-user-prompt`) — on every
   prompt, the hook forwards your text to `POST /v1/recommend`, the server
   returns the top-N artifact bodies, and the hook wraps them into an
   `<aiforge-recommendations>` XML block emitted on stdout. By the time Claude
   reads your prompt it already knows "use these specific skills / MCPs /
   plugins."
2. **Ten slash commands** (`/aiforge:*`) for browsing the catalog, ingesting
   new repos, one-click installing MCP servers / plugins, tagging, and
   triggering auto-tagging. All commands sit in `plugin/lib/cli.py`, Python
   stdlib only, zero third-party deps.

When the server is unreachable the plugin transparently switches to
**local-fallback mode** (§6) so your prompt is never blocked by hook failure.

---

## 2. Hook behavior

### 2.1 What gets injected

Each recommended artifact renders as a section:

```
<aiforge-recommendations>
Most relevant skills for this turn (auto-selected by AIForge — prefer these):

## 1. security-review
_Audits code for OWASP top-10 vulnerabilities..._

> Why selected: prompt mentions "review" + "auth", strong match against description

<SKILL.md body...>

Source: https://github.com/obra/superpowers-skills

---

## 2. <next artifact>
...
</aiforge-recommendations>
```

- Position: the hook writes to **stdout**, which Claude Code prepends to your
  prompt as additional context.
- Default `top_k = 3`, tunable in the [config file](#7-config-file).
- The artifact `body` is dropped in verbatim — `skill` is the SKILL.md content,
  `plugin` is the README, `mcp` is a README excerpt (≤ 2000 chars).

### 2.2 The `[aiforge] ...` summary line

The hook prints a one-line summary on **stderr**, which never reaches Claude:

```
[aiforge] server 187ms · security-review, run-failing-tests, repo-explorer
[aiforge] fallback 12ms · security-review, write-tests
[aiforge] 推荐失败: HTTPConnection timeout
```

Format: `[aiforge] <mode> <elapsed_ms>ms · <name1, name2, ...>` where `mode`
is `server` or `fallback`.

### 2.3 Timeouts and failures

- HTTP timeout: `timeout_ms = 250` by default
- 5xx / network error: the hook tries the local fallback
- Local fallback also failing: hook becomes a no-op, prompt passes through unchanged
- First fallback in a session prints one warning to stderr (controlled by
  `fallback_warn_once`)

---

## 3. Slash command reference

Every command is `/aiforge:<name>`; under the hood it's
`python3 ${CLAUDE_PLUGIN_ROOT}/lib/cli.py <name>`.

### 3.1 `/aiforge:status`

Server connectivity, local cache size, current config snapshot.

```
> /aiforge:status
AIForge status
  config:        http://localhost:8765 (enabled=True)
  local cache:   ~/.config/aiforge/local-cache.sqlite
  cached skills: 312
  server:        reachable (HTTP 23ms)
    version:     0.2.0
    skills:      1284
    reranker:    on
```

Hits `GET /v1/health`. Non-zero exit when the server is down; suggests
`/aiforge:sync`.

### 3.2 `/aiforge:add <github-url>`

Submit a GitHub repo for ingestion.

```
> /aiforge:add https://github.com/obra/superpowers-skills
Submitted ingest job: job_id=ing_01J3...  status=queued
Track progress with GET http://localhost:8765/v1/ingest/ing_01J3...
```

Calls `POST /v1/ingest` with `{github_url, auto_approve: true}`. Ingestion
auto-detects `.claude-plugin/plugin.json` / `mcp.json` / `SKILL.md` — a single
repo can produce multiple artifacts (see
[artifact-format.en.md](artifact-format.en.md)).

### 3.3 `/aiforge:search <query>`

Keyword search. Tries the server's `/v1/skills?q=` first; falls back to local
cache on failure.

```
> /aiforge:search browser automation
search source: server; 4 hits
- playwright-mcp  —  Drive headless browsers via Playwright over MCP
    https://github.com/microsoft/playwright-mcp
- selenium-skills —  Recipes for stable Selenium-based scraping
    https://github.com/...
```

Supports `--limit N` (default 10).

### 3.4 `/aiforge:sync`

Pull every artifact from the server into the local fallback SQLite.

```
> /aiforge:sync
Pulling artifact list from server…
Wrote 1284 rows → ~/.config/aiforge/local-cache.sqlite
```

Run after ingesting new repos or changing server config. **Full overwrite**, not
incremental.

### 3.5 `/aiforge:config`

Read-only by default; `--set` flips one field.

```
> /aiforge:config --set top_k=5
Updated top_k = 5
config file: ~/.config/aiforge/config.toml
server_url       = http://localhost:8765
top_k            = 5
...
```

Recognised fields: `server_url` / `top_k` / `max_tokens` / `enabled` /
`timeout_ms` / `fallback_warn_once`.

### 3.6 `/aiforge:list [--type=...] [--tag=...] [--installed]`

List artifacts, optionally filtered by type / tag; `--installed` keeps only
locally installed mcp / plugin entries.

```
> /aiforge:list --type=mcp --tag=browser-automation
- [mcp] playwright-mcp [installed]  —  Headless browser automation via Playwright
    id: f8d9e312ab74cc60
    tags: browser-automation, testing
- [mcp] puppeteer-mcp  —  Puppeteer-based browser control
    id: 71b3...
2 rows
```

Calls `GET /v1/artifacts?type=mcp&tag=browser-automation`. Install state is
derived by scanning `~/.claude/settings.json`'s `mcpServers` and
`~/.claude/plugins/`.

### 3.7 `/aiforge:install <artifact_id>`

Install by artifact id. Behavior dispatches by type (§4).

```
> /aiforge:install f8d9e312ab74cc60
Installed MCP 'playwright-mcp' in ~/.claude/settings.json (backup: settings.json.bak.1716...)
```

`--force` overwrites an existing plugin directory.

### 3.8 `/aiforge:uninstall <artifact_id>`

Reverse of install; see §5.

### 3.9 `/aiforge:tag <artifact_id> <tag1,tag2,...>`

**Replace** the artifact's tag set (not append).

```
> /aiforge:tag f8d9e312ab74cc60 browser-automation,testing,scraping
Tags updated: browser-automation, testing, scraping
```

Calls `PUT /v1/artifacts/{id}/tags`. To preserve old tags, list them first and
pass the union.

### 3.10 `/aiforge:autotag [--ids=...]`

Trigger the server's auto-tagging job (small-model classifier) and poll until
done.

```
> /aiforge:autotag
Submitted autotag job: job_id=at_01J3...
  [#1] status=running 8/120
  [#2] status=running 24/120
  ...
  [#13] status=completed 120/120
Done: tagged 120 rows
```

`--ids=A,B,...` to limit the subset; otherwise runs over every artifact that
has not received an `auto` tag yet. ~2-3s per row. `--max-polls` caps polling
(default 60 ≈ 2 min).

---

## 4. Install behavior

`/aiforge:install` fetches artifact details and dispatches by `artifact_type`.

### 4.1 MCP

1. Read `~/.claude/settings.json` (treat as empty dict if missing)
2. Back up to `~/.claude/settings.json.bak.<unix_ts>`
3. Write the artifact's `mcp_config` into `mcpServers[<artifact.name>]`
4. Atomic write (`.tmp` then `os.replace`)

Supports stdio / http / sse — whatever `mcp_config` carries is preserved verbatim:

```json
{
  "mcpServers": {
    "playwright-mcp": {
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@playwright/mcp"],
      "env": {}
    }
  }
}
```

### 4.2 Plugin

```bash
git clone --depth 1 <artifact.source_url> ~/.claude/plugins/<artifact.name>/
```

- `settings.json` is **not** touched — Claude Code auto-scans `~/.claude/plugins/`
- Existing directory is refused unless `--force` is set (which `rmtree`s first)
- Missing `git` / 120 s timeout / non-zero exit codes surface as friendly errors
- On air-gapped boxes, `git clone` manually to the target path — identical effect

### 4.3 Skill

**Not supported**. Skills are designed to be **injected on demand** — the
recommender slips the `SKILL.md` body into context only when your prompt
matches. Persisting locally would:

- Burn tokens regardless of relevance
- Defeat dedup (multiple semantically overlapping skills always active)
- Pin you to a stale version

If you really want an "always-on" skill, package it as a plugin's `skills/`
directory.

---

## 5. Uninstall behavior

`/aiforge:uninstall <artifact_id>`:

| Type | Behavior |
|------|----------|
| `mcp` | Remove the key from `~/.claude/settings.json`'s `mcpServers`; back up `settings.json.bak.<ts>` first |
| `plugin` | `rm -rf ~/.claude/plugins/<name>/` |
| `skill` | no-op, prints "skill is not persisted locally" |

Safety notes:

- Backup is **always** taken before write; on failure the original is intact
- Backups are never auto-cleaned; prune with `rm ~/.claude/settings.json.bak.*`
- Uninstalling a plugin does **not** roll back its own side effects (e.g. a
  plugin that registered extra hooks). Spot-check `~/.claude/settings.json`'s
  `hooks` section if you suspect leftovers.

---

## 6. Local-fallback mode

### 6.1 When it triggers

Any of:

- Server HTTP unreachable (refused / DNS / offline)
- Request exceeded `timeout_ms` (default 250 ms)
- Server returned 5xx

### 6.2 What still works

| Capability | Online | Fallback |
|------------|:------:|:--------:|
| Recall (keyword hit) | vector + BM25 | keyword only |
| Rerank (small model) | Qwen / Haiku | none |
| Dedup | yes | none |
| `/aiforge:search` | server | local cache |
| `/aiforge:list` / `install` / `tag` / `autotag` / `add` / `sync` | OK | **fails** |
| `/aiforge:status` | OK | reports "unreachable" |

Bottom line: **the hook keeps injecting** (degraded), but every command that
needs to write state on the server is unavailable.

### 6.3 Making fallback useful

The fallback reads `~/.config/aiforge/local-cache.sqlite`, populated by
`/aiforge:sync`.

```bash
# While the server is up, hydrate the local cache once
/aiforge:sync
```

Add this to your shell startup or a daily cron. **An unhydrated cache means
the hook degrades to a no-op.**

---

## 7. Config file

Path: `~/.config/aiforge/config.toml`

### 7.1 Annotated example

```toml
# AIForge plugin config. Delete any field to revert to defaults.

# Server endpoint. env: AIFORGE_SERVER_URL
server_url = "http://localhost:8765"

# How many artifacts to inject per turn. env: AIFORGE_TOP_K
top_k = 3

# Budget for injected text (~4 chars/token); bodies are truncated past this
max_tokens = 4000

# Master switch. With false the hook is a no-op. env: AIFORGE_ENABLED
enabled = true

# Print one warning to stderr the first time fallback kicks in
fallback_warn_once = true

# HTTP timeout for /v1/recommend (ms); past this the hook falls back
timeout_ms = 250
```

### 7.2 Environment overrides

| Variable | Overrides | Example |
|----------|-----------|---------|
| `AIFORGE_SERVER_URL` | `server_url` | `AIFORGE_SERVER_URL=http://10.0.0.5:8765` |
| `AIFORGE_TOP_K` | `top_k` | `AIFORGE_TOP_K=5` |
| `AIFORGE_ENABLED` | `enabled` | `AIFORGE_ENABLED=false` to mute the hook for one shell |
| `AIFORGE_CONFIG_DIR` | config dir | useful for tests; redirects `~/.config/aiforge` |
| `AIFORGE_CACHE_DIR` | cache dir | redirects `~/.cache/aiforge` |

Env wins over file. Editing `config.toml` requires **no Claude Code restart** —
the next prompt picks up new values.

---

## 8. FAQ

**Q1: Will installing the plugin break my existing `settings.json`?**
No. Both the installer and `install_mcp` back up to
`settings.json.bak.<unix_ts>` before writing, using an atomic write (`.tmp` +
`os.replace`). The original is untouched on failure.

**Q2: How do I completely disable the hook?**
Lightest: `AIFORGE_ENABLED=false claude` for one session. Semi-permanent:
`/aiforge:config --set enabled=false`. Full removal: delete the
`${CLAUDE_PLUGIN_ROOT}/hooks/on-user-prompt` entry from
`~/.claude/settings.json`'s `hooks.UserPromptSubmit`, then `rm -rf
~/.claude/plugins/aiforge/`.

**Q3: Can I temporarily mute a single artifact?**
There is no per-artifact "disabled" flag yet. Workarounds: `/aiforge:uninstall
<id>` for mcp / plugin, or tag it with something like `disabled` (the Web
panel can filter on tags). A first-class skill mute is on the v0.3 roadmap.

**Q4: Does `/aiforge:sync` re-download every artifact body?**
Yes. It pages through `/v1/skills?limit=1000` and fully overwrites the local
table — metadata plus body. ~1k rows is a few hundred KB; run it often.

**Q5: I installed an MCP but tools never show up. Now what?**
1. `/aiforge:status` to confirm what the server has on file
2. `cat ~/.claude/settings.json` and check `mcpServers.<name>` actually landed
3. Restart Claude Code — MCP servers are spawned at start, not on the fly
4. The server's `command` may need binaries you don't have (e.g. `uvx`,
   `bunx`). Run `mcp_config.command` by hand to see the real error
5. Still broken: `/aiforge:uninstall` then reinstall on the latest version

**Q6: Does the plugin need internet to work?**
Not strictly. After a single `/aiforge:sync` it runs offline in fallback mode.
`install` / `tag` / `autotag` / `add` always require the server to be live.
