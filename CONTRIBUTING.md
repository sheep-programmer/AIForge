# 给 AIForge 提交贡献

感谢你愿意参与。项目还年轻，每一个 PR 都很重要。

> English: [CONTRIBUTING.en.md](CONTRIBUTING.en.md)

## 当前最需要的贡献

1. **真实世界的 skill 库样本** —— 把 AIForge 排错的场景告诉我们。Issue 里贴 prompt + 排序结果
2. **重排器 prompt 优化** —— 见 `server/src/aiforge/recommender/reranker.py`。能在 `server/tests/eval/` 上有可测量提升的 PR 最受欢迎
3. **去重测试用例** —— 已知等价的 skill 对，加到 `server/tests/test_deduper.py`
4. **跨 agent 插件** —— 当前插件针对 Claude Code，期待 Cursor / Codex / Gemini CLI 适配

## 开发环境

```bash
git clone https://github.com/<you>/aiforge.git
cd aiforge/server
uv sync                          # 安装依赖
uv run pytest                    # 跑测试
uv run uvicorn aiforge.main:app --reload
```

插件：

```bash
cd plugin
./install.sh --server http://localhost:8765 --dev
```

## 代码风格

- Python：`ruff format` + `ruff check` + `mypy --strict`（配置见 `server/pyproject.toml`）
- 所有公开函数必须有类型注解
- 任何新端点或推荐器改动都要有测试
- 注释和文档**中文优先**，英文版本通过 `.en.md` 维护

## 提交信息

约定式提交：`feat:` / `fix:` / `refactor:` / `docs:` / `test:` / `chore:`。推荐器是热路径，量化优化用 `perf:` 前缀最合适。

## 发送 PR

1. 改动超过几行先开 issue 讨论
2. 从 `main` 拉分支，命名如 `feat/rerank-batch`
3. PR 描述包含：做什么 + 为什么 + 如何测试
4. CI 必须通过

## 行为准则

见 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。友善、假设善意。
