# Server deployment

> [中文版](server-deployment.md)

Audience: you've worked through [getting-started.en.md](getting-started.en.md) on a laptop and now want AIForge on a real server — TLS, auth, backups, upgrades, the lot.

The walkthrough goes: sizing → compose / systemd → reverse proxy → auth → backups → upgrades → hardening.

---

## 1. Sizing

AIForge is designed to run on a **$5/mo VPS** and comfortably index ~5k artifacts.

| Process | Resident RAM | CPU | Notes |
|---------|--------------|-----|-------|
| `aiforge-server` (incl. embedder) | ~120 MB | 1 vCPU is fine | Recommend path ≤ 50 ms without reranker |
| Ollama + Qwen2.5-1.5B | ~1.6 GB | 1-2 vCPU | With rerank: p95 ~300 ms |
| `aiforge-mcp` gateway | ~30 MB | near-zero idle | Usually **not** on the server |
| SQLite (incl. vector index) | 50-500 MB on disk | - | ~200 MB at 5k artifacts |

Reference picks:

| Spec | Use case | Price |
|------|----------|-------|
| 1 vCPU / 1 GB | Vector recall only, reranker off | Hetzner CX11 / DO basic (~$5) |
| 2 vCPU / 4 GB | Ollama rerank on | Hetzner CX21 (~$10) |
| 4 vCPU / 8 GB | Rerank + autotag, library in the 10k range | Hetzner CX31 (~$20) |

ARM is fine (Hetzner CAX, Raspberry Pi). Images are multi-arch (`linux/arm64`).

---

## 2. Docker compose (the easy path)

`server/docker/docker-compose.yml` is production-ready. In real deployments you usually do two things:

1. Add a `.env` for auth / GitHub token
2. Keep `ports` on `127.0.0.1` and let nginx face the world

Annotated yaml (lives in `server/docker/docker-compose.yml`):

```yaml
name: aiforge

services:
  aiforge:
    build:
      context: ..                         # server/
      dockerfile: docker/Dockerfile
    image: aiforge:local
    restart: unless-stopped
    ports:
      - "127.0.0.1:8765:8765"             # loopback — public traffic goes through nginx
    volumes:
      - ./data:/app/data                  # SQLite persistence
    env_file:
      - ../.env                           # see below
    environment:
      AIFORGE_HOST: "0.0.0.0"             # bind inside the container
      AIFORGE_DB_PATH: "/app/data/aiforge.db"
      AIFORGE_LOG_FORMAT: "json"
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://127.0.0.1:8765/v1/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 20s
    networks: [aiforge-net]

networks:
  aiforge-net: { driver: bridge }
```

For local Ollama reranking, use [examples/docker-compose.with-ollama.yml](../examples/docker-compose.with-ollama.yml) (adds an `ollama` service and shared network; remember to `ollama pull qwen2.5:1.5b`).

`.env` template (place at repo root; do not commit):

```bash
AIFORGE_API_KEY=$(openssl rand -hex 32)
AIFORGE_GITHUB_TOKEN=ghp_xxx              # private repos + higher rate limit
AIFORGE_RERANKER=none                     # or ollama / haiku
AIFORGE_LOG_LEVEL=INFO
AIFORGE_LOG_FORMAT=json
```

Boot and tail logs:

```bash
docker compose -f server/docker/docker-compose.yml up -d
docker compose -f server/docker/docker-compose.yml logs -f aiforge
```

---

## 3. Without Docker: systemd

If your box already has Python and you'd rather skip Docker:

```bash
# 1) System deps
sudo useradd --system --home /opt/aiforge --shell /usr/sbin/nologin aiforge
sudo git clone https://github.com/<you>/aiforge.git /opt/aiforge
sudo chown -R aiforge:aiforge /opt/aiforge

# uv is recommended; plain pip + venv works too
curl -LsSf https://astral.sh/uv/install.sh | sh
sudo -u aiforge bash -lc 'cd /opt/aiforge/server && uv sync'

# 2) sqlite-vss needs BLAS at runtime
sudo apt install -y libblas3 liblapack3

# 3) Register the unit
sudo cp /opt/aiforge/examples/systemd/aiforge.service /etc/systemd/system/
sudo mkdir -p /var/lib/aiforge /etc/aiforge
sudo chown aiforge:aiforge /var/lib/aiforge

# 4) Auth + GitHub token in a separate file
sudo tee /etc/aiforge/aiforge.env >/dev/null <<EOF
AIFORGE_API_KEY=$(openssl rand -hex 32)
AIFORGE_GITHUB_TOKEN=ghp_xxx
AIFORGE_RERANKER=none
EOF
sudo chmod 600 /etc/aiforge/aiforge.env

# 5) Start it
sudo systemctl daemon-reload
sudo systemctl enable --now aiforge
sudo systemctl status aiforge
```

Logs land in journald:

```bash
journalctl -u aiforge -f --output=cat
```

The unit's `ExecStart` runs `aiforge-server` (the console script declared in `server/pyproject.toml`).

---

## 4. Reverse proxy (nginx + TLS)

`examples/nginx.conf` is a copy-paste-ready template that does:

- 80 → 443 redirect
- TLS termination (certbot patches it in)
- `/v1/health` public, no rate limit
- `/v1/ingest`, `/v1/admin/*` Bearer-required + write rate limit (2 r/s + burst 5)
- All other `/v1/*` reads rate-limited (30 r/s)

Drop it in:

```bash
sudo cp examples/nginx.conf /etc/nginx/sites-available/aiforge
sudo ln -s /etc/nginx/sites-available/aiforge /etc/nginx/sites-enabled/
# edit server_name to your domain
sudo nginx -t
sudo certbot --nginx -d aiforge.example.com
```

To put the web admin behind the same vhost (`/api/*` to the server, `/` to the Next.js static export):

```nginx
location /api/ {
    rewrite ^/api/(.*)$ /$1 break;
    proxy_pass http://127.0.0.1:8765;
}
location / {
    root /var/www/aiforge-web;
    try_files $uri $uri/ /index.html;
}
```

Build the web with `NEXT_PUBLIC_API_BASE=/api npm run build` to match.

---

## 5. Authentication

Once `AIFORGE_API_KEY` is set:

| Endpoint class | Bearer required? |
|----------------|------------------|
| `GET /v1/health` | No (always public) |
| `GET /v1/artifacts`, `/v1/skills`, `/v1/tags` (reads) | `optional_api_key` — checked if present, allowed if not |
| `POST /v1/recommend` | Same as above |
| `POST /v1/ingest`, `/v1/admin/*`, any `PUT/DELETE` (writes) | **Yes** |

How clients pass it:

```bash
curl -H "Authorization: Bearer $AIFORGE_API_KEY" \
  -X POST https://aiforge.example.com/v1/ingest \
  -H 'Content-Type: application/json' \
  -d '{"github_url": "https://github.com/anthropics/skills"}'
```

- **Plugin**: add `api_key = "..."` to `~/.config/aiforge/config.toml` — the hook attaches the header automatically
- **Web admin**: enter the Bearer on the `/settings` page; it's stored in localStorage and sent on every request

---

## 6. Database backups

The only thing that needs backing up is the single SQLite file at `AIFORGE_DB_PATH` (defaults to `./data/aiforge.db` for Docker or `/var/lib/aiforge/aiforge.db` for systemd).

**Simple: nightly rsync to object storage**

```cron
0 3 * * * sqlite3 /var/lib/aiforge/aiforge.db \
  ".backup '/var/backups/aiforge-$(date +\%F).db'" \
  && rclone copy /var/backups/aiforge-$(date +%F).db remote:aiforge-backups/
```

`sqlite3 .backup` is safer than `cp` — it takes a consistent snapshot and won't tear writes in flight.

**Advanced: litestream**

```yaml
# /etc/litestream.yml
dbs:
  - path: /var/lib/aiforge/aiforge.db
    replicas:
      - type: s3
        bucket: my-aiforge-backups
        path: aiforge.db
        region: eu-central-1
```

Milliseconds-fresh WAL streaming to S3. Crash recovery is `litestream restore`.

The `sqlite-vss` virtual tables live in the same file, so they ride along — no extra step.

---

## 7. Upgrading

```bash
cd /opt/aiforge
sudo -u aiforge git pull

# Docker
docker compose -f server/docker/docker-compose.yml up -d --build

# systemd
sudo -u aiforge bash -lc 'cd server && uv sync'
sudo -u aiforge bash -lc 'cd server && uv run alembic upgrade head'
sudo systemctl restart aiforge
```

The v0.2 migration `002_artifact_and_tags.py` adds to existing DBs:
- `Skill.artifact_type`, `Skill.mcp_config`, `Skill.plugin_manifest`
- New tables `tags`, `artifact_tags`

It uses `op.batch_alter_table`, so it's **safe on SQLite** (auto copy-rename pattern). Still take a backup before `alembic upgrade head`.

New dep: `mcp>=1.2` for the gateway — `uv sync` pulls it.

---

## 8. Running the MCP gateway in production

`aiforge-mcp` usually does **not** belong on the server. It's a stdio child of Claude Code and runs on each user's workstation.

The server just exposes the HTTP API; the gateway pulls the active set from there:

```jsonc
// On the workstation: ~/.claude/settings.json
{
  "mcpServers": {
    "aiforge": {
      "command": "aiforge-mcp",
      "env": {
        "AIFORGE_SERVER_URL": "https://aiforge.example.com",
        "AIFORGE_API_KEY": "..."
      }
    }
  }
}
```

If you really want to centralize it (one shared active set, push-based reload), point `AIFORGE_SERVER_URL` at the server and expose an MCP-over-HTTP port to clients. v0.2's gateway is stdio-only MVP; cross-process refresh is limited to `POST /v1/gateway/reload`.

---

## 9. Observability

The server emits structlog JSON to stdout; the rest is your stack:

```json
{"event": "recommend", "ts": "2026-05-27T12:34:56Z", "prompt_chars": 42,
 "top_k": 3, "ms": 187, "reranker": "ollama", "hit_ids": ["a1b2","c3d4","e5f6"]}
```

Suggested combos:

- **Loki + Promtail**: scrape the docker JSON log; query `{container="aiforge"} | json | ms > 500`
- **journalctl + logrotate**: cheapest path for systemd; `journalctl -u aiforge --since "1 hour ago"`
- **Vector / Logtail / Datadog**: pipe stdout in, done

Uptime: poll `/v1/health` from UptimeRobot or healthchecks.io every 30s.

Prometheus `/metrics` isn't built in yet — tracked for v0.3.

---

## 10. Hardening checklist

In order of importance:

1. **Bind loopback.** Container `ports` always reads `127.0.0.1:8765:8765`. Never `0.0.0.0:8765:8765`. Only nginx faces the network.
2. **Always set `AIFORGE_API_KEY`,** even for a personal project. Generate with `openssl rand -hex 32`.
3. **Enforce Bearer in nginx too.** `examples/nginx.conf` checks the header for `/v1/ingest` and `/v1/admin/*` — defense in depth. Even if the server has a bug, nginx returns 401 first.
4. **Write rate limits.** The `limit_req_zone` in the template stops a runaway `ingest` from burning your LLM quota.
5. **Don't put secrets in `mcp_config`.** Any `env` field (e.g. `GITHUB_PAT`) lands in SQLite. v0.2 doesn't encrypt at rest; either envelope-encrypt yourself, or keep secrets on the client and store empty placeholders server-side.
6. **Keep the systemd hardening.** `examples/systemd/aiforge.service` already has `ProtectSystem=strict`, `NoNewPrivileges`, and a strict `ReadWritePaths` allowlist. Don't accidentally relax these.
7. **Scope GitHub tokens minimally.** `public_repo` is enough for the finder + public-repo ingest.
8. **TLS-only.** Port 80 is redirect-only. HSTS header is already set in the nginx template.

---

## Where to next

- Full slash-command reference: [plugin-usage.en.md](plugin-usage.en.md)
- Recommender internals: [recommender-internals.en.md](recommender-internals.en.md)
- Architecture overview: [architecture.en.md](architecture.en.md)
- v0.2 contract (API, tags, gateway details): [extension-spec.md](extension-spec.md)
