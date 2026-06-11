#!/usr/bin/env bash
# dev.sh — 一键起 server + web,Ctrl+C 干净退出
# 用法:bash scripts/dev.sh  (或在 package.json 里 "dev": "bash scripts/dev.sh")

set -e
cd "$(dirname "$0")/.."

# 端口占用检查 — 防止"端口被老 vite 占着,新 vite fallback 到 5181"导致的 HMR fullReload
check_port() {
  local port=$1
  local service=$2
  if ss -tln "( sport = :$port )" 2>/dev/null | grep -q ":$port "; then
    echo ""
    echo "[dev] 错误: 端口 $port 已被占用 ($service)"
    echo ""
    echo "[dev] 占用情况:"
    ss -tlnp 2>/dev/null | grep ":$port " | sed 's/^/    /'
    echo ""
    echo "[dev] 请先关闭占用的进程,再重新运行 dev.sh"
    echo "    找到 PID 后:  kill <pid>"
    echo "    一键清理:      pkill -9 -f 'node.*vite' ; pkill -9 -f 'tsx watch'"
    echo ""
    # 关掉 EXIT trap 再退出,这样我们的 exit 1 不会被 cleanup 覆盖成 0
    trap - EXIT
    exit 1
  fi
}

PIDS=()
cleanup() {
  echo ""
  echo "[dev] 收到退出信号,清理子进程..."
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      # 杀整个进程组(-$pid)以穿透 pnpm 包装
      kill -TERM "-$pid" 2>/dev/null || true
    fi
  done
  sleep 1
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill -KILL "-$pid" 2>/dev/null || true
    fi
  done
  # 兜底:任何残留的 tsx / vite / pnpm dev
  pkill -9 -f 'tsx watch' 2>/dev/null || true
  pkill -9 -f 'node.*vite' 2>/dev/null || true
  sleep 1
  echo "[dev] 已退出。"
  exit 0
}
trap cleanup INT TERM EXIT

# 后端
check_port 3000 "server"
echo "[dev] 启动 server (:3000) ..."
(cd packages/server && exec pnpm dev) &
PID_SERVER=$!
PIDS+=($PID_SERVER)
# 让 server 自己一个 process group,方便杀整组
kill -0 $PID_SERVER 2>/dev/null && true

# 等 server ready
echo "[dev] 等待 server 健康检查..."
for i in $(seq 1 30); do
  if curl -s -o /dev/null http://localhost:3000/healthz 2>/dev/null; then
    echo "[dev] server ✓"
    break
  fi
  sleep 1
done

# 前端
check_port 5180 "web (vite)"
echo "[dev] 启动 web (:5180) ..."
(cd packages/web && exec pnpm dev --host 0.0.0.0) &
PID_WEB=$!
PIDS+=($PID_WEB)

echo ""
echo "[dev] 全部就绪:"
echo "  - server: http://localhost:3000  (health: /healthz)"
echo "  - web:    http://localhost:5180"
echo "  - 客户登录: http://localhost:5180/login  (user1 / user12345)"
echo "  - 管理登录: http://localhost:5180/admin/login  (admin / change-me)"
echo ""
echo "Ctrl+C 干净退出。"
echo ""

# 阻塞直到任一子进程退出
wait -n "${PIDS[@]}"
echo "[dev] 一个子进程退出,正在关闭另一个..."
cleanup
