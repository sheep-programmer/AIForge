# 常见问题

> [English version](faq.en.md)

按主题分组，挑你关心的看。

---

## 安装

### Q：要 GPU 吗？

A：不要。embedder（`all-MiniLM-L6-v2`）在 CPU 上 384 维向量编码很快；Qwen2.5-1.5B 走 Ollama 在 CPU 上一次 rerank 大约 1 秒。GPU 只在你想堆高吞吐时才需要，普通团队用不到。

### Q：磁盘要多少？

A：模型缓存 ~2 GB（embedder + Qwen），artifact 数据 ~10 MB / 1000 条（SQLite 含向量）。一万条 artifact 算下来不到 100 MB。

### Q：能不能不用本地 Ollama，直接走 Anthropic API？

A：可以。设两个环境变量就够了：

```bash
export AIFORGE_RERANKER=haiku
export AIFORGE_ANTHROPIC_API_KEY=sk-ant-...
```

Haiku 排序质量比本地 1.5B 略好（小幅度），成本约 **$0.05 / 1000 次 rerank**。对延迟敏感且不想跑 Ollama 进程的人推荐这条路。

### Q：不装 Web 管理面板能用吗？

A：能。服务端 + 插件就是一套完整闭环：插件每次提问发 `/v1/recommend`，服务端返回 top-K，hook 注入上下文。Web 是锦上添花 —— 没有它你照样可以通过 `/aiforge:*` 命令完成入库、打标、安装。

---

## 行为

### Q：插件会把我的代码发到 AIForge 服务端吗？

A：**只发送 `prompt` 文本**。不发文件内容、不发 git 历史、不发环境变量。想验证就看 `plugin/lib/client.py` 的 `recommend()` 函数 —— 它只把 prompt 字符串塞进 JSON body。

更进一步：默认 reranker 是本地 Ollama，prompt 也不出你机器；只有显式开 `AIFORGE_RERANKER=haiku` 时，prompt 才会去 Anthropic API。

### Q：推荐的 skill 不对怎么办？

A：推荐是**指令**而非**强制**。agent 可以无视它。你也可以：

- `/aiforge:list` 看完整列表，找到那个**应该**被推荐的
- `/aiforge:tag <id> <tags>` 给它打更准确的 tag
- 下次类似 prompt 推荐就会改观

### Q：自动打标怎么保证准确率？

A：不保证 100%。小模型会漂。建议做法：

1. 每次大批量 ingest 后跑一次 `/aiforge:autotag`
2. 进 Web 面板的 `/tags` 页面扫一眼可疑的归类
3. 不满意的手工 `/aiforge:tag` 覆盖（手工 tag 的 `source=manual`，下次 autotag 不会动它）

把自动打标当成**省 80% 工时的初稿**，不要当成最终答案。

---

## 成本

### Q：日常运营要多少钱？

A：**$5/月 的 VPS + 零 LLM API 费用**（默认 Ollama 全本地）。如果换 Haiku reranker：每 1000 次 prompt 大约几分钱。一个 50 人团队一个月 LLM 费用控制在 $5 以内是正常水位。

### Q：1.5B 的小 reranker 真的够聪明吗？

A：意外地够。任务很窄 —— 「从这 5 条不到 200 字的描述里挑哪个最匹配这个 prompt」 —— 不需要推理也不需要世界知识。我们内部 benchmark 对比 Claude Sonnet：差距小到大多数场景感知不到。

需要高质量时再切 Haiku，没必要默认就上 Sonnet。

---

## 架构

### Q：为什么是 SQLite 而不是 Postgres？

A：**零运维**。SQLite 嵌入式、单文件、备份是 `cp`、迁移是 `scp`。配合 `sqlite-vss` 在 1-10 万级 artifact 上 k-NN 跑得很顺。

如果你将来过 100 万 artifact：推荐器的接口分得足够干净，换 pgvector 改 `~200 行` 适配层就行。我们没有锁定，只是**当前规模 SQLite 是更省力的选择**。

### Q：为什么不用官方 MCP SDK？

A：用了一部分，但 v0.2 的网关 MVP 是手搓 JSON-RPC。原因是官方 Python SDK 的 API surface 在 1.x 阶段还在漂，每个小版本都可能动签名。我们选择先稳定自家协议层，**v0.3 路线图里会迁回官方 SDK**。

### Q：为什么 skill / MCP / plugin 共用一张表？

A：95% 字段是共享的（name、description、source_url、embedding、tags、created_at...），只有少量类型特定字段（`mcp_config`、`plugin_manifest`）放 JSON 列。好处：

- 查询、过滤、排序逻辑只有一份
- 推荐管线对三类 artifact 一视同仁
- Web 面板的 `/artifacts` 是一个统一视图

代价：JSON 列查询不如规范化的列快。但这不在热路径上 —— 推荐只用 embedding。

---

## 安全

### Q：AIForge 会不会执行 ingest 仓库里的代码？

A：**永远不会**。入库器只读这几种文件：

- `SKILL.md`（作为 markdown 文本）
- `mcp.json` / `mcp-server.json` / `.mcp/config.json`（作为 JSON）
- `.claude-plugin/plugin.json`（作为 JSON）
- `package.json`（解析 `mcpName` / `keywords`）
- `README.md` 头部（最多 2000 字符）

仓库里的 `.py` / `.js` / `.sh` 文件**根本不会被打开**。

### Q：MCP 的 `env` 里有敏感 secret，存哪？

A：当前作为 JSON 存在 SQLite 里。**v0.2 没有专门的 secret 加密**。当下的实用建议：

- 整体加密 SQLite 文件（文件级加密 / 加密盘）
- 设 `AIFORGE_API_KEY` 并限制写 API 只在内网可达
- 真的敏感的（生产凭证）暂时别走 AIForge 安装，手工写 `settings.json`

v0.3 会加 per-artifact 加密的 secret store，敏感字段单独走密钥。

---

## 路线图

### Q：能不能接 Codex / Cursor / Gemini CLI？

A：**v0.3 路线图明确包含**。这三家都有 `UserPromptSubmit` 等价 hook。服务端是纯 HTTP，写一个新的 hook adapter 即可 —— 协议侧已经稳定，主要工作是各 agent 的 hook 接入方式。

愿意提前帮我们试水的，欢迎在 GitHub 开 issue 认领。

### Q：Web 管理面板什么时候有英文？

A：v0.3。当前所有路由都是中文。i18n 工作量主要在文案 —— 代码侧的国际化框架（next-intl）已经预留好。

---

## 其他

### Q：私有 skill 仓库怎么入库？

```bash
export AIFORGE_GITHUB_TOKEN=ghp_...
curl -X POST http://127.0.0.1:8765/v1/ingest \
  -d '{"github_url": "https://github.com/yourorg/private-skills"}'
```

token 需要 `repo` scope。

### Q：可以商用吗？

A：Apache 2.0，可以。
