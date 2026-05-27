"""向量编码器：把文本转为 384 维 float32 向量。

模型加载耗时（~3s）+ 占用 ~80MB，必须进程内单例。
"""

from __future__ import annotations

import threading

import numpy as np
import structlog

from aiforge.config import Settings, get_settings

logger = structlog.get_logger(__name__)


class Embedder:
    """sentence-transformers 的薄包装。

    设计上一个进程只持有一个实例，模型在 ``__init__`` 时同步加载，避免
    首次推荐请求触发冷启动。
    """

    def __init__(self, settings: Settings | None = None) -> None:
        from sentence_transformers import SentenceTransformer

        s = settings or get_settings()
        self._model_name = s.embedder_model
        self._dim = s.embedder_dim
        logger.info("embedder.loading", model=self._model_name)
        # device="cpu" 是默认；显式声明避免在无 GPU 的 VPS 上偶发 CUDA 探测
        self._model = SentenceTransformer(self._model_name, device="cpu")
        # 启动期跑一次 dummy 推理把 ONNX/torch 算子图编译热好
        self._model.encode(["warmup"], show_progress_bar=False)
        logger.info("embedder.ready", model=self._model_name, dim=self._dim)

    @property
    def dim(self) -> int:
        return self._dim

    def embed(self, text: str) -> np.ndarray:
        """单条文本 → (dim,) float32 向量，已 L2 归一化。"""
        vec = self._model.encode(
            text,
            normalize_embeddings=True,
            show_progress_bar=False,
            convert_to_numpy=True,
        )
        # sentence-transformers 在某些版本返回 float64，强制转 float32 与 sqlite-vss 对齐
        return np.asarray(vec, dtype=np.float32)

    def embed_batch(self, texts: list[str]) -> np.ndarray:
        """批量编码 → (n, dim) float32 矩阵。"""
        if not texts:
            return np.zeros((0, self._dim), dtype=np.float32)
        mat = self._model.encode(
            texts,
            normalize_embeddings=True,
            show_progress_bar=False,
            convert_to_numpy=True,
            batch_size=32,
        )
        return np.asarray(mat, dtype=np.float32)


# ---- 模块级单例 ----

_embedder: Embedder | None = None
_lock = threading.Lock()


def get_embedder(settings: Settings | None = None) -> Embedder:
    """惰性单例 —— 第一次调用时同步加载模型。"""
    global _embedder
    if _embedder is not None:
        return _embedder
    with _lock:
        if _embedder is None:
            _embedder = Embedder(settings)
    return _embedder


def reset_embedder() -> None:
    """测试钩子：清空单例（生产代码不应调用）。"""
    global _embedder
    with _lock:
        _embedder = None
