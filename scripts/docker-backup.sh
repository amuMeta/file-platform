#!/bin/bash
# docker-backup.sh - 备份当前 ./data
set -euo pipefail
cd "$(dirname "$0")/.."
ts=$(date +%F-%H%M%S)
out="${1:-$HOME/file-platform-data-$ts.tgz}"
tar czf "$out" -C . data
echo "备份完成: $out ($(du -sh "$out" | cut -f1))"
