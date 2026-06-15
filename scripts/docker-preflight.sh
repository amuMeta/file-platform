#!/bin/bash
# docker-preflight.sh - 主机侧预检,在 docker compose up 之前必须跑一次
# 作用:
#   1) 停掉所有会用 DB 的 dev 进程
#   2) 收 WAL
#   3) 修正文件所有者
#   4) 全量备份
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

echo "=== [preflight] 工作目录: $ROOT ==="

# 1) 停 dev
echo "[preflight] 停 dev 进程..."
pkill -f 'tsx watch'           2>/dev/null || true
pkill -f 'node.*vite'          2>/dev/null || true
pkill -f 'pnpm.*dev:server'    2>/dev/null || true
pkill -f 'pnpm.*dev:web'       2>/dev/null || true
sleep 2

# 2) DB 残留检测
if command -v fuser >/dev/null 2>&1; then
    if fuser "$ROOT/data/app.db" 2>/dev/null; then
        echo "[preflight] FATAL: app.db 仍被进程占用:" >&2
        fuser -v "$ROOT/data/app.db" 2>&1 | sed 's/^/    /' >&2
        echo "[preflight] 手动排查后重跑本脚本" >&2
        exit 1
    fi
fi

# 3) WAL 收口
if [ -f "$ROOT/data/app.db" ]; then
    if command -v sqlite3 >/dev/null 2>&1; then
        if [ -f "$ROOT/data/app.db-wal" ]; then
            echo "[preflight] 收 WAL..."
            sqlite3 "$ROOT/data/app.db" 'PRAGMA wal_checkpoint(TRUNCATE);'
        fi
        echo "[preflight] DB 行数速览:"
        for t in user category file download_log audit_log; do
            cnt=$(sqlite3 "$ROOT/data/app.db" "SELECT count(*) FROM $t;" 2>/dev/null || echo "?")
            echo "    $t = $cnt"
        done
    else
        echo "[preflight] WARN: 主机无 sqlite3,跳过 WAL 收口(容器内 entrypoint 会再收一次)"
    fi
fi

# 4) 修正所有者(防御)
if [ -d "$ROOT/data" ]; then
    cur_owner=$(stat -c '%U:%G' "$ROOT/data")
    if [ "$cur_owner" != "hilo:hilo" ] && [ "$cur_owner" != "1000:1000" ]; then
        echo "[preflight] data/ 当前所有者 $cur_owner,改为 1000:1000(需 sudo)"
        sudo chown -R 1000:1000 "$ROOT/data"
    fi
    chmod -R u+rwX,g+rX "$ROOT/data" 2>/dev/null || true
fi

# 5) 备份
ts=$(date +%F-%H%M%S)
backup="$HOME/file-platform-data-$ts.tgz"
echo "[preflight] 备份 → $backup"
tar czf "$backup" -C "$ROOT" data
echo "[preflight] 备份大小: $(du -sh "$backup" | cut -f1)"

echo ""
echo "=== [preflight] OK,可以执行 docker compose up -d ==="
echo ""
echo "    cp .env.docker.example .env  # 首次部署时"
echo "    docker compose build"
echo "    docker compose up -d"
