# Contributing to AIForge

Thanks for considering a contribution. The project is young — every PR moves it forward.

## Where help is most useful right now

1. **Real-world skill libraries** — point us at a library AIForge mis-ranks. Open an issue with the prompt + the ranking output.
2. **Reranker prompts** — the small-LLM rerank prompt is in `server/src/aiforge/recommender/reranker.py`. Improvements measured against `server/tests/eval/` are gold.
3. **Dedup test cases** — add cases to `server/tests/test_deduper.py` for known-equivalent skill pairs.
4. **Cross-agent plugins** — the current plugin targets Claude Code. A Cursor / Codex / Gemini CLI adapter is wanted.

## Development setup

```bash
git clone https://github.com/<you>/aiforge.git
cd aiforge/server
uv sync                          # install deps
uv run pytest                    # run tests
uv run uvicorn aiforge.main:app --reload
```

Plugin:

```bash
cd plugin
./install.sh --server http://localhost:8765 --dev
```

## Code style

- Python: `ruff format` + `ruff check` + `mypy --strict` (config in `server/pyproject.toml`).
- Type hints required on all public functions.
- Tests for any new endpoint or recommender change.

## Commit messages

Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`. The recommender pipeline is hot — `perf:` is a good prefix when you measure-and-improve.

## Sending a PR

1. Open an issue first if the change is more than a few lines.
2. Branch from `main`, name like `feat/rerank-batch`.
3. PR description should include: what + why + how-tested.
4. CI must pass.

## Code of conduct

See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Be kind, assume good intent.
