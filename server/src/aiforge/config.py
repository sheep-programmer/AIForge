"""全局配置：从环境变量加载，单例使用。"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """AIForge 服务端配置。所有变量带 AIFORGE_ 前缀。"""

    model_config = SettingsConfigDict(
        env_prefix="AIFORGE_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # 网络
    host: str = "127.0.0.1"
    port: int = 8765

    # 数据
    db_path: Path = Path("./data/aiforge.db")

    # 向量编码
    embedder_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    embedder_dim: int = 384

    # 重排器
    reranker: Literal["ollama", "haiku", "none"] = "ollama"
    reranker_model: str = "qwen2.5:1.5b"
    ollama_host: str = "http://localhost:11434"
    anthropic_api_key: str | None = None

    # 推荐参数
    top_k_default: int = 3
    retrieve_k: int = 30
    max_tokens_default: int = 4000

    # 鉴权
    api_key: str | None = None

    # GitHub
    github_token: str | None = None

    # 远程发现
    enable_remote_finder: bool = False
    finder_interval_seconds: int = 86400  # 1 天

    # 日志
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    log_format: Literal["json", "console"] = "json"

    @field_validator("db_path")
    @classmethod
    def _ensure_parent_dir(cls, v: Path) -> Path:
        v = Path(v).resolve()
        v.parent.mkdir(parents=True, exist_ok=True)
        return v

    @property
    def requires_auth(self) -> bool:
        return self.api_key is not None


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """返回全局 Settings 单例。"""
    return Settings()
