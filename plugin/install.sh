#!/usr/bin/env bash
# AIForge 插件安装脚本。
#
# 用法:
#   ./install.sh [--server <url>] [--dev]
#
# --server <url>   指定服务端地址，默认 http://localhost:8765
# --dev            以 symlink 方式安装（修改源码立即生效）；默认是 copy
set -euo pipefail

SERVER_URL="http://localhost:8765"
DEV_MODE="0"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --server)
      [[ $# -ge 2 ]] || { echo "错误：--server 缺少参数" >&2; exit 2; }
      SERVER_URL="$2"
      shift 2
      ;;
    --server=*)
      SERVER_URL="${1#--server=}"
      shift
      ;;
    --dev)
      DEV_MODE="1"
      shift
      ;;
    -h|--help)
      sed -n '2,10p' "$0"
      exit 0
      ;;
    *)
      echo "未知参数：$1" >&2
      exit 2
      ;;
  esac
done

PLUGIN_SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DEST="${HOME}/.claude/plugins/aiforge"
CONFIG_DIR="${HOME}/.config/aiforge"
CONFIG_FILE="${CONFIG_DIR}/config.toml"

echo "AIForge 插件安装"
echo "  源目录:   ${PLUGIN_SRC}"
echo "  目标:     ${PLUGIN_DEST}"
echo "  服务端:   ${SERVER_URL}"
echo "  模式:     $([[ "${DEV_MODE}" == "1" ]] && echo "symlink (dev)" || echo "copy")"
echo

# 1. 检查 python3 (>= 3.11，因为用了 tomllib)
if ! command -v python3 >/dev/null 2>&1; then
  echo "错误：找不到 python3。请安装 Python 3.11+ 后重试。" >&2
  exit 1
fi

PY_VER="$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
PY_MAJOR="${PY_VER%.*}"
PY_MINOR="${PY_VER#*.}"
if [[ "${PY_MAJOR}" -lt 3 ]] || { [[ "${PY_MAJOR}" -eq 3 ]] && [[ "${PY_MINOR}" -lt 11 ]]; }; then
  echo "错误：检测到 Python ${PY_VER}，但需要 3.11+ (依赖 tomllib)。" >&2
  echo "提示：设置环境变量 AIFORGE_PYTHON 指向更新的 python 可执行文件。" >&2
  exit 1
fi
echo "✓ python3 ${PY_VER}"

# 2. 把插件装到 ~/.claude/plugins/aiforge
mkdir -p "$(dirname "${PLUGIN_DEST}")"

# 已经存在的旧安装：先移除（symlink 直接删；目录 rm -rf）
if [[ -L "${PLUGIN_DEST}" ]]; then
  rm "${PLUGIN_DEST}"
elif [[ -e "${PLUGIN_DEST}" ]]; then
  rm -rf "${PLUGIN_DEST}"
fi

if [[ "${DEV_MODE}" == "1" ]]; then
  ln -s "${PLUGIN_SRC}" "${PLUGIN_DEST}"
  echo "✓ symlink: ${PLUGIN_SRC} -> ${PLUGIN_DEST}"
else
  cp -R "${PLUGIN_SRC}" "${PLUGIN_DEST}"
  echo "✓ 已复制插件到 ${PLUGIN_DEST}"
fi

# 3. 确保 hook 脚本可执行
chmod +x "${PLUGIN_DEST}/hooks/on-user-prompt" 2>/dev/null || true

# 4. 写配置
mkdir -p "${CONFIG_DIR}"

# 简易 upsert：保留用户已修改的其他字段，更新 server_url
if [[ -f "${CONFIG_FILE}" ]]; then
  if grep -q '^server_url\s*=' "${CONFIG_FILE}"; then
    # 用 python 安全替换，避免 sed 的转义陷阱
    python3 - "$CONFIG_FILE" "$SERVER_URL" <<'PY'
import re, sys, pathlib
path = pathlib.Path(sys.argv[1])
url = sys.argv[2]
text = path.read_text(encoding="utf-8")
text = re.sub(r'(?m)^server_url\s*=.*$', f'server_url = "{url}"', text)
path.write_text(text, encoding="utf-8")
PY
    echo "✓ 已更新 ${CONFIG_FILE} 中的 server_url"
  else
    printf '\nserver_url = "%s"\n' "${SERVER_URL}" >> "${CONFIG_FILE}"
    echo "✓ 已追加 server_url 到 ${CONFIG_FILE}"
  fi
else
  cat > "${CONFIG_FILE}" <<EOF
# AIForge 插件配置。任何字段都可以删除以恢复默认值。
server_url = "${SERVER_URL}"
top_k = 3
max_tokens = 4000
enabled = true
fallback_warn_once = true
timeout_ms = 250
EOF
  echo "✓ 已创建 ${CONFIG_FILE}"
fi

echo
echo "安装完成。下一步："
echo "  1. 确认 AIForge 服务端在 ${SERVER_URL} 上运行。"
echo "  2. 重启 Claude Code（让它发现新插件）。"
echo "  3. 在 Claude Code 里执行 /aiforge:status 检查连通性。"
echo "  4. 可选：/aiforge:sync 把服务端 skill 拉到本地缓存，备兜底之需。"
