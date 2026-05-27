<!--
感谢提 PR！请填写下面所有 sections，别留 TODO。
不超过 ~10 行代码的小改动可以省略「测试」段落。
-->

## 这个 PR 做了什么

<!-- 一两句话说清楚改动 -->

## 为什么需要这个改动

<!-- 关联的 issue、动机、场景。能 fix #123 就 `fix #123` -->

Fixes #

## 改动范围

- [ ] server / API
- [ ] server / recommender（热路径，需贴性能数据）
- [ ] server / ingestion
- [ ] server / discovery
- [ ] plugin / hook
- [ ] plugin / fallback
- [ ] docs
- [ ] CI / 打包
- [ ] 其他：

## 如何测试

<!--
- 自动化测试：跑了 `uv run pytest tests/test_xxx.py`
- 手工验证：写出复现 + 验证步骤，让 reviewer 能照着做
- 性能：贴 before/after p50/p95（如果改了 recommender）
-->

## 风险与回滚

<!-- 出问题怎么回滚？是否需要数据迁移？是否破坏向后兼容？ -->

## Checklist

- [ ] 跑了 `ruff check` + `ruff format` + `mypy --strict`
- [ ] 新代码有测试（除非纯 docs / 配置）
- [ ] 修改了 `docs/architecture.md` 涉及契约的部分（如果有）
- [ ] 中文文档优先，英文 `.en.md` 已同步（如果改了 docs）
- [ ] 没有 commit 进 `.env` 或 API key
- [ ] commit 信息符合约定式（feat/fix/docs/refactor/perf/chore）
