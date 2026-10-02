FROM node:24-alpine AS build
RUN corepack enable && corepack prepare pnpm@11.19.0 --activate
WORKDIR /workspace
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN --mount=type=cache,id=nackchal-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store
COPY frontend/ ./
RUN pnpm build

FROM nginx:1.28-alpine
COPY infra/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/dist /usr/share/nginx/html
EXPOSE 80
