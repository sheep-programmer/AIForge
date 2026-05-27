# 15 分钟上手 AIForge

> [English version](getting-started.en.md)

这篇文档假设你装了 Claude Code，但从没听说过 AIForge。跟着走完，你会有：

- 一个本地跑的 AIForge 服务端（Docker compose 一把启动）
- 一个生效的 Claude Code 插件，每次提问都被 hook 拦截 + 自动注入推荐
- 一个 Next.js Web 管理面板，能看到 9 个页面里你那几百个 artifact 长什么样
- （可选）一个 MCP 运行时网关进程，让 N 个 MCP server 在 agent 端看起来只有一个

每一步结束后都有一条可验证的 `curl` 或 UI 检查，做不出就别往下走。

---

## 0. 你需要

| 工具 | 用途 | 版本 |
|------|------|------|
| Docker + docker compose v2 | 跑服务端 | 24+ |
| Node.js | 跑 Web 管理面板 | 20+ |
| Python | 装插件（hook 是 stdlib 的 py3 脚本）；本地裸跑服务端时也要 | 3.11+ |
| `curl` / `jq` | 验证 API | 任意近期版本 |

不需要 Anthropic API Key。默认重排器走本地 Ollama + Qwen2.5-1.5B，零调用费。

---

## 1. 5 分钟启动：docker compose 一把梭

```bash
git clone https://github.com/<you>/aiforge.git    # 仓库名占位，按你 fork 改
cd aiforge
docker compose -f server/docker/docker-compose.yml up -d
```

容器起来后会暴露 `127.0.0.1:8765`（**默认只绑回环**，公网暴露要走 nginx，见 server-deployment）。等 ~20 秒让 sentence-transformer 权重加载完，然后：

```bash
curl http://127.0.0.1:8765/v1/health | jq
# {
#   "status": "ok",
#   "version": "0.2.0",
#   "artifacts_count": 0,
#   "reranker_available": false
# }
```

`artifacts_count: 0` 是对的 —— 我们还没入库。`reranker_available: false` 是因为默认 compose 把 `AIFORGE_RERANKER` 设成了 `none`（最快路径）。要打开 Ollama 重排，看 [examples/docker-compose.with-ollama.yml](../examples/docker-compose.with-ollama.yml)。

### 种入第一个仓库

```bash
# 把 Anthropic 官方 skill 库整个吸进来
curl -X POST http://127.0.0.1:8765/v1/ingest \
  -H 'Content-Type: application/json' \
  -d '{"github_url": "https://github.com/anthropics/skills"}'
# → {"job_id": "01J...", "status": "queued"}
```

入库是异步的。轮询任务：

```bash
JOB=01J...                          # 用上面返回的 job_id
curl -s http://127.0.0.1:8765/v1/ingest/$JOB | jq
# status 会从 queued → cloning → splitting → embedding → done
```

入库器同时会检测：
- 仓库根的 `.claude-plugin/plugin.json` → 进 plugin 表
- `mcp.json` / `package.json` 含 mcp 标识 → 进 mcp 表
- 递归找到的 `SKILL.md` → 进 skill 表

一个仓库吐出 3 类 artifact 完全正常。这就是 v0.2 **统一 Artifact 模型**的好处。

---

## 2. 验证：服务端真的好了

```bash
curl -s http://127.0.0.1:8765/v1/health | jq '.artifacts_count'
# 39                                # 数字看你入了哪个仓库

curl -s http://127.0.0.1:8765/v1/artifacts | jq '.total'
# 39

# 按类型筛
curl -s 'http://127.0.0.1:8765/v1/artifacts?type=skill' | jq '.total'
curl -s 'http://127.0.0.1:8765/v1/artifacts?type=mcp'   | jq '.total'
curl -s 'http://127.0.0.1:8765/v1/artifacts?type=plugin'| jq '.total'

# 实际跑一次推荐
curl -s -X POST http://127.0.0.1:8765/v1/recommend \
  -H 'Content-Type: application/json' \
  -d '{"prompt": "review this PR for SQL injection", "top_k": 3}' \
  | jq '.recommendations[] | {name, score, rerank_reason}'
```

看到 3 条带 `score` 的结果就 OK。没装重排器时是纯向量相似度排序，已经够用。

---

## 3. 装 Claude Code 插件

```bash
cd plugin
./install.sh --server http://127.0.0.1:8765
```

脚本会：

1. 把整个 `plugin/` 目录拷到 `~/.claude/plugins/aiforge/`（`--dev` 改成 symlink）
2. 在 `~/.config/aiforge/config.toml` 写 `server_url`、`top_k`、`timeout_ms`
3. 由 Claude Code 自动扫描发现的 `.claude-plugin/plugin.json` 注册一个 `UserPromptSubmit` hook

hook 干的事：每次你按 Enter 提交 prompt，Claude Code 在调模型**之前**把 JSON（含你的 prompt）从 stdin 传给 `~/.claude/plugins/aiforge/hooks/on-user-prompt`，hook 调 `/v1/recommend`，把 top-3 artifact 拼成一段 system 提示注入回上下文。整个过程预算 250 ms，超时就 fallback 到本地缓存。

重启 Claude Code 让它发现新插件，再跑：

```
/aiforge:status        # 应该输出：server ok / cache N / last recommend ...
```

---

## 4. 看一次推荐实际生效

新会话里输入：

```
> 帮我把 src/auth/login.py 里的 SQL 注入风险审一遍
```

第一行回复**上方**会冒一条注入摘要：

```
[aiforge] loaded: anthropics:security-review, superpowers:pre-commit, ljg-skills:concept-anatomist
```

这就是 hook 干的活。三个 artifact 的 body 已经被塞进了 system message。如果嫌注入吵，`~/.config/aiforge/config.toml` 把 `enabled = false` 关掉即可。

也可以从命令行预览推荐（不进 Claude）：

```bash
/aiforge:search "browser end-to-end test"
```

---

## 5. 打开 Web 管理面板

```bash
cd web
npm install            # 第一次大约 30s
npm run dev            # → http://localhost:3500
```

后端连不上时前端自动 fallback 到 demo 数据 —— UI 永远可看，演示零门槛。

9 个路由速览：

| 路径 | 用途 |
|------|------|
| `/` | Dashboard：KPI 卡、推荐流量曲线、新手 4 步引导 |
| `/artifacts` | 全部 artifact 列表，按类型/标签/仓库过滤 |
| `/artifacts/[id]` | 详情：body、metadata、tag 编辑器、`mcp_config` 一键复制 |
| `/tags` | 20 个预置 tag + 自定义；artifact 使用度可视化 |
| `/ingest` | 粘 GitHub URL → 状态机时间线（clone / split / embed / done） |
| `/autotag` | 触发批量打标 + 进度条 + 实时操作流 |
| `/playground` | 输 prompt 看 top-K 推荐 + score bar + rerank 理由 |
| `/discovery` | 远程 finder 发现的新仓库 → 人工审批队列 |
| `/settings` | API 地址 / Bearer Key / 默认 top-K / 主题 |

详细操作手册：见 [web-admin.md](web-admin.md)（即将上线）。

---

## 6. （可选）装 MCP 运行时网关

如果你接了 5 个 MCP server（filesystem、playwright、brave-search、postgres、github），Claude Code 启动时会一次性把所有 tool 列表灌进上下文 —— 一上来就烧掉几千 token。

AIForge 的解法：**`aiforge-mcp` 进程对外是一个 MCP server，对内连 N 个下游**，只把当前 active 的 tool 子集暴露给 agent。

安装：

```bash
cd server
pip install -e .                                       # 也安装了 aiforge-mcp 入口
which aiforge-mcp                                      # 确认在 PATH 里
```

或者用 `uv` 跑而不全局装：

```bash
uv tool install --from ./server aiforge
```

接入 `~/.claude/settings.json`：

```json
{
  "mcpServers": {
    "aiforge": {
      "command": "aiforge-mcp",
      "env": { "AIFORGE_SERVER_URL": "http://127.0.0.1:8765" }
    }
  }
}
```

启动后 `aiforge-mcp` 会：
1. 拉 `GET /v1/artifacts?type=mcp&active=true`
2. 对每个 active MCP 起一个子进程（stdio）做下游 client
3. 聚合 tool 列表，按 `<artifact_name>__<tool_name>` 命名空间路由
4. Claude Code 只看见一个名为 `aiforge` 的 MCP server

MVP 还不支持热更，改 active 集合后重启 Claude Code 即可。完整设计见 [extension-spec.md §7](extension-spec.md)。

---

## 7. 常见下一步

### 一次性灌入 7 个流行 skill 仓库

```bash
./examples/seed-popular-skills.sh
# obra/superpowers-skills, anthropics/skills, pbakaus/impeccable,
# garrytan/gstack, lijigang/ljg-skills, vercel-labs/skills,
# affaan-m/everything-claude-code
```

入完应该有几百条 artifact。

### 跑一次自动打标

入库出来的 artifact 还没有 tag。让小模型按 20 个预置 tag 给每条挑 1-3 个：

```bash
curl -X POST http://127.0.0.1:8765/v1/admin/autotag \
  -H 'Content-Type: application/json' \
  -d '{"limit": 200}'
# → {"job_id": "...", "total": 200}

# 或者直接在 Web 面板的 /autotag 页点「开始」，进度条更友好
```

需要打开 Ollama 重排器（否则 tagger 没有 LLM 后端）。详见 [server-deployment.md §1](server-deployment.md)。

### 审批 discovery 队列

打开远程 finder 后（默认关闭），它每天扫一次 GitHub trending，把高质量新仓库放到 `/discovery` 页面里**等你审批**。批准的才进库。

```bash
# 临时启用一次试试：
AIFORGE_ENABLE_REMOTE_FINDER=true \
  docker compose -f server/docker/docker-compose.yml up -d
```

### 把它放到 VPS 上

见 [server-deployment.md](server-deployment.md)：sizing、systemd、nginx + TLS、备份、升级、加固。

---

## 8. 排错

### `Bind for 0.0.0.0:8765 failed: port is already allocated`

8765 被占了。改 `server/docker/docker-compose.yml` 里的 ports：

```yaml
ports:
  - "127.0.0.1:18765:8765"      # 外部 18765，容器内还是 8765
```

然后 plugin 装的时候带 `--server http://127.0.0.1:18765`。

### `reranker_available: false` 永远是 false

默认 compose 用 `AIFORGE_RERANKER=none`，所以没 reranker 也正常。要本地小模型重排：

```bash
docker compose -f examples/docker-compose.with-ollama.yml up -d
docker compose -f examples/docker-compose.with-ollama.yml exec ollama \
  ollama pull qwen2.5:1.5b
```

模型 ~1 GB，首次拉要等。

### `libblas.so.3: cannot open shared object file`

`sqlite-vss` 在裸机（非 Docker）跑时依赖 BLAS。Ubuntu/Debian：

```bash
sudo apt install libblas3 liblapack3
```

Docker 镜像已经包好，宿主不需要装。

### 第一次 ingest 慢

冷启动时 sentence-transformer 要 load 权重（~90 MB）、首个 batch 编码。一个百级 SKILL 仓库 30-60 秒正常。第二次起就快了 —— 权重常驻内存。

### `/aiforge:status` 报 server 不可达

```bash
# 1) 服务端在不在
curl -fsS http://127.0.0.1:8765/v1/health

# 2) 插件里的 server_url 对不对
cat ~/.config/aiforge/config.toml | grep server_url

# 3) hook 有没有装上
jq '.hooks.UserPromptSubmit' ~/.claude/settings.json
```

任一步对不上就去对。

---

## 下一站

- 部署上线：[server-deployment.md](server-deployment.md)
- 架构深挖：[architecture.md](architecture.md)
- 插件命令大全：[plugin-usage.md](plugin-usage.md)
- 推荐管线内部：[recommender-internals.md](recommender-internals.md)
- 用法答疑：[faq.md](faq.md)
