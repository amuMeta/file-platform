#!/bin/sh
# docker-entrypoint.sh - file-platform node 容器入口
# 职责:
#   1) DB 文件占用自检(防 dev 进程没关干净)
#   2) WAL checkpoint(收口未提交事务)
#   3) seed admin(idempotent)
#   4) exec CMD(SIGTERM 由 index.ts 的 handler 优雅处理)
set -e

echo "[entrypoint] uid=$(id -u) gid=$(id -g) data=$(ls -ld /app/data 2>/dev/null | awk '{print $3":"$4}')"

# 1) DB 占用探测
if command -v fuser >/dev/null 2>&1; then
    if fuser -s /app/data/app.db 2>/dev/null; then
        echo "[entrypoint] FATAL: /app/data/app.db is locked by another process. Refusing to start." >&2
        echo "[entrypoint] 在主机上执行: pkill -f 'tsx watch'; pkill -f 'node.*vite'" >&2
        exit 1
    fi
fi

# 2) WAL checkpoint(防御性,即使 dev 进程关过,容器启动时再收一次)
if [ -f /app/data/app.db ] && [ -f /app/data/app.db-wal ]; then
    echo "[entrypoint] checkpointing WAL..."
    node -e "
        const Database = require('better-sqlite3');
        const db = new Database('/app/data/app.db');
        db.pragma('journal_mode = WAL');
        db.pragma('wal_checkpoint(TRUNCATE)');
        db.close();
    " || echo "[entrypoint] WARN: WAL checkpoint failed, continuing anyway"
fi

# 3) seed
echo "[entrypoint] running seed (idempotent)..."
node packages/server/dist/scripts/seed.js

# 4) exec CMD(SIGTERM 由此后运行的 node 进程自行处理)
echo "[entrypoint] starting: $@"
exec "$@"
