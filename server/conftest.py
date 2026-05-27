"""服务端 pytest 顶级 conftest：补充 tests/conftest.py 不便扩展的内容。

主要职责：
- 注入 autouse 数据库清理 fixture，避免测试间状态泄漏
- 全局替换 sentence-transformers Embedder 为假实现，避免下载模型 / GPU 探测
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Generator

import pytest


# 让 `import tests._utils` 在子目录测试里可用
_TESTS_DIR = Path(__file__).parent / "tests"
if str(_TESTS_DIR.parent) not in sys.path:
    sys.path.insert(0, str(_TESTS_DIR.parent))


@pytest.fixture(autouse=True, scope="session")
def _stub_embedder_globally() -> Generator[None, None, None]:
    """全局把 get_embedder 换成假 embedder（避免下载 sentence-transformers 模型）。

    必须在第一个 TestClient 创建前生效，否则 lifespan 会真的加载模型。
    """
    import numpy as np

    from aiforge.recommender import embedder as embedder_mod

    class _Fake:
        @property
        def dim(self) -> int:
            return 384

        def embed(self, text: str) -> np.ndarray:
            import hashlib

            h = hashlib.sha256(text.encode("utf-8")).digest()
            rng = np.random.default_rng(int.from_bytes(h[:8], "big"))
            vec = rng.standard_normal(384).astype(np.float32)
            norm = float(np.linalg.norm(vec))
            return (vec / norm if norm > 0 else vec).astype(np.float32)

        def embed_batch(self, texts: list[str]) -> np.ndarray:
            if not texts:
                return np.zeros((0, 384), dtype=np.float32)
            return np.vstack([self.embed(t) for t in texts])

    fake = _Fake()
    # 直接把单例塞进去，跳过 SentenceTransformer 加载
    embedder_mod._embedder = fake  # type: ignore[assignment]
    # 同时 stub 工厂函数
    original_get = embedder_mod.get_embedder
    embedder_mod.get_embedder = lambda settings=None: fake  # type: ignore[assignment]

    # 任何模块若已 import 了 get_embedder（如 pipeline），也要覆盖局部引用
    try:
        from aiforge.recommender import pipeline as pipeline_mod

        pipeline_mod.get_embedder = lambda settings=None: fake  # type: ignore[assignment]
    except ImportError:
        pass

    try:
        yield
    finally:
        embedder_mod._embedder = None
        embedder_mod.get_embedder = original_get  # type: ignore[assignment]


@pytest.fixture(autouse=True)
def _truncate_tables_before_test(request: pytest.FixtureRequest) -> Generator[None, None, None]:
    """每个测试前清空业务表，避免相互污染。

    只有当测试依赖了 db_session / api_client 才介入；其它纯函数测试不触发。
    """
    needs_db = any(
        name in request.fixturenames for name in ("db_session", "api_client", "settings")
    )
    if not needs_db:
        yield
        return

    # 用独立的引擎连接做 cleanup，避免与测试自带 session 冲突
    _do_clean()
    yield
    _do_clean()


def _do_clean() -> None:
    """打开一条临时连接，清空业务表。"""
    try:
        from aiforge.config import get_settings
        from aiforge.core.db import get_session_maker, init_db

        s = get_settings()
        init_db(s)
        sm = get_session_maker(s)
        from sqlalchemy import text

        with sm() as session:
            for stmt in (
                "DELETE FROM recommendation_logs",
                "DELETE FROM ingest_jobs",
                "DELETE FROM pending_discoveries",
                "DELETE FROM vss_skills",
                "DELETE FROM skills",
            ):
                try:
                    session.execute(text(stmt))
                except Exception:
                    pass
            session.commit()
    except Exception:
        # 数据库还没就绪时静默跳过
        pass
