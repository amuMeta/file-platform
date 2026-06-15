# 文件分发平台

管理员上传/分类/版本管理文件,客户按分类登录后下载。MVP 范围 1-2 人 6 个工作日。

## 技术栈

- 前端: Vue 3 + Vite + TypeScript + Element Plus + Pinia + Vue Router
- 后端: Node.js 20 + Fastify 4 + TypeScript + zod + bcryptjs
- 数据库: SQLite + better-sqlite3(WAL 模式)
- 鉴权: Cookie + Session
- 大文件下发: 开发 `reply.sendFile`(流式)/ 生产 nginx `X-Accel-Redirect`

详细开发规范见 [DEVELOPMENT.md](./DEVELOPMENT.md)。

## 目录结构

```
file-platform/
├── packages/
│   ├── server/                # 后端 Fastify
│   │   ├── src/
│   │   │   ├── app.ts         # 入口
│   │   │   ├── config.ts      # env 加载
│   │   │   ├── db.ts          # better-sqlite3 + DDL
│   │   │   ├── response.ts    # 统一响应 + 错误处理
│   │   │   ├── plugins/       # auth/multipart
│   │   │   └── modules/       # auth/category/file/log/user
│   │   └── scripts/seed.ts    # 初始化 admin
│   └── web/                   # 前端 Vue
│       ├── src/
│       │   ├── api/           # axios 封装
│       │   ├── stores/        # Pinia
│       │   ├── router/        # 路由 + 守卫
│       │   ├── layouts/       # ClientLayout / AdminLayout
│       │   └── views/         # client/ + admin/
│       └── vite.config.ts     # dev 代理 /api -> :3000
├── data/                      # 运行时:SQLite + 上传文件 (gitignore)
├── nginx/file-platform.conf   # 生产 nginx 配置
├── pnpm-workspace.yaml
└── package.json
```

## 快速开始(开发)

```bash
# 1. 安装依赖(monorepo)
pnpm install

# 2. 准备环境变量
cp .env.example .env
# 按需修改:SEED_ADMIN_USER/SEED_ADMIN_PASS、SESSION_SECRET、COOKIE_SECURE 等

# 3. 初始化管理员账号
pnpm seed
# 默认账号在 .env: admin / change-me

# 4. 启动开发服务(分两个终端或同终端后台)
pnpm dev:server      # 后端 :3000
pnpm dev:web         # 前端 :5180,自动代理 /api -> :3000

# 浏览器打开
http://localhost:5180
# 客户登录: /login
# 管理员登录: /admin/login
```

## 常用命令

```bash
pnpm -r build          # 构建 server (dist/) 和 web (dist/)
pnpm -r typecheck      # 类型检查(纯类型,不产出文件)
pnpm seed              # 初始化/补全 admin 账号(已存在则跳过)
pnpm dev:server        # 后端热重载
pnpm dev:web           # 前端 Vite dev
```

## 生产部署

### 0. Docker 部署(推荐)

把 monorepo 整目录放到服务器(或者本地机器)上一份,用 docker-compose 一键起:

```bash
# 1) 预检 + 备份(把 dev 进程停掉、WAL 收口、data 打包)
bash scripts/docker-preflight.sh

# 2) 准备 .env
cp .env.docker.example .env
bash scripts/gen-secret.sh >> .env   # 追加 SESSION_SECRET
$EDITOR .env                          # 改 SEED_ADMIN_PASS

# 3) 构建 + 启动
docker compose build
docker compose up -d

# 4) 验证
docker compose ps                     # 两容器都 Up(healthy)
curl -i http://localhost/                # 200 + 前端 index.html
curl -i http://localhost/api/healthz     # 200 + {"code":0,"data":{"status":"ok"}}
# 注意:niginx 转发时去掉 /api/ 前缀,Fastify 实际收到的是 /healthz

# 5) 把公网入口切到 docker(原来是 5180→Vite,现改为 80→nginx 容器)
bash scripts/docker-cpolar-switch.sh
```

架构:`nginx` 容器(host:80) + `node` 容器(internal:3000),共享 `fp-net` 内部网络,数据 `./data` 用 bind mount 同时被两容器访问(nginx 只读)。`nginx` 用 X-Accel-Redirect 零拷贝下发大文件,`node` 不暴露端口。

详细设计参见 `docs/docker-deploy.md`(由 preflight / cpolar-switch 脚本的输出回看)。

### 1. 构建产物(裸机部署备选)

```bash
pnpm -r build
# 产物路径:
#   packages/server/dist/   (Node 启动入口)
#   packages/web/dist/      (静态文件,nginx 托管)
```

### 2. 服务器目录结构(建议)

```
/srv/file-platform/
├── server/                 # 复制 packages/server/dist + package.json + node_modules
├── web-dist/               # 复制 packages/web/dist
├── data/                   # SQLite + 上传文件
│   ├── app.db
│   └── uploads/
├── .env                    # 生产环境变量
└── start.sh                # 启动脚本:node server/index.js
```

### 3. 环境变量(生产)

`.env` 关键项:

```dotenv
NODE_ENV=production
PORT=3000

# 路径可用绝对路径
DB_PATH=/srv/file-platform/data/app.db
UPLOAD_DIR=/srv/file-platform/data/uploads

SESSION_SECRET=<随机 64 字符>
COOKIE_SECURE=true             # 必须 HTTPS

USE_XACCEL=true                # 经 nginx 下发
XACCEL_PREFIX=/protected
```

### 4. nginx 配置

参考 [nginx/file-platform.conf](./nginx/file-platform.conf)。关键(以上传上限 500MB 为例):

- `client_max_body_size 520m`(**必须** > `MAX_UPLOAD_MB`,否则 nginx 在 body 未读完就返 413)
- `proxy_request_buffering off`(**必须**,否则 nginx 缓冲整个 body 到磁盘,浏览器端进度条会卡 0% 直到缓冲完才跳 100%)
- `proxy_read_timeout 1800s` / `proxy_send_timeout 1800s`(**必须**够大,防慢客户端/慢磁盘被 nginx 中断)
- `location /api/` 代理到 `127.0.0.1:3000`
- `location /protected/` 设置 `internal;`(仅 X-Accel-Redirect 内部可用)
- `location /` 指向 web-dist,SPA 用 `try_files` 回退到 `index.html`

如果改了 `MAX_UPLOAD_MB`,上面四个数字必须同步调整。

### 5. 上传下载流程(生产)

1. 客户端上传:`POST /api/admin/files` (multipart,经 nginx 代理到 Fastify)
2. Fastify 写盘到 `/srv/file-platform/data/uploads/<uuid>.<ext>`,落库 `file` 表
3. 同分类上传新版本时,把旧 `latest` 自动标 `history`(`demoteOldLatest`)
4. 客户下载:`GET /api/files/:id/download`
   - Fastify 校验会话 → 写 `download_log` → 返回 `X-Accel-Redirect: /protected/<stored_path>`
   - nginx `internal` location 直接 `sendfile` 下发,不经 Node
5. `/protected/...` 外部直接 404(因 `internal`)

## 业务规则摘要

- **角色**:`admin` / `user`。无注册,账号由管理员创建。
- **分类**:增删改查,字段 `name / sort_order / status(enabled/disabled)`;客户端只看 `enabled` 且按 `sort_order` 升序;下有文件不可删除。
- **文件**:单文件 ≤ `MAX_UPLOAD_MB`(默认 500MB,生产已对齐);扩展名白名单 `rar,zip,7z,exe,bin,img,apk`(可配);随机存名;物理路径不暴露;上传前磁盘预检(剩余 < 50MB 拒绝)。
- **版本**(§4.3):同分类上传新版本 → 旧 `latest` 自动 `history`。`file.group_key` 已预留,后续如需细分到产品线,把 `demoteOldLatest` 改为按 `category_id + group_key` 即可。
- **下载**:每次成功下载落 `download_log(user_id, file_id, ip, created_at)`;管理端可按 `fileId/userId` 过滤分页。
- **下载记录 IP**:从 `X-Forwarded-For` 取(nginx 透传),兜底 `request.ip`。
- **安全**:密码 bcrypt(cost 10);Cookie `HttpOnly + Secure + SameSite=Lax`(生产 Secure=on);`data/uploads` 不直接对外可访问。

## 验收点对照(对应 PRD §9)

- [x] 管理员能创建/删除分类、调整顺序、启停
- [x] 管理员能在分类下上传文件,标注版本/备注
- [x] 同分类上传新版本后,旧版本自动标记为历史,默认不展示但可查
- [x] 客户登录后能按分类找到文件并下载到本地
- [x] 未登录访问下载链接返回 401;越权访问返回 403
- [x] 管理员能查看每条下载记录(谁/何时/哪个文件/IP),支持按文件/用户查询
- [x] 文件名/备注支持模糊搜索

## 后续可扩展(不在 MVP 内)

- 多文件打包下载、文件夹层级
- 新版本邮件/短信通知
- 带有效期的公开分享链接(可复用 §6 签名思路)
- 接入 OSS / CDN(存储层可抽象,平滑迁移)
- 文件预览(图片/PDF)
