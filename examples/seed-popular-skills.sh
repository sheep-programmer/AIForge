#!/usr/bin/env bash
# 批量入库主流公开 skill 仓库
#
# 用法：
#   ./examples/seed-popular-skills.sh
#   ./examples/seed-popular-skills.sh --server http://my-vps:8765
#   AIFORGE_API_KEY=xxx ./examples/seed-popular-skills.sh
#
# 退出码：
#   0 全部成功
#   1 至少一个仓库入库失败
set -euo pipefail

SERVER="${AIFORGE_SERVER:-http://127.0.0.1:8765}"
API_KEY="${AIFORGE_API_KEY:-}"

# 允许 --server URL 覆盖
while [[ $# -gt 0 ]]; do
  case "$1" in
    --server) SERVER="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *) echo "未知参数：$1" >&2; exit 2 ;;
  esac
done

# 流行的公开 skill 仓库
REPOS=(
  "https://github.com/obra/superpowers-skills"
  "https://github.com/anthropics/skills"
  "https://github.com/pbakaus/impeccable"
  "https://github.com/garrytan/gstack"
  "https://github.com/lijigang/ljg-skills"
  "https://github.com/vercel-labs/skills"
  "https://github.com/affaan-m/everything-claude-code"
)

# ---- 工具 ----
auth_header=()
if [[ -n "$API_KEY" ]]; then
  auth_header=(-H "Authorization: Bearer $API_KEY")
fi

post_ingest() {
  local url="$1"
  curl -sS -X POST "$SERVER/v1/ingest" \
    "${auth_header[@]}" \
    -H 'Content-Type: application/json' \
    -d "{\"github_url\": \"$url\"}"
}

get_job() {
  local id="$1"
  curl -sS "$SERVER/v1/ingest/$id" "${auth_header[@]}"
}

# ---- 健康检查 ----
echo ">> 检查服务端：$SERVER"
if ! curl -fsS "$SERVER/v1/health" >/dev/null; then
  echo "!! 服务端 $SERVER 不可达。请先启动：" >&2
  echo "     docker compose -f server/docker/docker-compose.yml up -d" >&2
  exit 1
fi

# ---- 入库 ----
failed=0
declare -a JOB_IDS
declare -a JOB_URLS

for url in "${REPOS[@]}"; do
  echo
  echo ">> 入库 $url"
  resp=$(post_ingest "$url" || true)
  if [[ -z "$resp" ]]; then
    echo "   !! 请求失败" >&2
    failed=1
    continue
  fi

  job_id=$(printf '%s' "$resp" | sed -n 's/.*"job_id":[[:space:]]*"\([^"]*\)".*/\1/p')
  if [[ -z "$job_id" ]]; then
    echo "   !! 解析 job_id 失败：$resp" >&2
    failed=1
    continue
  fi

  echo "   job_id=$job_id"
  JOB_IDS+=("$job_id")
  JOB_URLS+=("$url")
done

# ---- 等待完成 ----
echo
echo ">> 等待入库任务完成（最长 10 分钟）..."
deadline=$(( $(date +%s) + 600 ))

for i in "${!JOB_IDS[@]}"; do
  id="${JOB_IDS[$i]}"
  url="${JOB_URLS[$i]}"
  while :; do
    if [[ $(date +%s) -gt $deadline ]]; then
      echo "   !! 超时：$id ($url)" >&2
      failed=1
      break
    fi
    status_json=$(get_job "$id" || true)
    status=$(printf '%s' "$status_json" | sed -n 's/.*"status":[[:space:]]*"\([^"]*\)".*/\1/p')
    case "$status" in
      done)
        added=$(printf '%s' "$status_json" | sed -n 's/.*"skills_added":[[:space:]]*\([0-9]*\).*/\1/p')
        echo "   ok  $url  (+$added)"
        break
        ;;
      error)
        err=$(printf '%s' "$status_json" | sed -n 's/.*"error":[[:space:]]*"\([^"]*\)".*/\1/p')
        echo "   !! $url 失败：$err" >&2
        failed=1
        break
        ;;
      *)
        sleep 3
        ;;
    esac
  done
done

# ---- 总结 ----
echo
total=$(curl -sS "$SERVER/v1/health" | sed -n 's/.*"skills_count":[[:space:]]*\([0-9]*\).*/\1/p')
echo ">> 完成。库中现有 skill：$total"

if [[ $failed -eq 0 ]]; then
  exit 0
else
  echo "!! 部分仓库失败，详见上方日志" >&2
  exit 1
fi
