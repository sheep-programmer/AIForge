# Skillforge 开发命令快捷方式

.PHONY: help install dev test lint fmt typecheck docker-build docker-up docker-down seed clean

help:  ## 显示本帮助
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install:  ## 安装服务端依赖（uv sync）
	cd server && uv sync --all-extras

dev:  ## 本地启动服务端（reload）
	cd server && uv run uvicorn skillforge.main:app --reload --host 127.0.0.1 --port 8765

test:  ## 跑 pytest
	cd server && uv run pytest -v

lint:  ## ruff check
	cd server && uv run ruff check src tests

fmt:  ## ruff format
	cd server && uv run ruff format src tests

typecheck:  ## mypy strict
	cd server && uv run mypy src

check: lint typecheck test  ## 全部本地检查

docker-build:  ## 构建 docker 镜像
	cd server && docker build -f docker/Dockerfile -t skillforge:latest .

docker-up:  ## 启动 docker-compose
	cd server && docker compose -f docker/docker-compose.yml up -d

docker-down:  ## 停止 docker-compose
	cd server && docker compose -f docker/docker-compose.yml down

seed:  ## 入库流行 skill 仓库
	./examples/seed-popular-skills.sh

clean:  ## 清理构建产物
	rm -rf server/dist server/build server/.mypy_cache server/.ruff_cache
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name '*.egg-info' -exec rm -rf {} + 2>/dev/null || true
