# 局域网访问失败 — 原因分析与修复计划

## 现象

在开发机本机 `http://localhost:5180` 可以正常打开前端页面,但同网段内
**其他电脑** 在浏览器里访问 `http://192.168.1.157:5181/` 失败。

(从最近一次系统抓取可知:开发机的 LAN IP 是 `192.168.1.157`,实际 dev server
占用的端口是 `5181` — 这是因为 `vite.config.ts` 配了 `strictPort: false`,
启动时 5180 被占用,自动顺延到 5181。)

## 一、根本原因(按可能性排序)

| # | 原因 | 现象 | 是否已确认 |
| --- | --- | --- | --- |
| 1 | **dev server 没在跑 / 端口变了** | 连接被拒 (ERR_CONNECTION_REFUSED) | 待查 |
| 2 | **开发机系统防火墙阻止入站 5181** | 连接超时 (ERR_CONNECTION_TIMED_OUT) | 待查 |
| 3 | **路由器启用了 AP 隔离 / 客户端隔离** | 同 Wi-Fi 互相 ping 不通 | 待查 |
| 4 | **开发机 IP 变了 (DHCP 续约)** | 旧 IP 不可达,新 IP 没人知道 | 待查 |
| 5 | **Vite `host: true` 在某些 Node 版本只 bind IPv6 ::1**,LAN 客户端用 IPv4 找不到 | 仅 ::1 监听,0.0.0.0 没生效 | 待查 |
| 6 | **Vite 自动顺延后端口不再是 5180/5181** | 用户记忆的端口错 | 待查 |

> **关键代码事实**(来自 [vite.config.ts](file:///home/hilo/桌面/file-platform/packages/web/vite.config.ts)):
> - `server.host: true` → Vite 应该监听 0.0.0.0(已配,**对 LAN 是对的**)
> - `server.port: 5180` + `strictPort: false` → 端口被占时自动 +1,出现 5181/5182...
> - `server.hmr.host: '192.168.1.157'` → HMR websocket 走 LAN IP(已配)
> - `server.proxy['/api']` 目标 `http://localhost:3000` → 代理跑在开发机内,转发到本机后端,LAN 客户端不需要直连后端
> - 后端 [index.ts:7](file:///home/hilo/桌面/file-platform/packages/server/src/index.ts#L7) 也已 `host: '0.0.0.0'`,所以即使 LAN 客户端绕过 Vite 直接访问 `:3000/api` 也能通
> - [http.ts:10](file:///home/hilo/桌面/file-platform/packages/web/src/api/http.ts#L10) 的 axios `baseURL` 走 `'/api'` 相对路径,经 Vite 代理,**不会写死 localhost**,所以 LAN 客户端拿到的页面 JS 调 `/api/...` 会被同源 Vite 接住并转发到本机 3000

→ **代码层面已经为 LAN 访问做了正确配置**,所以失败原因 100% 在 **运行时 / 网络层**,
不在代码层。

## 二、诊断步骤(在开发机上逐项执行,纯只读 + 必要的开启/放行)

### 步骤 1:确认 dev server 正在跑、确认它监听了 0.0.0.0、确认端口号

```bash
# 1.1 进程是否在?
pgrep -af 'tsx watch|node.*vite' || echo "dev server 未运行"

# 1.2 vite 实际监听了什么(应看到 0.0.0.0:5180 或 :5181,而不是 127.0.0.1)
ss -ltnp | grep -E ':(3000|5180|5181|5182)\b'

# 1.3 本机自测
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5180/
curl -s -o /dev/null -w '%{http_code}\n' http://192.168.1.157:5180/
```

**期望**:
- `ss` 看到 `0.0.0.0:5180` 或 `0.0.0.0:5181`
- 两个 `curl` 都返回 `200`
- 若本机用 5180 通、5181 不通 → 实际 dev 跑在 5180,链接里 5181 是历史值
- 若两者都 `Connection refused` → dev 没在跑,执行 `pnpm dev:web`(后台)

### 步骤 2:确认 LAN IP 没变

```bash
ip -4 addr show | awk '/inet /{print $2,$NF}'   # 找 192.168.1.157 那一行
```

若 IP 已经换成别的(比如 192.168.1.203),那 [vite.config.ts:29](file:///home/hilo/桌面/file-platform/packages/web/vite.config.ts#L29) 里
硬编码的 `192.168.1.157` 也得跟着改(否则 HMR 会断,但页面静态资源仍可加载)。

> **修复**:把 `host: true` 保留,但 `hmr.host` 改成开机时动态算当前 LAN IP,
> 或者在 .env 里用 `VITE_LAN_HOST` 注入,启动前改一行即可。

### 步骤 3:排查系统防火墙

```bash
# 3.1 Linux ufw
sudo ufw status verbose
# 若 active 且没有 5180/tcp,放行:
sudo ufw allow 5180/tcp
sudo ufw allow 3000/tcp
sudo ufw reload

# 3.2 firewalld (CentOS/RHEL)
sudo firewall-cmd --list-ports
sudo firewall-cmd --add-port=5180/tcp --permanent
sudo firewall-cmd --add-port=3000/tcp --permanent
sudo firewall-cmd --reload

# 3.3 iptables 直查
sudo iptables -L INPUT -n | head -30
```

**期望**:`5180/tcp` 和 `3000/tcp` 都在允许列表里(开发机常开,生产应当收紧)。

### 步骤 4:排查路由器 AP 隔离

在 **另一台 LAN 电脑** 上:

```bash
# 先 ping 通开发机才能排除 L3 问题
ping 192.168.1.157

# 再 telnet 端口(测 TCP 通不通)
nc -vz 192.168.1.157 5180
nc -vz 192.168.1.157 5181
```

- `ping` 不通 → 网络层就不通(AP 隔离 / 不同 VLAN / 不同子网)
- `ping` 通但 `nc` 都不通 → 防火墙在开发机上挡
- 两者都通但浏览器仍 ERR → 看浏览器开发者工具 Network / 终端 curl 的具体错误码

### 步骤 5:在另一台电脑看真实错误

```bash
curl -v http://192.168.1.157:5181/ 2>&1 | head -30
```

**根据错误码定位**:

| 错误 | 真实原因 | 修法 |
| --- | --- | --- |
| `Connection refused` | 端口没人监听 | dev server 没在跑,或端口变了 |
| `No route to host` | 防火墙 DROP | 步骤 3 放行 |
| `Connection timed out` | 防火墙 DROP / AP 隔离 | 同上 + 检查路由器 |
| `Could not resolve host` | 输错(纯 IP 不该有这错) | — |
| 200 + 页面正常 + 后续 /api 502 | 后端没在跑 | 启 `pnpm dev:server` |
| 200 + 页面正常 + 控制台 `[vite proxy] upstream error` | Vite 代理连不上后端 | 同上 |

## 三、修复计划(等用户确认后执行)

> 计划模式下不写代码,只列动作;**需修改代码的部分放在第 3 节,改动量极小**。

### A. 必做(让 LAN 访问稳定下来)

1. **固定 dev server 端口,关闭 strictPort 自动顺延**
   - [vite.config.ts](file:///home/hilo/桌面/file-platform/packages/web/vite.config.ts):`port: 5180` 保留,`strictPort: false` → `true`
   - 启动时端口被占直接报错,而不是悄悄换成 5181 让人摸不着头脑

2. **把硬编码的 LAN IP 抽成可配置项**
   - 在 `.env` 新增 `VITE_LAN_HOST=192.168.1.157`
   - `vite.config.ts` 里 `hmr.host: process.env.VITE_LAN_HOST || 'localhost'`
   - 用户 IP 变了只改 `.env` 一行

3. **启动时打印当前 LAN URL**
   - 在 `scripts/dev.sh` 末尾或 `vite.config.ts` 的 `server.host` 配 `true` 之后,
     Vite 会自己打印 `Network: http://192.168.x.x:5180/`,但要确保不被刷屏
   - 顺便把后端健康检查 `:3000/healthz` 也打出来

### B. 可选(更稳妥)

4. **把 Vite proxy 目标 `localhost:3000` 改成 `127.0.0.1:3000`**(消除 IPv6/IPv4 歧义)
5. **加一行 README 段:LAN 访问前的 checklist**
   - IP 没变 → 防火墙放行 → 关闭 AP 隔离 → 浏览器试 `http://<IP>:5180`
6. **关掉本机代理工具的 LAN bypass**(Clash / Surge 等若开了 "仅本机",会把 LAN 流量挡掉)

### C. 不建议做(过重)

- 引入 `vite-plugin-network` / `lan-ip` 一类包去自动检测 IP → 收益小,改 .env 即可
- 上 nginx 替 Vite 做 LAN 代理 → 偏离 MVP 范围

## 四、验收

在另一台 LAN 电脑的浏览器里:

- 打开 `http://<开发机当前 LAN IP>:5180/` → 看到登录页
- 控制台无红色报错,`/api/auth/me` 返回 401(未登录)而非 502(后端没起)
- 用 `user1 / user12345` 登录成功,首页加载分类列表
- 上传/下载至少跑通一次,确认网络层通

## 五、风险 & 回滚

- 把 `strictPort` 改 `true` 后,若 5180 真被占,启动会硬失败 → 回滚:`strictPort: false`
- `.env` 加 `VITE_LAN_HOST` 是新增,不影响现有逻辑 → 安全
- 不动后端代码、不动业务代码 → 影响面只在前端 dev 配置
