# Web 管理面板

> [English version](web-admin.en.md)

AIForge 的 Web 管理面板（位于 [`web/`](../web/)）把 skill / MCP / plugin 的浏览、入库、打标、推荐预览、审批、本地安装统一到 9 条路由里，让你不用再开 curl 也能看清整个 artifact 库。

## 设计语言

「**Editorial Engineering**」—— 像 quant 终端遇上 Stripe Docs 遇上 Linear：

- 暖色 parchment 底（`#FAFAF7`）+ 极细网格背景，区别于一般 SaaS 后台的死白
- 单一品牌色：氧化铜绿 `#0E5C4A`（不是常见的紫/蓝）
- 字体：Fraunces 变体衬线（标题）+ Inter（正文）+ JetBrains Mono（数字 / ID）
- 全局 `font-variant-numeric: tabular-nums` —— 所有数字像数据终端对齐
- 标志性元素：左上角 ○ ◆ ◇ 三符号 logo（skill / mcp / plugin）；底部 LIVE FEED 滚动 ticker；Dashboard 右上的 Reactor 旋转 SVG

## 9 条路由

| 路径 | 内容 | 主要 API |
|---|---|---|
| `/` | Dashboard：4 KPI、24h 推荐流量曲线、最近活跃 artifact、热门标签、新手 4 步引导 | `/v1/health`、`/v1/artifacts`、`/v1/tags` |
| `/artifacts` | 浏览列表 · 左 FilterRail（类型 / tag / 启用）+ 右表格/卡片切换 · URL state 可分享 | `GET /v1/artifacts?type=&tag=&q=` |
| `/artifacts/[id]` | 详情：body、metadata 网格、TagEditor 芯片编辑器、mcp_config 一键复制、plugin manifest 展示 | `GET /v1/artifacts/{id}`、`PUT /v1/artifacts/{id}/tags` |
| `/tags` | 标签管理：20 个预置标签 + 自定义，含使用度可视化条 | `/v1/tags`、`POST`、`DELETE` |
| `/ingest` | 粘贴 GitHub URL → 实时状态机时间线（pending → fetching → parsing → embedding → done） | `POST /v1/ingest`、`GET /v1/ingest/{id}` |
| `/autotag` | 触发自动打标 + 进度条 + ETA + 操作流；右侧候选标签 + LLM 后端信息 | `POST /v1/admin/autotag`、`GET /v1/admin/autotag/{id}` |
| `/playground` | 输入 prompt → 看 top-K 推荐 + ScoreBar + rerank 理由 + 8 个示例 prompt 一键填入 | `POST /v1/recommend` |
| `/discovery` | 远程 finder 找到的高质量仓库审批队列 · approve / reject 含 notes | `/v1/admin/discoveries`、`POST .../approve`、`POST .../reject` |
| `/settings` | API 地址 / API Key / 默认 top-K / 主题 / 危险区一键重置 | （仅本地存储 + `/v1/health` 测试） |

## 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 框架 | Next.js 14（App Router） | RSC + 静态导出可行，便于嵌入 FastAPI |
| 样式 | Tailwind CSS + 自研 shadcn-style 组件 | 全部 token 在 `tailwind.config.ts`；颜色变量 `parchment-*`、`ink-*`、`oxide-*`、`navy-*`、`amber-*`、`ember-*` |
| 状态 | SWR + URL search params | 列表数据走 SWR；筛选条件留在 URL 里可分享 |
| 数据可视化 | Recharts | 流量曲线、score bar、type-mix bar |
| 图标 | `lucide-react` | 全 SVG，零运行时开销 |
| Toast | sonner | 成功 / 失败提示 |

代理转发：`next.config.mjs` 的 `rewrites` 把 `/api/*` 转发到 `NEXT_PUBLIC_SKILLFORGE_API`（默认 `http://127.0.0.1:8765`）。生产环境用反向代理同样把 `/api/*` 指到后端即可。

## 启动

### 开发

```bash
cd web
npm install
npm run dev          # → http://localhost:3500
```

后端没起？UI 会自动 fallback 到 `lib/mock-data.ts` 里的演示数据，顶部出现 `DEMO MODE · 后端未连接` 徽章。所有页面始终可演示。

### 生产构建

```bash
cd web
npm run build
npm run start        # node 进程在 :3500
```

或者**静态导出**之后由 FastAPI 直接服务（v0.3 计划提供 Helm chart 内置）：

```bash
npm run build && cp -r .next/standalone /opt/aiforge-web
```

### 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `NEXT_PUBLIC_AIFORGE_API` | `http://127.0.0.1:8765` | 后端 API 地址。dev 期通过 rewrite 转发；生产由反向代理处理 |
| 浏览器 localStorage `aiforge.api_key` | — | 用户在 `/settings` 配的 API Key，写操作自动带上 `Authorization: Bearer <key>` |

## "小白友好"具体落点

- **每页顶部都有一段中文描述**告诉你这是什么、能做什么
- **HelpTip 气泡**：关键术语旁边都有 `?` 图标，悬停看解释（如「自动打标 = 用 Qwen-1.5B 从 20 个预置 tag 里挑 1-3 个」）
- **新手引导**：Dashboard 右栏的 4 步打勾清单（入库 → 自动打标 → Playground 试一次 → 安装到本地）
- **空状态都给下一步 CTA**：列表为空时不只是「无数据」，而是「先去 [入库](/ingest) 一个仓库」
- **表单错误即时反馈**：GitHub URL 格式不对当场提示，不等提交才发现
- **后端不可达时静默降级**：所有页面 fallback 到 demo 数据 + 顶部 DEMO 徽章，离线也能完整演示

## 信号与心跳

Dashboard 的 3 个标志性视觉元素是有意义的，不是装饰：

- **Reactor**：右上旋转同心圆 SVG，当 `health.embedder_loaded=true` 时活动。停了 = embedder 还没起来
- **HealthPill**：顶栏的状态徽章（HEALTHY / DEGRADED / DOWN / DEMO）每 12s 拉一次 `/v1/health`
- **LIVE FEED**：底部滚动 ticker，把最近的推荐 / 入库 / 打标事件转成文字流。当前是模拟数据，v0.3 接 WebSocket

## 自定义

主题色想换？改 [`tailwind.config.ts`](../web/tailwind.config.ts) 的 `oxide` 色系即可：

```ts
oxide: {
  500: '#0E5C4A',   // 主色
  // ... 调整其它阶
}
```

新增一条路由？在 `web/app/` 下创建文件夹 + `page.tsx`，然后在 [`components/shell/sidebar.tsx`](../web/components/shell/sidebar.tsx) 的 `NAV_GROUPS` 加一项。

## 与服务端的契约

`lib/api-types.ts` 与 `server/src/aiforge/core/schemas.py` 是**人工同步**的对子。改 schema 时两侧都要改。不要在前端用任何「猜测的」字段。

## 相关文档

- [快速上手](getting-started.md) —— 从零启动 AIForge
- [架构](architecture.md) —— 系统全貌、API 契约
- [插件用法](plugin-usage.md) —— `/aiforge:*` 命令
- [Artifact 格式](artifact-format.md) —— 各类 artifact 的字段规范
