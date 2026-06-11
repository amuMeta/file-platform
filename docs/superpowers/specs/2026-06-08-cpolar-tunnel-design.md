# cpolar 隧道暴露 file-platform dev 服务 — 设计文档

**日期**: 2026-06-08
**状态**: ✅ 已实施并端到端验证
**作者**: hilo + opencode

## 背景与问题

### 现象
- 本机 `192.168.1.157:5180`（Vite dev server）在监听，本机 curl 自测 HTTP 200
- 同事（同公司、可能同 WiFi）无法访问
- 其他公司同事更无法访问（公网不可达）

### 排查结论
| 原因 | 结论 |
|------|------|
| 防火墙拦截 | ✗ 本机 iptables/ufw/firewalld/nft 全部空/未启用 |
| 服务未对外监听 | ✗ Vite 监听 `0.0.0.0:5180` |
| 端口被占用 | ✗ curl 自测 HTTP 200 |
| **公司网络 GFW 屏蔽 Cloudflare Tunnel** | ✓ `trycloudflare.com` DNS 解析到非 Cloudflare IP，隧道端点连接超时 |
| 同事不在同子网 / AP 隔离 | 推测并存（80% 概率） |

**核心阻碍**: 公司网络白名单了 cloudflare.com 主站但屏蔽了 Tunnel 端点、DNS 污染了 trycloudflare.com，使 **Cloudflare Tunnel 不可行**。

## 设计目标

让本机的 Vite dev server（`localhost:5180`）通过国内可达的内网穿透服务，对外暴露为**稳定的固定公网 URL**。

### 非目标
- 不替代正式部署（生产应走 nginx + 域名 + 云服务器）
- 不做高可用 / 负载均衡
- 不暴露后端 3000 端口（Vite 的 `/api` proxy 已统一代理）

## 方案选型

| 方案 | 国内网络 | 部署成本 | URL 稳定性 | 推荐度 |
|------|---------|---------|-----------|--------|
| Cloudflare Tunnel | ✗ 端点被屏蔽 | 低 | 稳定 | ❌ 不可行 |
| **cpolar**（国内版内网穿透）| ✓ 已确认 | 零（已装、有账号）| 稳定（VIP）| ✅ 已采用 |
| Tailscale | ✓ 端到端 | 中（需装客户端）| 稳定 | 备选 |
| frp + 公网 VPS | ✓ 自建 | 高（需 VPS）| 自控 | 后续 |

### cpolar 优势
- 已安装 `~/.local/bin/cpolar` v3.2.62
- 已有付费 VIP 账号（`region: cn_vip` 固定 subdomain）
- 已有两条在跑隧道（`dify` / `weknora`）
- 有现成的 monitor 脚本 `/home/hilo/cpolar-monitor.sh` 可参考

## 架构

```
┌─────────────────────────────────┐
│  同事浏览器 (https)             │
└────────────┬────────────────────┘
             ↓ DNS 解析 (cpolar 维护)
        hilo-files.vip.cpolar.cn
             ↓ HTTPS (cpolar 云端)
┌────────────┴────────────────────┐
│  cpolar 边缘节点 (国内 vip)     │
└────────────┬────────────────────┘
             ↓ cpolar 隧道 (出站 QUIC/HTTPS, 443)
┌────────────┴────────────────────┐
│  本机 cpolar 进程               │
│  /home/hilo/.local/bin/cpolar   │
│  start file-platform            │
│  PID 2951206                    │
│  inspect: 127.0.0.1:4043        │
└────────────┬────────────────────┘
             ↓ localhost
┌────────────┴────────────────────┐
│  Vite dev server                │
│  0.0.0.0:5180                   │
│  PID 2957306                    │
│  allowedHosts: .cpolar.cn  ✓   │
└────────────┬────────────────────┘
             ↓ /api proxy
┌────────────┴────────────────────┐
│  Fastify backend                │
│  localhost:3000                 │
│  PID 645490 (tsx watch)         │
└─────────────────────────────────┘
```

## 实施步骤

| # | 步骤 | 命令 | 结果 |
|---|------|------|------|
| 1 | 探测环境 | `uname -m`, `ss -tlnp`, `ps` | cloudflared npm 包假货；cpolar 已装 v3.2.62 |
| 2 | 验证 Cloudflare 端点 | `curl api.trycloudflare.com` | DNS 解析到 `221.228.32.13`（非 Cloudflare IP）→ Tunnel 不可行 |
| 3 | 备份 cpolar 配置 | `cp ~/.cpolar/cpolar.yml ~/.cpolar/cpolar.yml.bak.20260608` | 备份完成 |
| 4 | 编辑配置加新隧道 | 在 `~/.cpolar/cpolar.yml` 加 `file-platform` 块 | 写入 `subdomain: hilo-files, region: cn_vip, addr: 5180` |
| 5 | 启动隧道 | `nohup cpolar start file-platform &` | PID 2951206，3 秒后 inspect UI 返回公网 URL |
| 6 | 端到端测试 1 | `curl https://hilo-files.vip.cpolar.cn/` | HTTP 403 + 提示加 allowedHosts |
| 7 | 修复 Vite allowedHosts | 编辑 `vite.config.ts` 加 `.cpolar.cn` / `.cpolar.io` | 配置生效 |
| 8 | 重启 Vite | `pkill vite && nohup pnpm --filter web dev &` | 新 PID 2957306 |
| 9 | 端到端测试 2 | `curl https://hilo-files.vip.cpolar.cn/api/healthz` | HTTP 200，`{"code":0,"data":{"status":"ok"}}` ✓ |

## 关键修改

### 1. `~/.cpolar/cpolar.yml`
```yaml
tunnels:
  # ... 原有 dify, weknora 略 ...
  file-platform:
    addr: 5180
    proto: http
    subdomain: hilo-files
    region: cn_vip
```

### 2. `packages/web/vite.config.ts`
新增 `allowedHosts` 字段（Vite 5+ 默认开启 DNS rebinding 防护）：

```ts
server: {
  host: true,
  port: 5180,
  strictPort: true,
  allowedHosts: [
    'localhost',
    '127.0.0.1',
    '192.168.1.157',
    '.cpolar.cn',
    '.cpolar.io',
  ],
  // ... hmr, proxy 略
}
```

## 验证结果

| 测试 | URL | HTTP | 响应时间 |
|------|-----|------|---------|
| HTTPS 根路径 | `https://hilo-files.vip.cpolar.cn/` | **200** | 176ms |
| HTTP 根路径 | `http://hilo-files.vip.cpolar.cn/` | **200** | 81ms |
| API 健康检查 | `https://hilo-files.vip.cpolar.cn/api/healthz` | **200** | 94ms |
| 响应体确认 | `<title>文件分发平台 · File Platform</title>` | ✓ | 859 字节 |

## 风险与缓解

| 风险 | 概率 | 缓解 |
|------|------|------|
| cpolar VIP 到期（subdomain 失效）| 中 | monitor 脚本监控 + 告警；降级用 Tailscale |
| 同事泄露 URL 给外人 | 中 | 文档明示"不要发大群"；可加 `httpauth` 鉴权 |
| cpolar 进程意外退出 | 低 | 后续加 systemd 或 monitor 自动重启 |
| Vite 改 host 配置导致同事无法访问 | 低 | 单元测试加 URL 白名单断言 |

## 后续升级路径

1. **本周**: 把 `scripts/cpolar.md` 中的可选一键脚本和 monitor 部署上
2. **下周**: 改用 Docker 部署 frp 到公网 VPS（用户自述计划）
3. **长期**: 正式部署到云服务器（nginx + 域名 + HTTPS）

## 相关文件

- 备份: `~/.cpolar/cpolar.yml.bak.20260608`
- 配置: `~/.cpolar/cpolar.yml`
- Vite 配置: `packages/web/vite.config.ts`
- 使用说明: `scripts/cpolar.md`
- 参考 monitor: `/home/hilo/cpolar-monitor.sh`
