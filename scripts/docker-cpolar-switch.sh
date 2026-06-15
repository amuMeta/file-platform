#!/bin/bash
# docker-cpolar-switch.sh - docker 化后,切换 cpolar 指向
# 原 dev 时期 cpolar addr=5180(Vite),切到 docker 后改为 80(nginx 容器)
set -euo pipefail

CF="$HOME/.cpolar/cpolar.yml"
TUNNEL="file-platform"
NEW_ADDR=80

if [ ! -f "$CF" ]; then
    echo "找不到 $CF" >&2
    exit 1
fi

# 备份
cp "$CF" "$CF.bak.$(date +%F-%H%M%S)"

# 改 addr(只改 file-platform 块)
python3 - "$CF" "$TUNNEL" "$NEW_ADDR" <<'PY'
import sys, re
path, tunnel, new_addr = sys.argv[1], sys.argv[2], sys.argv[3]
src = open(path).read()
# 找到 tunnel 块(name 缩进 2 空格,属性缩进 4 空格)并替换其下的 addr
pattern = re.compile(
    r'(^  ' + re.escape(tunnel) + r':\n)((?:    [^\n]*\n)*)',
    re.MULTILINE
)
m = pattern.search(src)
if not m:
    print(f"WARN: 未在 {path} 中找到 {tunnel} 块,未修改", file=sys.stderr)
    sys.exit(0)
new_block = re.sub(r'    addr: \d+', f'    addr: {new_addr}', m.group(2))
new = src[:m.start()] + m.group(1) + new_block + src[m.end():]
open(path, 'w').write(new)
print(f"已修改 {tunnel} 的 addr 为 {new_addr}")
PY

# 重启隧道
pkill -f "cpolar start $TUNNEL" 2>/dev/null || true
sleep 1
nohup /home/hilo/.local/bin/cpolar start "$TUNNEL" > /tmp/cpolar-$TUNNEL.log 2>&1 &
echo "cpolar 已重启,日志: /tmp/cpolar-$TUNNEL.log"
echo "公网 URL: https://hilo-files.vip.cpolar.cn/"
echo "等 5 秒后验证: curl -i https://hilo-files.vip.cpolar.cn/api/healthz"
