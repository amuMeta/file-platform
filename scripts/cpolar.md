# cpolar 隧道使用说明

## 公网 URL

| 协议 | 地址 |
|------|------|
| HTTPS | `https://hilo-files.vip.cpolar.cn` |
| HTTP | `http://hilo-files.vip.cpolar.cn` |

> 同事直接访问上述 URL 即可。
> **不要发到大群**——URL 公开等价，知道 URL 的人都能访问。

## 配置位置

`~/.cpolar/cpolar.yml` 中新增的隧道：

```yaml
  file-platform:
    addr: 5180
    proto: http
    subdomain: hilo-files
    region: cn_vip
```

> `subdomain: hilo-files` + `region: cn_vip` = 付费 VIP 特性，URL 永久不变。
> 免费版每次重启 URL 会变。

## 日常操作

### 查看当前隧道状态

```bash
# 看 file-platform 隧道是否在跑
ps -ef | grep "cpolar start file-platform" | grep -v grep

# 看 inspect UI（实时看到所有请求）
open http://127.0.0.1:4043/http/in   # macOS
xdg-open http://127.0.0.1:4043/http/in  # Linux
```

### 启动

```bash
nohup /home/hilo/.local/bin/cpolar start file-platform > /tmp/cpolar-file-platform.log 2>&1 &
```

启动后等 3-5 秒，访问 https://hilo-files.vip.cpolar.cn 验证。

### 停止

```bash
pkill -f "cpolar start file-platform"
```

### 重启

```bash
pkill -f "cpolar start file-platform"
sleep 1
nohup /home/hilo/.local/bin/cpolar start file-platform > /tmp/cpolar-file-platform.log 2>&1 &
```

### 一键脚本（可选）

```bash
cat > /home/hilo/scripts/cpolar-file-platform.sh <<'EOF'
#!/bin/bash
# cpolar file-platform 隧道管理
case "$1" in
  start)   nohup /home/hilo/.local/bin/cpolar start file-platform > /tmp/cpolar-file-platform.log 2>&1 & ;;
  stop)    pkill -f "cpolar start file-platform" ;;
  restart) pkill -f "cpolar start file-platform"; sleep 1
           nohup /home/hilo/.local/bin/cpolar start file-platform > /tmp/cpolar-file-platform.log 2>&1 & ;;
  status)  ps -ef | grep "cpolar start file-platform" | grep -v grep
           echo "---最近 20 条访问记录---"
           curl -sS http://127.0.0.1:4043/http/in 2>/dev/null | grep -oP 'PublicUrl":"[^"]+"' | head -1
           ;;
  *) echo "用法: $0 {start|stop|restart|status}" ;;
esac
EOF
chmod +x /home/hilo/scripts/cpolar-file-platform.sh
```

## 故障排查

### 同事访问报 403

Vite 的 DNS rebinding 防护。检查 `packages/web/vite.config.ts` 中 `server.allowedHosts` 是否包含 `.cpolar.cn`：

```ts
allowedHosts: [
  'localhost', '127.0.0.1', '192.168.1.157',
  '.cpolar.cn',
  '.cpolar.io',
],
```

修改后必须重启 Vite：

```bash
pkill -f "node.*vite"
nohup pnpm --filter web dev > /tmp/vite-web.log 2>&1 &
```

### 同事访问超时

```bash
# 1. cpolar 进程是否在跑
ps -ef | grep "cpolar start file-platform" | grep -v grep

# 2. cpolar inspect UI 是否能开
curl -sS http://127.0.0.1:4043/http/in | grep -oP 'PublicUrl":"[^"]+"'

# 3. 本机 5180 是否在监听
ss -tlnp | grep :5180

# 4. /api 是否可达
curl -sS https://hilo-files.vip.cpolar.cn/api/healthz
```

### cpolar 进程频繁掉线

参考已有的 `/home/hilo/cpolar-monitor.sh` 模式，写一个针对 file-platform 的 monitor：

```bash
#!/bin/bash
LOG=/tmp/cpolar-fp-monitor.log
CHECK="https://hilo-files.vip.cpolar.cn/api/healthz"
MAX=5
INT=60

log() { echo "[$(date '+%F %T')] $1" | tee -a $LOG; }
chk() { curl -s -o /dev/null -w "%{http_code}" --max-time 15 $CHECK; }
restart() {
  log "Tunnel down, restarting..."
  pkill -f "cpolar start file-platform" 2>/dev/null
  sleep 2
  nohup /home/hilo/.local/bin/cpolar start file-platform > /tmp/cpolar-file-platform.log 2>&1 &
  sleep 10
}

count=0
while true; do
  code=$(chk)
  if [ "$code" != "200" ]; then
    count=$((count+1))
    log "FAIL #$count: HTTP $code"
    [ $count -ge 1 ] && restart && count=0
  else
    count=0
  fi
  sleep $INT
done
```

## 升级路径

| 需求 | 方案 |
|------|------|
| 更稳定 / 自动保活 | 写 systemd service（参考 `cpolar-monitor.sh`） |
| 跨平台更通用 | Docker 部署 frp 到公网 VPS |
| 长期正式服务 | 用域名 + nginx + 自建后端 |
| 团队远程协作 | Tailscale / ZeroTier 组建虚拟局域网 |

## 备份

配置已备份：`~/.cpolar/cpolar.yml.bak.20260608`（实施前的版本）。
