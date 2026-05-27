"""SQLite 连接 + sqlite-vss 虚拟表初始化。

sqlite-vss 用 SQLite 扩展实现向量索引。我们把向量存到 `vss_skills` 虚拟表，
和 `skills` 主表通过 rowid 关联。
"""

from __future__ import annotations

import sqlite3
from typing import Any

import numpy as np
import sqlite_vss
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from aiforge.config import Settings, get_settings
from aiforge.core.models import Base


def pack_embedding(vec: np.ndarray) -> bytes:
    """打包 float32 向量为 sqlite-vss 期望的字节格式。"""
    if vec.dtype != np.float32:
        vec = vec.astype(np.float32)
    return vec.tobytes()


def unpack_embedding(blob: bytes, dim: int = 384) -> np.ndarray:
    """从字节解出向量。"""
    return np.frombuffer(blob, dtype=np.float32, count=dim)


def _load_vss_extension(dbapi_conn: sqlite3.Connection, _: Any) -> None:
    """SQLAlchemy connect 钩子：加载 sqlite-vss 扩展。"""
    dbapi_conn.enable_load_extension(True)
    sqlite_vss.load(dbapi_conn)
    dbapi_conn.enable_load_extension(False)


_engine: Engine | None = None
_session_maker: sessionmaker[Session] | None = None


def get_engine(settings: Settings | None = None) -> Engine:
    """获取（或惰性创建）SQLAlchemy engine。"""
    global _engine
    if _engine is not None:
        return _engine

    s = settings or get_settings()
    db_url = f"sqlite:///{s.db_path}"
    _engine = create_engine(
        db_url,
        future=True,
        connect_args={"check_same_thread": False},
    )
    event.listen(_engine, "connect", _load_vss_extension)
    return _engine


def get_session_maker(settings: Settings | None = None) -> sessionmaker[Session]:
    global _session_maker
    if _session_maker is None:
        _session_maker = sessionmaker(bind=get_engine(settings), expire_on_commit=False)
    return _session_maker


def init_db(settings: Settings | None = None) -> None:
    """建表，并创建 sqlite-vss 虚拟表。幂等。"""
    s = settings or get_settings()
    engine = get_engine(s)

    Base.metadata.create_all(engine)

    with engine.connect() as conn:
        raw = conn.connection
        cur = raw.cursor()
        # 创建向量虚拟表；列名 embedding，维度由 settings 决定
        cur.execute(
            f"""
            CREATE VIRTUAL TABLE IF NOT EXISTS vss_skills USING vss0(
                embedding({s.embedder_dim})
            );
            """
        )
        raw.commit()


def upsert_embedding(session: Session, skill_rowid: int, vec: np.ndarray) -> None:
    """把向量写入 vss_skills 虚拟表（按 rowid 对齐 skills 表）。

    sqlite-vss 虚拟表不支持 ``INSERT OR REPLACE`` —— 必须先 DELETE 再 INSERT。
    """
    blob = pack_embedding(vec)
    session.execute(
        sqlite_vss_text("DELETE FROM vss_skills WHERE rowid = :rowid"),
        {"rowid": skill_rowid},
    )
    session.execute(
        sqlite_vss_text("INSERT INTO vss_skills(rowid, embedding) VALUES (:rowid, :emb)"),
        {"rowid": skill_rowid, "emb": blob},
    )


def vss_search(session: Session, query_vec: np.ndarray, top_k: int) -> list[tuple[int, float]]:
    """向量检索。返回 [(rowid, distance), ...]，距离越小越相似。

    必须用 ``vss_search_params(emb, k)`` 包装，否则底层 FAISS 抛
    "k > 0" 断言并 SIGABRT（sqlite-vss 0.1.x 兼容性要求）。

    **空索引保护**：FAISS 在 0 向量索引上做 k-NN 也会 SIGABRT，所以这里先 count。
    """
    if top_k <= 0:
        return []

    # 先 count；virtual table 的 COUNT(*) 是 O(1) 元数据
    count_row = session.execute(sqlite_vss_text("SELECT count(*) FROM vss_skills")).first()
    if not count_row or int(count_row[0]) == 0:
        return []

    effective_k = min(top_k, int(count_row[0]))
    blob = pack_embedding(query_vec)
    rows = session.execute(
        sqlite_vss_text(
            """
            SELECT rowid, distance
            FROM vss_skills
            WHERE vss_search(embedding, vss_search_params(:emb, :k))
            """
        ),
        {"emb": blob, "k": effective_k},
    ).all()
    return [(int(r[0]), float(r[1])) for r in rows]


# 局部导入，避免 SQLAlchemy 2.x 弃用警告
def sqlite_vss_text(s: str) -> Any:
    from sqlalchemy import text

    return text(s)
