# syntax=docker/dockerfile:1
# 自媒体工作台 — 生产镜像（双构建目标：api / web）
# 构建：docker compose -f docker-compose.prod.yml build
# 说明：选用 Debian slim（glibc），避免 musl 下 Prisma / @node-rs/argon2 原生二进制兼容问题。
# 注意：本机无 Docker，本文件未在真机执行过镜像构建；首次上线请按 deploy/README.md 逐步核验。

# ---------- 构建阶段：装依赖 → 生成 Prisma Client → 编译后端 → 构建前端 ----------
FROM node:22-bookworm-slim AS build
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY server/package.json server/package-lock.json ./server/
COPY web/package.json web/package-lock.json ./web/
RUN cd server && npm ci --no-audit --no-fund \
 && cd ../web && npm ci --no-audit --no-fund

COPY server ./server
COPY web ./web

# prisma generate 不连库，仅需 schema；vite 构建期从上级读 .env，无文件时使用默认前缀 api
RUN cd server && npx prisma generate --schema prisma/schema.prisma && npm run build \
 && cd ../web && npm run build

# ---------- 运行阶段：API（BullMQ Worker 内嵌于本进程，无需单独起 worker） ----------
FROM node:22-bookworm-slim AS api
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app/server

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3001 \
    STORAGE_ROOT=/app/storage

COPY --from=build /app/server/dist ./dist
COPY --from=build /app/server/node_modules ./node_modules
COPY --from=build /app/server/prisma ./prisma
COPY --from=build /app/server/package.json ./package.json
COPY deploy/entrypoint.sh /usr/local/bin/entrypoint.sh

RUN chmod +x /usr/local/bin/entrypoint.sh && mkdir -p /app/storage

VOLUME ["/app/storage"]
EXPOSE 3001
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

# ---------- 运行阶段：Web（nginx 静态托管 + /api 反向代理） ----------
FROM nginx:1.27-alpine AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web/dist /usr/share/nginx/html
EXPOSE 80
