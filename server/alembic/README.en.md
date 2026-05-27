# Database migrations (Alembic)

The server runs `Base.metadata.create_all()` at startup, which is enough for small deployments. Alembic is for **production / multi-instance / schema evolution**.

## When to use Alembic

- Multi-instance / clustered AIForge deployment
- You changed ORM definitions in `aiforge/core/models.py` and need to evolve an existing DB
- You want zero-downtime schema changes

## Workflow

```bash
cd server
uv run alembic upgrade head
uv run alembic revision --autogenerate -m "add column foo"
uv run alembic downgrade -1
```

## Notes

- The `vss_skills` virtual table (sqlite-vss) is **not** managed by Alembic. It is created/aligned by `aiforge.core.db.init_db()` at startup. If you change the embedder dimension (default 384), drop `vss_skills` manually so the app recreates it.
- SQLite has limited `ALTER TABLE` support — `env.py` enables `render_as_batch=True` for batch mode rewrites.
