# 数据库迁移（Alembic）

AIForge 服务端启动时会用 `Base.metadata.create_all()` 创建缺失的表，对小型部署够用。Alembic 是给**生产 / 多实例 / schema 演进**场景准备的。

> English: [README.en.md](README.en.md)

## 何时使用 Alembic

- 你在多实例 / 集群部署 AIForge
- 你修改了 `aiforge/core/models.py` 中的 ORM 定义，需要在已有库上演进
- 你想做 zero-downtime schema 变更

## 基本流程

```bash
cd server

# 把当前数据库刷到最新迁移
uv run alembic upgrade head

# 改完 models.py 后，自动生成下一次迁移
uv run alembic revision --autogenerate -m "add column foo"

# 检查生成的文件，必要时手改

# 回滚
uv run alembic downgrade -1
```

## 注意事项

- `vss_skills` 虚拟表（sqlite-vss）**不归 Alembic 管**。它由 `aiforge.core.db.init_db()` 在应用启动时按需创建/对齐。如果你换了 embedder 维度（默认 384），需要手动 `DROP TABLE vss_skills` 让应用重建。
- SQLite 的 `ALTER TABLE` 能力有限，所以 `env.py` 启用了 `render_as_batch=True`，让 Alembic 走"建临时表 → 拷数据 → 改名"的 batch 模式。

## 当前迁移

| Revision | 内容 |
|----------|------|
| `001` | 基线 schema：skills / ingest_jobs / pending_discoveries / recommendation_logs |
