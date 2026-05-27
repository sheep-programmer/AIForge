# syntax=docker/dockerfile:1.7
#
# Skillforge 服务端 —— 多阶段构建
# Stage 1: uv 把依赖装到隔离的 venv
# Stage 2: 最小运行时镜像，预下载 sentence-transformers 权重
#
# 构建：
#   docker build -f server/docker/Dockerfile -t skillforge:dev server
# 运行：
#   docker run --rm -p 8765:8765 -v $(pwd)/data:/app/data skillforge:dev

# -----------------------------------------------------------------------------
# Stage 1 —— builder
# -----------------------------------------------------------------------------
FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_COMPILE_BYTECODE=1

# 安装 uv（官方静态二进制，比 pip 快 10×）
COPY --from=ghcr.io/astral-sh/uv:0.5.11 /uv /uvx /usr/local/bin/

# 构建期需要的系统依赖（sqlite-vss 拉 wheel，但 numpy/scikit-learn 偶尔回退到源码）
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# 只先复制依赖清单，最大化层缓存
COPY pyproject.toml ./
COPY README.md ../README.md
# README 在父目录被 pyproject 引用；用 . 仓库根作为 build context 时这一行可去掉

# 创建 venv 并安装依赖（不装项目本身，那是下一步）
RUN --mount=type=cache,target=/root/.cache/uv \
    uv venv /opt/venv \
    && VIRTUAL_ENV=/opt/venv uv pip install --python /opt/venv/bin/python \
        fastapi>=0.115 \
        "uvicorn[standard]>=0.32" \
        pydantic>=2.10 \
        pydantic-settings>=2.7 \
        sqlalchemy>=2.0 \
        aiosqlite>=0.20 \
        sqlite-vss>=0.1.2 \
        sentence-transformers>=3.3 \
        numpy>=2.0 \
        httpx>=0.28 \
        python-frontmatter>=1.1 \
        pygithub>=2.5 \
        structlog>=24.4 \
        ulid-py>=1.1 \
        rank-bm25>=0.2.2 \
        scikit-learn>=1.6 \
        anthropic>=0.40

# 复制源码并安装项目（editable=False，生产模式）
COPY src ./src
RUN --mount=type=cache,target=/root/.cache/uv \
    VIRTUAL_ENV=/opt/venv uv pip install --python /opt/venv/bin/python --no-deps .

# -----------------------------------------------------------------------------
# Stage 2 —— runtime
# -----------------------------------------------------------------------------
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH" \
    VIRTUAL_ENV=/opt/venv \
    HF_HOME=/opt/hf-cache \
    SENTENCE_TRANSFORMERS_HOME=/opt/hf-cache \
    SKILLFORGE_HOST=0.0.0.0 \
    SKILLFORGE_PORT=8765 \
    SKILLFORGE_DB_PATH=/app/data/skillforge.db \
    SKILLFORGE_EMBEDDER_MODEL=sentence-transformers/all-MiniLM-L6-v2 \
    SKILLFORGE_LOG_FORMAT=json

# 运行时只需要 curl（healthcheck）和 ca-certificates（HTTPS 出站）
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        curl \
        ca-certificates \
        libgomp1 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --shell /bin/bash --uid 1000 skillforge

# 复制 venv
COPY --from=builder /opt/venv /opt/venv

# 预下载 all-MiniLM-L6-v2 权重（~90MB），让冷启动 < 3s
# 注意：这一步让镜像变大，但生产部署省下首次启动的下载等待
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2', cache_folder='/opt/hf-cache')" \
    && chown -R skillforge:skillforge /opt/hf-cache

WORKDIR /app
RUN mkdir -p /app/data && chown -R skillforge:skillforge /app

USER skillforge

EXPOSE 8765

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8765/v1/health || exit 1

ENTRYPOINT ["uvicorn", "skillforge.main:app", "--host", "0.0.0.0", "--port", "8765"]
