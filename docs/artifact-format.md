# Artifact 格式

> [English version](artifact-format.en.md)
> 关联：[插件用法](plugin-usage.md) · [快速上手](getting-started.md) · [项目主页](../README.md) · [扩展规范](extension-spec.md)

AIForge 把三种扩展统一为 **artifact**：`skill`、`mcp`、`plugin`。本文写给
**仓库作者** —— 想让自己的扩展被 AIForge 正确识别并推荐，仓库里要长什么样。

如果你只想跑通插件，先看 [getting-started.md](getting-started.md)。

---

## 1. 概览

| `artifact_type` | 主要载体 | 检测信号 | 用途 |
|---|---|---|---|
| `skill` | `SKILL.md` | 文件名匹配 + 合法 frontmatter | 推荐器命中时整段注入 prompt |
| `mcp`   | `mcp_config` JSON | 多种约定（见 §3） | 安装到 `settings.json` 的 `mcpServers` |
| `plugin`| `plugin_manifest` JSON | `.claude-plugin/plugin.json` | `git clone` 到 `~/.claude/plugins/<name>/` |

### 1.1 检测优先级

`POST /v1/ingest` 拿到 GitHub 仓库后：

1. **plugin** —— 仓库根有 `.claude-plugin/plugin.json` → 写 1 条 plugin artifact
2. **mcp** —— 命中以下任一信号 → 写 1 条 mcp artifact
3. **skill** —— 递归扫所有 `SKILL.md`（剪枝 `.git` / `node_modules` / `dist` / ...）

> 一个仓库**可以同时**产出多种 artifact。例如 `aiforge` 自己的 plugin 仓库同时
> 是一个 plugin 和包含 1 个 skill，会写出两条 artifact 共享 `source_url`。

### 1.2 共用字段

不管是哪种 artifact，以下字段都会写入：

| 字段 | 来源 |
|------|------|
| `id` | `SHA256(source_url + source_path)[:16]` |
| `artifact_type` | `skill` / `mcp` / `plugin` |
| `name` | 各自 adapter 抽取的名字 |
| `description` | 短描述（用于搜索 / 列表） |
| `body` | 给推荐器和注入用的正文 |
| `source_url` | 原 GitHub URL |
| `source_path` | 相对仓库根的 POSIX 路径 |
| `embedding` | `all-MiniLM-L6-v2` 编码 `name + description` |

`mcp` / `plugin` 额外带 `mcp_config` 或 `plugin_manifest` JSON 列。

---

## 2. Skill 格式

### 2.1 文件位置

任意深度的 `SKILL.md`，文件名必须严格是 `SKILL.md`（大小写敏感）。
splitter 递归扫描，但会跳过这些目录：

```
.git .hg .svn  node_modules  .venv venv __pycache__
.mypy_cache .pytest_cache .ruff_cache
dist build target  tests test
.tox .idea .vscode
```

### 2.2 frontmatter（必需）

```markdown
---
name: security-review
description: 审查代码中的 OWASP top 10 漏洞，特别关注注入、认证、加密相关问题
---

# Security review

...
```

| 字段 | 类型 | 必需 | 说明 |
|------|:---:|:---:|------|
| `name` | string | ✓ | slug 化的唯一名字；空字符串视为缺失 |
| `description` | string | ✓ | 1-3 句话；embedder 主要靠这个匹配 |

> `name` 或 `description` 缺失 / 非字符串 → 该 SKILL.md 被跳过并记日志。
> 其它字段（version / tags / language ...）目前**忽略**，不报错。

### 2.3 body 写作

- **自由 markdown**，无结构约束
- 服务端按 **4 字符 / token** 估算 `body_tokens`，单条预算 400-1200 tokens 最稳
  - 太短（< 200）：reranker 缺信息，被同主题更详尽的 skill 挤掉
  - 太长（> 2000）：超过插件 `max_tokens` 时会截断，且耗用户上下文预算
- 写**给 agent 看**的指令，不要寒暄：
  - 不好：「这是一个用来辅助 review 的 skill。」
  - 好：「当用户请求 review PR / 一段代码、或问『这段代码安全吗 / 能合并吗』时，
    按以下步骤执行：1) ...」
- 第一段最关键 —— embedder 把 description + body 前 ~500 字符一起编码，第一段
  决定能否进入召回

### 2.4 完整示例

```markdown
---
name: run-failing-tests
description: 自动定位最近改动相关的失败测试并复跑，给出最小修复方案
---

# Run failing tests

## 何时使用
- 用户说 "测试挂了 / 跑测试 / why is the test failing"
- 用户贴出一段 pytest / jest / go test 的错误输出

## 步骤
1. `git status` + `git diff --name-only HEAD~1` 找改动范围
2. 在改动文件对应的测试目录跑 `pytest -x` / `vitest --run`
3. 取第一条失败，分析 traceback，定位**最小复现**
4. 给出 fix 候选 + 解释，不要直接修改文件除非用户确认

## 不要做
- 不要 stub 掉断言来"修复"测试
- 不要静默 catch 异常
```

> 这里头每一段都是 agent 可执行的指令：触发关键词 → 步骤 → 边界。这种 skill
> 容易被推荐且容易被正确使用。

---

## 3. MCP 格式

AIForge 不要求你按一个固定 schema 来 —— 它**容错地**从仓库里捞出能识别的信号。

### 3.1 检测规则（按优先级）

第一条命中即停止：

1. **配置文件**：仓库根存在以下任一文件
   - `mcp.json`
   - `mcp-server.json`
   - `.mcp/config.json`
2. **package.json 信号**：包含 `"mcpName"` 字段，**或** `"keywords"` 数组里有
   `"mcp"` / `"model-context-protocol"`
3. **README 前 500 字符**：正则匹配 `/MCP server|Model Context Protocol/i`

### 3.2 `name` 推导优先级

```
配置文件里的 "name" 字段
  → package.json 的 "mcpName" / "name"
  → 仓库目录名（兜底）
  → "mcp-server"（终极兜底）
```

### 3.3 `mcp_config` JSON 形状

服务端把检测到的配置规范化为下面三种之一。这与 Claude Code `settings.json` 的
`mcpServers.<name>` 子段直接互通 —— `/aiforge:install` 把它原样写进去。

**stdio**（最常见）：
```json
{
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"],
  "env": {"FOO": "bar"}
}
```
说明：`command` 是要 spawn 的可执行文件；`args` 是命令行参数；`env` 全部按字符串
存储（避免数字 / 布尔污染 JSON）。

**http**：
```json
{
  "transport": "http",
  "url": "https://api.example.com/mcp",
  "headers": {"Authorization": "Bearer ..."}
}
```
说明：HTTP 长连接传输，`headers` 可选；适合云端托管 MCP。

**sse**：
```json
{
  "transport": "sse",
  "url": "https://api.example.com/sse"
}
```
说明：Server-Sent Events 流式传输，无 `headers` 默认值。

### 3.4 仓库作者最佳实践

如果你的仓库主要就是一个 MCP server，**至少**做到以下一种：

- 在仓库根放一个 `mcp.json`，写好 `name` / `command` / `args`
- 在 `package.json` 里加 `"mcpName"` 或把 `mcp` 加入 `keywords`
- README 第一段开门见山写 "An MCP server for ..."

### 3.5 `body` 和 `description`

- `body`：README 全文截到 **2000 字符**；找不到 README 时退化为 `description`
- `description`：取自配置文件 / package.json 的 `description`；缺失时回退到
  README 第一行非空文字（去掉 `#` 与图片），上限 256 字符；都没有就用
  `"MCP server from <repo_name>"`

---

## 4. Plugin 格式

### 4.1 检测

唯一规则：仓库根存在 `.claude-plugin/plugin.json` 且能解析成 JSON 对象。

### 4.2 `plugin_manifest` JSON 形状

AIForge 透传以下键（其余字段忽略，避免 SQLite 行膨胀）：

| 键 | 类型 | 用途 |
|----|------|------|
| `name` | string | plugin 名；同时是 `~/.claude/plugins/<name>/` 目录名 |
| `version` | string | 用户看的版本号 |
| `description` | string | 短描述（用于推荐和列表） |
| `commands` | string[] | 相对路径，例如 `"commands/foo.md"` |
| `hooks` | object | 例如 `{"UserPromptSubmit": "hooks/on-prompt"}` |
| `skills` | string[] | 内嵌 SKILL.md 的相对路径 |
| `mcpServers` | object | plugin 带的 MCP 配置 |
| `author` / `homepage` / `license` | string | 元信息 |

AIForge 额外补两个字段：

- `manifest_path = ".claude-plugin/plugin.json"`
- `install_url = <source_url>`（用于 `/aiforge:install` 时的 `git clone`）

### 4.3 完整示例

`aiforge` 自己的 plugin manifest：

```json
{
  "name": "aiforge",
  "version": "0.1.0",
  "description": "为 Claude Code 智能推荐和注入最相关的 skill",
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
说明：`commands` 数组里每个 `.md` 文件就是一个 slash command；`skills` 数组让
内嵌 SKILL.md 同样进 AIForge 索引（每个都被识别成一条独立 skill artifact）。

### 4.4 安装行为

`/aiforge:install <plugin-artifact-id>` 实际等价于：

```bash
git clone --depth 1 <install_url> ~/.claude/plugins/<name>/
```

Claude Code 启动时自动扫描 `~/.claude/plugins/`，所以**不需要**改
`settings.json`。

### 4.5 `body` 与 `description`

- `body`：README 全文截到 **8000 字符**（比 mcp 慷慨，因为 plugin 通常有完整文档）
- `description`：取 `plugin.json` 的 `description` → README 首行 → `"Claude Code plugin: <name>"`

---

## 5. 混合仓库

一个仓库可以同时贡献多种 artifact。最常见的两种组合：

### 5.1 plugin + 内嵌 skill

```
my-bundle/
├── .claude-plugin/
│   └── plugin.json          ← 触发 plugin 检测
├── skills/
│   ├── tdd/
│   │   └── SKILL.md         ← skill #1
│   └── refactor/
│       └── SKILL.md         ← skill #2
├── commands/
│   └── ...
└── README.md
```

入库结果：1 条 plugin artifact + 2 条 skill artifact，**共享同一 `source_url`**，
通过 `source_path` 区分。

### 5.2 mcp + skill 食谱集

```
playwright-toolkit/
├── package.json             ← keywords: ["mcp"] → 触发 mcp 检测
├── src/server.js
├── skills/
│   ├── e2e-test/
│   │   └── SKILL.md         ← 教 agent 怎么用本 MCP 写 E2E 测试
│   └── visual-regression/
│       └── SKILL.md
└── README.md
```

入库结果：1 条 mcp + 2 条 skill。推荐器在合适的 prompt 下会同时把 mcp 元数据和
skill 步骤一起注入。

### 5.3 三合一

完全可行。`plugin` + `mcp` + 多个 `skill` 同仓库共存，只要满足各自的检测规则。

---

## 6. AIForge 不会做的事

明确边界，避免误用：

1. **不执行任何仓库代码** —— ingestion 只读取文件、不 `npm install`、不 `pip
   install`、不跑构建。MCP 的 `command` 只在你 `install` 后由 Claude Code 自己
   spawn。
2. **不加密 secrets** —— `mcp_config.env` 里的字段会**明文**写进服务端 SQLite
   和你的 `~/.claude/settings.json`。生产环境里建议 `env` 引用环境变量名而非
   原值；端到端加密在 v0.3 路线图上。
3. **不跑 lint / format** —— 你 SKILL.md 里 markdown 语法错的也照存，渲染问题
   你自己负责
4. **不验证仓库合法性 / 许可证** —— 入库前请自行确认源仓库的 LICENSE 允许被你
   的下游使用
5. **不做权限审查** —— MCP 能跑 shell、能读文件、能 fetch 网络 —— 装之前请像审
   查一段 `npm install` 一样审查它

---

## 7. 各类型作者备忘

**Skill 作者**
- description 写「触发场景」而非「这是什么」
- body 用步骤式祈使句；不要让 agent 自由发挥
- 控制在 400-1200 token；超长就拆成多个 skill
- 名字用动词短语 kebab-case：`security-review` / `run-failing-tests`
- 不要在 SKILL.md 里写 "见 docs/setup.md" —— reranker 看不到外部文件

**MCP 作者**
- 优先在仓库根放 `mcp.json` —— 检测最稳，`mcp_config` 字段最准
- README 第一句明确写出 "MCP server for X" —— 既帮 AIForge 检测，也帮 reranker
- `env` 字段填的是**变量名约定**（如 `OPENAI_API_KEY`），不要硬塞真值
- 给 tool 起短而独特的名字 —— gateway 会按 `<server>__<tool>` 暴露

**Plugin 作者**
- `plugin.json` 的 `description` 写清楚「这个 plugin 解决什么问题」
- `commands` / `skills` / `hooks` / `mcpServers` 数组按需填，留空也没问题
- README 写到 8000 字符以内 —— 超过的部分会被截断
- 内嵌 skill 时每个 SKILL.md 都按本规范第 2 节写，否则会被跳过
