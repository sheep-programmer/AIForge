# 服务端部署指南

> [English version](server-deployment.en.md)

读者：已经走完 [getting-started.md](getting-started.md)，现在想把 AIForge 搬到真服务器上、加 TLS、加鉴权、想着备份和升级。

下面顺着「装机 → 反代 → 鉴权 → 备份 → 升级 → 加固」一路走。

---

## 1. 资源画像

AIForge 设计上能在 **$5/月 VPS** 跑住，撑得起约 5k artifact 的索引。

| 进程 | 常驻内存 | CPU | 说明 |
|------|----------|-----|------|
| `aiforge-server` (含 embedder) | ~120 MB | 1 vCPU 够 | 推荐路径 ≤ 50 ms（无 reranker） |
| Ollama + Qwen2.5-1.5B | ~1.6 GB | 1-2 vCPU | 加上重排，p95 ~ 300 ms |
| `aiforge-mcp` 网关 | ~30 MB | 闲置时几乎为 0 | 通常**不**跑在服务器上 |
| SQLite (含向量索引) | 磁盘 50-500 MB | - | 5k artifact ~ 200 MB |

参考组合：

| 规格 | 用例 | 价位 |
|------|------|------|
| 1 vCPU / 1 GB | 仅向量召回，关 reranker | Hetzner CX11 / DO basic（~$5） |
| 2 vCPU / 4 GB | 带 Ollama 重排 | Hetzner CX21（~$10） |
| 4 vCPU / 8 GB | 重排 + 自动打标的库（万级 artifact） | Hetzner CX31（~$20） |

ARM 完全 OK（Hetzner CAX、树莓派），镜像有 `linux/arm64`。

---

## 2. Docker compose（推荐路径）

`server/docker/docker-compose.yml` 直接可用。生产 setup 通常做两件改动：

1. 加 `.env` 注入鉴权 / GitHub token
2. 把 ports 留在 `127.0.0.1`，公网由 nginx 反代

完整带注释的 yaml（在仓库里就是 `server/docker/docker-compose.yml`）：

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
      - "127.0.0.1:8765:8765"             # 严格回环 —— 公网走 nginx
    volumes:
      - ./data:/app/data                  # SQLite 持久化
    env_file:
      - ../.env                           # 见下方
    environment:
      AIFORGE_HOST: "0.0.0.0"             # 容器内监听
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

要 Ollama 重排，用 [examples/docker-compose.with-ollama.yml](../examples/docker-compose.with-ollama.yml)（多一个 ollama service + 共享网络，注意拉模型）。

`.env` 范本（放 repo 根的 `.env`，别提交到 git）：

```bash
AIFORGE_API_KEY=$(openssl rand -hex 32)
AIFORGE_GITHUB_TOKEN=ghp_xxx              # 私有仓库 + 提 rate limit
AIFORGE_RERANKER=none                     # 或 ollama / haiku
AIFORGE_LOG_LEVEL=INFO
AIFORGE_LOG_FORMAT=json
```

启动 & 看日志：

```bash
docker compose -f server/docker/docker-compose.yml up -d
docker compose -f server/docker/docker-compose.yml logs -f aiforge
```

---

## 3. 不用 Docker：systemd 单元

如果你的服务器已经有了 Python，或者想用宿主自带的 sqlite，可以裸跑：

```bash
# 1) 装依赖
sudo useradd --system --home /opt/aiforge --shell /usr/sbin/nologin aiforge
sudo git clone https://github.com/<you>/aiforge.git /opt/aiforge
sudo chown -R aiforge:aiforge /opt/aiforge

# uv 是官方推荐；pip / venv 也行
curl -LsSf https://astral.sh/uv/install.sh | sh
sudo -u aiforge bash -lc 'cd /opt/aiforge/server && uv sync'

# 2) sqlite-vss 需要 BLAS
sudo apt install -y libblas3 liblapack3

# 3) 注册 unit
sudo cp /opt/aiforge/examples/systemd/aiforge.service /etc/systemd/system/
sudo mkdir -p /var/lib/aiforge /etc/aiforge
sudo chown aiforge:aiforge /var/lib/aiforge

# 4) 鉴权 / GitHub token 单独放文件
sudo tee /etc/aiforge/aiforge.env >/dev/null <<EOF
AIFORGE_API_KEY=$(openssl rand -hex 32)
AIFORGE_GITHUB_TOKEN=ghp_xxx
AIFORGE_RERANKER=none
EOF
sudo chmod 600 /etc/aiforge/aiforge.env

# 5) 起来
sudo systemctl daemon-reload
sudo systemctl enable --now aiforge
sudo systemctl status aiforge
```

日志走 journald：

```bash
journalctl -u aiforge -f --output=cat
```

unit 里的 `ExecStart` 实际跑的是 `aiforge-server`（`server/pyproject.toml` 注册的 console script）。

---

## 4. 反向代理（nginx + TLS）

`examples/nginx.conf` 是个能直接抄的模板，做了：

- 80 → 443 跳转
- TLS 终结（certbot 注入）
- `/v1/health` 公开、不限流
- `/v1/ingest`、`/v1/admin/*` Bearer 强制 + 写限流（2 r/s + burst 5）
- `/v1/*` 其余读路径限流（30 r/s）

落地：

```bash
sudo cp examples/nginx.conf /etc/nginx/sites-available/aiforge
sudo ln -s /etc/nginx/sites-available/aiforge /etc/nginx/sites-enabled/
# 改 server_name 为你的域名
sudo nginx -t
sudo certbot --nginx -d aiforge.example.com
```

如果你打算把 Web 面板也代上来（`/api/*` 转发到 8765，`/` 给静态导出的 Next）：

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

Web 端只需要把 `NEXT_PUBLIC_API_BASE=/api` 在 build 时设上。

---

## 5. 鉴权

设了 `AIFORGE_API_KEY` 后：

| 路径类型 | 是否要 Bearer |
|----------|---------------|
| `GET /v1/health` | 不要（永远公开） |
| `GET /v1/artifacts`、`/v1/skills`、`/v1/tags`（读） | 用 `optional_api_key`：传了就校验，不传也放行 |
| `POST /v1/recommend` | 同上 |
| `POST /v1/ingest`、`/v1/admin/*`、`PUT/DELETE` 类（写） | **必须** Bearer |

调用方怎么传：

```bash
curl -H "Authorization: Bearer $AIFORGE_API_KEY" \
  -X POST https://aiforge.example.com/v1/ingest \
  -H 'Content-Type: application/json' \
  -d '{"github_url": "https://github.com/anthropics/skills"}'
```

- **插件**：`~/.config/aiforge/config.toml` 加 `api_key = "..."`，hook 会自动带上
- **Web 面板**：`/settings` 页输 Bearer，存 localStorage，每个请求带

---

## 6. 数据备份

唯一需要备份的就是 `AIFORGE_DB_PATH` 指向的那一个 SQLite 文件（默认 `./data/aiforge.db` 或 `/var/lib/aiforge/aiforge.db`）。

**简单方案：每天 rsync 到对象存储**

```cron
0 3 * * * sqlite3 /var/lib/aiforge/aiforge.db \
  ".backup '/var/backups/aiforge-$(date +\%F).db'" \
  && rclone copy /var/backups/aiforge-$(date +%F).db remote:aiforge-backups/
```

`sqlite3 .backup` 比 `cp` 安全 —— 它会拿到一致性快照，不会撞上正在写的事务。

**进阶：litestream**

```bash
# /etc/litestream.yml
dbs:
  - path: /var/lib/aiforge/aiforge.db
    replicas:
      - type: s3
        bucket: my-aiforge-backups
        path: aiforge.db
        region: eu-central-1
```

毫秒级 WAL 推到 S3，崩了直接 `litestream restore` 回放。

向量索引（`sqlite-vss` 虚表）跟着主 DB 一起备份，不需要单独操作。

---

## 7. 升级

```bash
cd /opt/aiforge
sudo -u aiforge git pull

# Docker 路径
docker compose -f server/docker/docker-compose.yml up -d --build

# systemd 路径
sudo -u aiforge bash -lc 'cd server && uv sync'
sudo -u aiforge bash -lc 'cd server && uv run alembic upgrade head'
sudo systemctl restart aiforge
```

v0.2 的迁移 `002_artifact_and_tags.py` 给已有 DB 增加：
- `Skill.artifact_type`、`Skill.mcp_config`、`Skill.plugin_manifest`
- 新表 `tags`、`artifact_tags`

这条迁移用 `op.batch_alter_table` 写法，**SQLite 上是安全的**（自动 copy-rename）。但还是先备份一份再 `alembic upgrade head`。

新依赖 `mcp>=1.2`（gateway 用），重新 `uv sync` 会拉好。

---

## 8. 生产里跑 MCP 网关

`aiforge-mcp` 一般**不**放在服务器上 —— 它是给 Claude Code 用的 stdio 子进程，跑在每个用户的工作机上。

服务器只暴露 HTTP API，让网关从那拉 active 集合即可：

```jsonc
// 工作机上 ~/.claude/settings.json
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

如果非要把网关跑在远端（比如多人共享一个 active 集，做 SSE 推送），把 `AIFORGE_SERVER_URL` 指回服务端，并 expose 一个 MCP-over-HTTP 端口给客户端 —— 但 v0.2 还是 stdio MVP，跨进程组只能做到 reload via `POST /v1/gateway/reload`。

---

## 9. 可观测性

服务端只输出 structlog JSON 到 stdout，剩下的交给你的日志栈：

```json
{"event": "recommend", "ts": "2026-05-27T12:34:56Z", "prompt_chars": 42,
 "top_k": 3, "ms": 187, "reranker": "ollama", "hit_ids": ["a1b2","c3d4","e5f6"]}
```

可选搭配：

- **Loki + Promtail**：直接吃 docker JSON log；查询 `{container="aiforge"} | json | ms > 500`
- **journalctl + logrotate**：systemd 部署最省事，`journalctl -u aiforge --since "1 hour ago"`
- **Vector / Logtail / Datadog**：把 stdout pipe 过去就行

健康监控直接拉 `/v1/health`（UptimeRobot、healthchecks.io 都行，30s 一次足够）。

Prometheus `/metrics` 还没内置，计划 v0.3。

---

## 10. 加固清单

按重要性排序：

1. **绑回环**：容器 `ports` 永远写 `127.0.0.1:8765:8765`。不要 `0.0.0.0:8765:8765`。只有 nginx 应该面向网络。
2. **必设 `AIFORGE_API_KEY`**：哪怕只是个人项目。`openssl rand -hex 32` 生成。
3. **nginx 层再校验 Bearer**：`examples/nginx.conf` 已经在 `/v1/ingest`、`/v1/admin/*` 上做了一层，纵深防御。即使服务端逻辑漏洞，nginx 也会 401。
4. **写限流**：nginx `limit_req_zone` 防 `ingest` 被刷爆 LLM 配额。
5. **不要把秘密塞进 `mcp_config`**：MCP 的 `env` 字段（如 `GITHUB_PAT`）会落到 SQLite。v0.2 不做静态加密；要存就先 envelope encryption，或干脆把秘密留在客户端 settings，服务端只存空 placeholder。
6. **systemd 加固**：`examples/systemd/aiforge.service` 已经开了 `ProtectSystem=strict` / `NoNewPrivileges` / `ReadWritePaths` 白名单。改 unit 时别一不小心把这些删了。
7. **GitHub token 用最小权限**：`public_repo` scope 足够 finder + 公开仓库 ingest。
8. **TLS-only**：80 端口仅做跳转。HSTS header 已在样板 nginx 里设了。

---

## 下一站

- 插件命令大全：[plugin-usage.md](plugin-usage.md)
- 推荐管线内部：[recommender-internals.md](recommender-internals.md)
- 架构概览：[architecture.md](architecture.md)
- v0.2 扩展契约（API、Tag、Gateway 细节）：[extension-spec.md](extension-spec.md)
