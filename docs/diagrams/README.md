# 架构图

Mermaid 源文件。GitHub 渲染需在 markdown 里嵌入 ```mermaid 代码块；本目录留源用于：

- 维护时改图（mermaid 语法）
- 离线渲染（`mmdc -i architecture.mmd -o architecture.svg`）
- 嵌入到文档：复制内容粘到 ```mermaid 块

## 文件清单

| 文件 | 内容 |
|------|------|
| [architecture.mmd](architecture.mmd) | 总体架构（组件 + 数据流） |
| [sequence-recommend.mmd](sequence-recommend.mmd) | 一次推荐请求的完整时序 |
| [sequence-ingest.mmd](sequence-ingest.mmd) | 一次 GitHub 入库的完整时序 |

## 本地渲染

```bash
# 安装 mermaid-cli
npm install -g @mermaid-js/mermaid-cli

# 渲染为 SVG
mmdc -i architecture.mmd -o architecture.svg

# 或 PNG
mmdc -i architecture.mmd -o architecture.png -w 1600 -H 1200
```

## 在 Markdown 中嵌入

````markdown
```mermaid
<把 .mmd 内容粘进来>
```
````

> English: [README.en.md](README.en.md)
