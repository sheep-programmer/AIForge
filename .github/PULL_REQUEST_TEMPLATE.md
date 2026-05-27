<!--
感谢提 PR / Thanks for the PR!
- 中文为主、英文 OK / Chinese preferred, English also fine
- 别留 TODO / Don't leave TODOs in this template
- 不超过 ~10 行代码的小改动可省略「测试」段 / Tiny changes may skip the "Test" section
-->

## 这个 PR 做了什么 / Summary

<!-- 一两句话说清楚改动 / One or two sentences -->

## 为什么需要这个改动 / Motivation

<!-- 关联的 issue、动机、场景。能 fix #123 就 `Fixes #123` -->

Fixes #

## 改动范围 / Scope

- [ ] server / api
- [ ] server / recommender（热路径，需贴性能数据 / hot path — attach perf numbers）
- [ ] server / ingestion
- [ ] server / discovery
- [ ] server / gateway (aiforge-mcp)
- [ ] server / tagger (autotag)
- [ ] plugin / hook
- [ ] plugin / install / commands
- [ ] plugin / fallback
- [ ] web / dashboard / artifacts / playground / 其他
- [ ] docs (中文优先，英文 .en.md 同步 / zh first, .en.md mirrored)
- [ ] CI / build / Docker
- [ ] 其他 / other:

## 如何测试 / How to test

<!--
- 自动化：贴跑过的命令，如 uv run pytest tests/test_xxx.py / npx tsc --noEmit / npx next build
- 手工：写出复现 + 验证步骤，让 reviewer 能照着做
- 性能：改了 recommender / gateway / autotag 必须贴 before/after p50/p95
-->

## 截图 / Screenshots

<!-- 改 Web UI 必贴。其他可选。Before / After 对比更佳。 -->

## 风险与回滚 / Risk & rollback

<!--
- 出问题怎么回滚？需要数据迁移吗？破坏向后兼容吗？
- Alembic migration 升级路径？降级路径？
- 影响外部契约（API / mcp_config 形状 / 插件命令）吗？
-->

## Checklist

- [ ] `ruff check && ruff format --check && mypy --strict` 通过 / passes
- [ ] `cd web && npx tsc --noEmit && npx next build` 通过 / passes（如果改了 web）
- [ ] 新代码有测试（除非纯 docs / 配置）/ New code has tests (unless docs only)
- [ ] 改了 `docs/architecture.md` 中涉及的契约部分（如果有）
- [ ] 中文文档优先；英文 `.en.md` 已同步 / Chinese first, English mirrored
- [ ] 改了 schema 已写 alembic migration 并本地跑通 / Schema change has migration & ran locally
- [ ] 没有 commit `.env` / API key / 密钥 / `~/.claude/settings.json` / dot-env / secret
- [ ] Commit 信息符合 Conventional Commits（feat/fix/docs/refactor/perf/chore）
