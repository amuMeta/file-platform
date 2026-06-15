# syntax=docker/dockerfile:1.7
# ---- stage 1: deps (缓存依赖层) ----
FROM node:20-slim AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/server/package.json packages/server/
COPY packages/web/package.json    packages/web/
RUN pnpm install --frozen-lockfile

# ---- stage 2: build ----
FROM deps AS build
COPY packages/server packages/server
COPY packages/web    packages/web
RUN pnpm --filter server build
# seed.ts 被 tsconfig.exclude 排除,单独编译并修正 import 路径
RUN cd packages/server \
 && npx tsc scripts/seed.ts --outDir dist --rootDir . \
      --module ES2022 --moduleResolution Bundler --target ES2022 \
      --esModuleInterop --skipLibCheck --resolveJsonModule \
 && sed -i "s|from '\.\./src/|from '../|g" dist/scripts/seed.js \
 && rm -rf dist/src dist/*.map dist/*/*.map dist/*/*/*.map 2>/dev/null || true
RUN pnpm --filter web build

# ---- stage 3: runtime (只含 dist + prod deps) ----
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# psmisc 提供 fuser(用 psmisc -K 检测 DB 是否被占用)
RUN apt-get update && apt-get install -y --no-install-recommends \
    psmisc \
  && rm -rf /var/lib/apt/lists/*

# 复制 workspace 描述 + 只装 server 的生产依赖
COPY --from=build /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=build /app/packages/server/package.json packages/server/
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate \
 && pnpm install --frozen-lockfile --prod --filter server...

# 拷贝构建产物
COPY --from=build /app/packages/server/dist packages/server/dist
COPY --from=build /app/packages/web/dist      /app/web-dist

# 入口脚本
COPY scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# 数据目录 + 权限(uid 1000 = node 用户,与主机 hilo 对齐)
RUN mkdir -p /app/data/uploads && chown -R node:node /app

USER node
WORKDIR /app
VOLUME ["/app/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+ (process.env.PORT||3000) +'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "packages/server/dist/index.js"]
