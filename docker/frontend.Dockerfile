FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
ARG VITE_API_URL=/
ARG VITE_SOCKET_URL=/
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY packages packages
COPY apps/frontend apps/frontend
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @acoustic-crm/shared build
RUN pnpm --filter @acoustic-crm/frontend build

FROM nginx:1.27-alpine
COPY --from=build /app/apps/frontend/dist /usr/share/nginx/html
COPY docker/frontend.nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
