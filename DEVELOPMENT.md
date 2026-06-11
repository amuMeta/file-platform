# 文件分发平台 — 开发文档（交付 Claude Code）

> 本文件是给 Claude Code 直接照着开发的工程规范。技术栈已锁定为可执行的具体选型,无需再做决策。功能范围以原 PRD 为准,鉴权与大文件下发采用更新版技术方案。
>
> **MVP 目标**：1–2 人 6 个工作日交付。十几人规模、低并发,不做高并发优化。

---

## 0. 给 Claude Code 的工作约定

- 按「§9 构建顺序」分阶段实现,每个阶段结束跑通对应的「验收点」再进入下一阶段。
- 所有技术选型已在 §2 锁定,**不要替换**(如确有阻塞,先说明原因再改)。
- 后端用 **TypeScript**;前端用 **Vue 3 `<script setup>` + TypeScript**。
- 提交前确保 `pnpm -r build` 通过、`pnpm -r lint` 无 error。
- 涉及 PRD 歧义处见 §4.3 的 **⚠️ 决策说明**,已选定默认行为,实现时遵守即可。
- 不引入未在 §2 列出的额外重型依赖;需要新依赖时优先选轻量、维护活跃的。

---

## 1. 概述

- **背景**：售后/客户需要获取不同分类的安装包（rar/zip 等压缩包）。当前靠微信群发文件,易过期、版本乱、难查找。
- **目标**：管理员上传、分类、版本管理文件;客户按分类浏览、下载对应版本。
- **角色**：

| 角色 | 能力 |
| --- | --- |
| 管理员 admin | 上传文件、管理分类、管理版本、管理用户、查看下载记录 |
| 客户 user | 登录后浏览分类、搜索、下载文件、查看历史版本 |

---

## 2. 技术栈（已锁定）

| 层 | 选型 | 备注 |
| --- | --- | --- |
| 前端 | Vue 3 + Vite + TypeScript + Element Plus | 状态 Pinia,路由 Vue Router,请求 axios |
| 后端 | Node.js 20 LTS + Fastify 4 + TypeScript | 不用 NestJS;按 router/service/dao 简单分层 |
| 数据库 | SQLite + better-sqlite3 | 同步 API、零依赖;DDL 见 §5 |
| 校验 | zod | 请求体/参数校验 |
| 鉴权 | Cookie + Session（`@fastify/cookie` + `@fastify/session`） | httpOnly,内存 store 即可 |
| 密码 | bcrypt（`bcryptjs`） | cost = 10 |
| 上传 | `@fastify/multipart` | 单文件 ≤ 100MB(可配) |
| 大文件下发 | 生产经 nginx `X-Accel-Redirect`;开发用 `reply.sendFile` 兜底 | 见 §6 |
| 包管理 | pnpm（monorepo workspace） | |
| 部署 | 单台云服务器 + nginx 反代 | |

> 说明：本项目几乎全是文件 I/O,Node 与 Python 都能胜任;此处锁定 Node 以便前后端统一 TS。若团队最终改用 Python/FastAPI,§5/§7/§8 的接口与数据模型完全通用,只需替换实现。

---

## 3. 项目结构（monorepo）

```
file-platform/
├── package.json              # pnpm workspace 根
├── pnpm-workspace.yaml
├── .env.example
├── DEVELOPMENT.md            # 本文件
├── nginx/
│   └── file-platform.conf    # 生产 nginx 配置(含 X-Accel-Redirect)
├── data/                     # 运行时数据(gitignore)
│   ├── app.db                # SQLite 文件
│   └── uploads/              # 上传文件物理目录(nginx internal)
├── packages/
│   ├── server/               # 后端 Fastify
│   │   ├── src/
│   │   │   ├── index.ts          # 启动入口
│   │   │   ├── app.ts            # 注册插件/路由
│   │   │   ├── db.ts             # better-sqlite3 连接 + 迁移
│   │   │   ├── config.ts         # 读取 env
│   │   │   ├── plugins/
│   │   │   │   ├── auth.ts       # session/cookie 注册 + 鉴权钩子
│   │   │   │   └── multipart.ts
│   │   │   ├── middlewares/
│   │   │   │   ├── requireAuth.ts
│   │   │   │   └── requireAdmin.ts
│   │   │   ├── modules/
│   │   │   │   ├── auth/         # 登录/登出/me
│   │   │   │   ├── user/         # 管理员管理用户
│   │   │   │   ├── category/     # 分类 CRUD + 排序
│   │   │   │   ├── file/         # 上传/列表/详情/下载/搜索
│   │   │   │   └── log/          # 下载记录查询
│   │   │   └── utils/
│   │   │       ├── hash.ts
│   │   │       └── errors.ts
│   │   └── scripts/seed.ts       # 初始化管理员账号
│   └── web/                  # 前端 Vue
│       ├── src/
│       │   ├── main.ts
│       │   ├── App.vue
│       │   ├── router/index.ts
│       │   ├── api/             # axios 封装 + 各模块请求
│       │   ├── stores/auth.ts
│       │   ├── layouts/
│       │   ├── views/
│       │   │   ├── client/      # Login / Home / Category / FileDetail
│       │   │   └── admin/       # Login / Dashboard / Category / File / Log / User
│       │   └── components/
│       └── vite.config.ts        # dev proxy /api -> localhost:3000
```

---

## 4. 业务规则

### 4.1 分类
- 增 / 删 / 改 / 查;字段：`name`、`sort_order`、`status(enabled/disabled)`。
- 客户端只看 `enabled` 的分类,按 `sort_order` 升序。
- 删除分类前若其下仍有文件,返回错误提示(不级联删除文件,避免误删)。

### 4.2 文件字段
- `filename`(原始名)、`version`、`remark`(更新说明/适用机型)、`size`、`stored_path`、`status(latest/history/hidden)`、`created_at`。
- 单文件 ≤ 100MB（`MAX_UPLOAD_MB`,默认 100,可配）。
- 物理文件存 `data/uploads/`,**用随机文件名**(如 uuid + 原扩展名)存盘,数据库记 `stored_path`,前端只见 `fileId`,不暴露真实路径。
- 上传时校验扩展名白名单（默认 `rar,zip,7z,exe,bin,img,apk`,`ALLOWED_EXT` 可配）。

### 4.3 版本管理 ⚠️ 决策说明

PRD 原文：「同一分类下可保留多个历史版本,默认展示最新」「同一分类上传新版本后,旧版本自动标记为历史」。这里存在歧义：一个分类里是不是只有「一个东西」的多个版本?

**已定默认行为(MVP 采用)**：以「分类」为版本线。向某分类上传新文件时,把该分类下所有 `status='latest'` 的文件改为 `history`,新文件设为 `latest`。客户端默认只展示 `latest`,历史版本在文件详情页可查。这与 PRD 验收标准逐字一致。

**潜在局限 & 预留扩展**：若一个分类需要承载多个互不相干的文件(例如「驱动包」里有 A 产品驱动 + B 产品驱动),上述行为会把彼此误标为历史。为此 `file` 表预留可选字段 `group_key`(默认 = `filename` 的主名,去版本号/扩展名):
- MVP 阶段 `group_key` 统一取分类级(同分类同组),行为同上;
- 后续如需「同分类多产品线」,把「标记历史」的范围从 `category_id` 改为 `category_id + group_key` 即可,无需改表。
- **实现时先按分类级落地**,但代码中把「定位需置为 history 的旧版本」抽成一个函数,便于一行切换粒度。

### 4.4 下载记录
- 每次**成功**下载落库 `download_log(user_id, file_id, ip, created_at)`。
- 管理端可按 `fileId` / `userId` 过滤,分页查询。

### 4.5 用户
- 无注册,账号由管理员创建。`role ∈ {admin, user}`,`status ∈ {active, disabled}`。
- 提供 `scripts/seed.ts` 初始化一个 admin(用户名/密码从 env 读)。

---

## 5. 数据模型（SQLite DDL）

```sql
CREATE TABLE IF NOT EXISTS user (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user',   -- admin | user
  status        TEXT NOT NULL DEFAULT 'active',  -- active | disabled
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS category (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'enabled',   -- enabled | disabled
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS file (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES category(id),
  filename    TEXT NOT NULL,            -- 原始文件名
  stored_path TEXT NOT NULL,            -- data/uploads/ 下的相对路径(随机名)
  version     TEXT,
  remark      TEXT,
  size        INTEGER NOT NULL,         -- 字节
  status      TEXT NOT NULL DEFAULT 'latest',  -- latest | history | hidden
  group_key   TEXT,                     -- 预留,见 §4.3
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_file_category ON file(category_id, status);

CREATE TABLE IF NOT EXISTS download_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES user(id),
  file_id    INTEGER NOT NULL REFERENCES file(id),
  ip         TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_log_file ON download_log(file_id);
CREATE INDEX IF NOT EXISTS idx_log_user ON download_log(user_id);
```

---

## 6. 鉴权与下载流程

### 6.1 登录态
- 登录成功后通过 `@fastify/session` 建立服务端会话,下发
  `Set-Cookie: sid=...; HttpOnly; Secure; SameSite=Lax`。
- 全站 HTTPS;开发环境 `Secure` 可按 `NODE_ENV` 关闭。
- `requireAuth` 钩子校验会话;`requireAdmin` 在其基础上校验 `role==='admin'`。
- 未登录访问受保护接口/下载 → `401`;越权(普通用户访问 admin 接口) → `403`。

### 6.2 下载（核心）
1. 前端下载按钮指向 `GET /api/files/:id/download`(同源,自动带 cookie)。
2. 后端校验：会话有效 → 文件存在且非 `hidden`/未删除 → 有权下载。
3. 通过后**先写 `download_log`**,再下发文件：
   - **生产(经 nginx)**：返回响应头 `X-Accel-Redirect: /protected/<stored_path>`,**不写 body**,文件由 nginx `sendfile` 下发。同时带上
     `Content-Disposition: attachment; filename*=UTF-8''<urlencoded 原始名>`。
   - **开发(无 nginx)**：用 `reply.sendFile(stored_path, root=data/uploads)` 流式返回(`@fastify/static` 的 sendFile),**切勿一次性读入内存**。
   - 用环境变量 `USE_XACCEL`(true/false)切换两种模式。
4. 失败：未登录 `401`,无权/文件隐藏 `403`,文件不存在 `404`。

### 6.3 nginx 关键配置（`nginx/file-platform.conf`）
```nginx
server {
    listen 443 ssl;
    server_name your.domain;

    client_max_body_size 110m;          # 略大于 100MB 上限

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;  # 后端取真实 IP 入库
    }

    location /protected/ {
        internal;                        # 仅允许内部跳转,外部直接 404
        alias /srv/file-platform/data/uploads/;
    }

    location / {
        root /srv/file-platform/web-dist; # 前端打包产物
        try_files $uri $uri/ /index.html;
    }
}
```

### 6.4 安全要点
- 密码 `bcrypt` cost ≥ 10,不存明文。
- Cookie `HttpOnly + Secure + SameSite=Lax`。
- 真实文件路径不出现在任何对外响应里;`data/uploads` 设为 nginx `internal` 或非 web 可达。
- 上传校验大小 + 扩展名白名单;随机存储名防覆盖与路径穿越。
- 后端从 `X-Forwarded-For`/`request.ip` 取客户端 IP 写日志。

---

## 7. 接口清单

> 统一前缀 `/api`。成功返回 `{ code: 0, data }`;失败返回 `{ code, message }` + 对应 HTTP 状态码。除登录外均需登录态;标 🔒admin 的需管理员。

### 7.1 认证
| 方法 | 路径 | 说明 | 入参 | 返回 |
| --- | --- | --- | --- | --- |
| POST | `/auth/login` | 登录,种 cookie | `{username, password}` | `{user}` |
| POST | `/auth/logout` | 登出,清会话 | — | `{}` |
| GET | `/auth/me` | 当前用户 | — | `{user}` |

### 7.2 分类
| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/categories` | 客户端：仅 enabled,按 sort_order 升序 |
| GET 🔒 | `/admin/categories` | 全部(含 disabled) |
| POST 🔒 | `/admin/categories` | 新建 `{name, sort_order?}` |
| PUT 🔒 | `/admin/categories/:id` | 改 `{name?, status?}` |
| DELETE 🔒 | `/admin/categories/:id` | 删(下有文件则拒绝) |
| PUT 🔒 | `/admin/categories/sort` | 批量排序 `{items:[{id,sort_order}]}` |

### 7.3 文件
| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/categories/:id/files` | 该分类文件;默认仅 latest,`?includeHistory=1` 含历史(不含 hidden) |
| GET | `/files/:id` | 文件详情 + 同组历史版本列表 |
| GET | `/files/:id/download` | **鉴权 + 记日志 + 下发**(见 §6.2) |
| GET | `/search?q=` | 按 filename / remark 模糊搜(仅 latest,enabled 分类) |
| POST 🔒 | `/admin/files` | multipart 上传 `category_id, version, remark, file`;触发版本翻新(§4.3) |
| PUT 🔒 | `/admin/files/:id` | 改 `{version?, remark?, status?}` |
| DELETE 🔒 | `/admin/files/:id` | 删(同时删物理文件) |

### 7.4 下载记录
| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET 🔒 | `/admin/logs` | `?fileId=&userId=&page=&pageSize=` 分页;返回含 用户名/文件名/IP/时间 |

### 7.5 用户管理
| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET 🔒 | `/admin/users` | 列表 |
| POST 🔒 | `/admin/users` | 新建 `{username, password, role?}` |
| PUT 🔒 | `/admin/users/:id` | 改 `{password?, status?, role?}` |

---

## 8. 前端页面与路由

| 路由 | 页面 | 权限 |
| --- | --- | --- |
| `/login` | 客户登录 | 公开 |
| `/` | 首页：分类列表 + 搜索框 | user |
| `/category/:id` | 分类详情：文件列表,latest 置顶+标识 | user |
| `/file/:id` | 文件详情：历史版本列表,可下载指定版本 | user |
| `/admin/login` | 管理员登录 | 公开 |
| `/admin/dashboard` | 概览 | admin |
| `/admin/category` | 分类管理(增删改 + 拖拽排序 + 启停) | admin |
| `/admin/file` | 文件管理(上传 + 列表 + 版本/状态 + 删除) | admin |
| `/admin/log` | 下载记录(按文件/用户筛选,分页) | admin |
| `/admin/user` | 用户管理 | admin |

前端要点：
- axios 实例 `withCredentials: true`(带 cookie);响应拦截 401 → 跳登录。
- Pinia `auth` store 缓存当前用户;路由守卫按 `role` 拦截 admin 路由。
- 下载用 `window.location.href = '/api/files/:id/download'` 或隐藏 `<a>` 触发(走浏览器原生下载,自动带 cookie)。
- 上传用 Element Plus `el-upload`,显示进度;前端预校验大小/扩展名。
- 分类排序用可拖拽列表,保存时调 `/admin/categories/sort`。

---

## 9. 构建顺序（6 天,每阶段附验收点）

### D1 — 初始化 + 登录跑通
- 建 monorepo、pnpm workspace、`.env.example`;前端 Vite、后端 Fastify 起得来。
- 建库与迁移(§5 DDL),`seed.ts` 写入初始 admin。
- 实现 `/auth/login` `/auth/logout` `/auth/me` + session;前端两个登录页 + auth store + 路由守卫。
- **验收**：admin 与 user 各能登录,刷新保持登录态,未登录访问受保护接口返回 401。

### D2 — 分类管理
- 后端分类 CRUD + 排序 + 启停;客户端 `/categories`。
- 管理端 `/admin/category` 页面(增删改、拖拽排序、启停)。
- **验收**：管理员能创建/删除分类、调整顺序、启停;客户端只看到 enabled 且顺序正确。

### D3 — 文件上传 / 下载（核心）
- `@fastify/multipart` 上传,随机存名,大小/扩展名校验;版本翻新逻辑(§4.3)。
- 下载接口 + 鉴权 + 写日志 + `X-Accel-Redirect`/`sendFile` 双模式。
- 管理端文件列表/上传/状态/删除。
- **验收**：上传新版本后旧版本自动转 history;客户端下载成功并落日志;未登录访问下载链接 401;hidden/无权 403。

### D4 — 客户端浏览
- 首页分类列表 + 搜索框;分类详情(latest 置顶+标识);文件详情(历史版本可下载)。
- **验收**：客户登录后能按分类找到文件并下载到本地;历史版本可查可下。

### D5 — 下载记录 + 搜索
- `/admin/logs` 分页 + 筛选;`/search` 模糊搜(filename/remark)。
- 管理端日志页。
- **验收**：管理员能看到每条下载记录(谁/何时/哪个文件/IP),可按文件/用户筛;文件名/备注模糊搜可用。

### D6 — 测试 + 部署
- 联调、修 bug;前端 `vite build`;nginx 配置;HTTPS;生产环境变量。
- 验证生产模式 `X-Accel-Redirect` 下发正常、`/protected` 外部不可直接访问。
- **验收**：服务器上端到端跑通;补 README 部署说明。

---

## 10. 环境变量（`.env.example`）

```dotenv
NODE_ENV=development
PORT=3000

# 数据
DB_PATH=./data/app.db
UPLOAD_DIR=./data/uploads

# 上传限制
MAX_UPLOAD_MB=100
ALLOWED_EXT=rar,zip,7z,exe,bin,img,apk

# 会话
SESSION_SECRET=change-me-to-a-long-random-string
COOKIE_SECURE=false            # 生产置 true

# 下载下发模式
USE_XACCEL=false               # 生产经 nginx 时置 true
XACCEL_PREFIX=/protected

# 初始管理员(seed 用)
SEED_ADMIN_USER=admin
SEED_ADMIN_PASS=change-me
```

运行：
```bash
pnpm install
pnpm --filter server seed        # 初始化 admin
pnpm --filter server dev         # 后端 :3000
pnpm --filter web dev            # 前端 :5173 (proxy /api -> :3000)
# 生产
pnpm -r build
```

---

## 11. 验收标准（对应 PRD §9）

- [ ] 管理员能创建分类、删除分类、调整顺序、启停。
- [ ] 管理员能在分类下上传文件,标注版本/备注。
- [ ] 同一分类上传新版本后,旧版本自动标记为历史,默认不展示但可查(粒度见 §4.3)。
- [ ] 客户登录后能按分类找到文件并下载到本地。
- [ ] 未登录访问下载链接返回 401;越权访问返回 403。
- [ ] 管理员能查看每条下载记录(谁/何时/哪个文件/IP),支持按文件/用户查询。
- [ ] 文件名/备注支持模糊搜索。

---

## 12. 不在 MVP 内（后续迭代）
- 多文件打包下载、文件夹层级
- 新版本邮件/短信通知
- 带有效期的公开分享链接(可复用 §6 的签名链接思路)
- 接入 OSS / CDN(存储层已抽象,便于平滑迁移)
- 文件预览(图片/PDF)
