#!/bin/bash
# docker-restore.sh - 从 tar 恢复 ./data(危险操作,会覆盖当前 data)
set -euo pipefail
cd "$(dirname "$0")/.."
backup="${1:?用法: $0 <backup.tgz>}"
[ -f "$backup" ] || { echo "找不到备份: $backup" >&2; exit 1; }

if [ -d data ] && [ -n "$(ls -A data 2>/dev/null | grep -v '^\.gitkeep$')" ]; then
    echo "data/ 目录非空,继续将覆盖现有数据"
    read -p "确认从 $backup 恢复?(y/N) " ans
    [ "$ans" = "y" ] || { echo "已取消"; exit 1; }
fi

tar xzf "$backup" -C .
echo "恢复完成: $backup → ./data"
echo "注意:docker 容器如在跑需重启以重读 DB"
