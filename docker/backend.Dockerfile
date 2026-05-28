# Multi-stage build for the NestJS backend.
FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache python3 make g++ openssl
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY packages packages
COPY apps/backend apps/backend
COPY prisma prisma
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @acoustic-crm/shared build
RUN cd apps/backend && pnpm prisma generate
RUN pnpm --filter @acoustic-crm/backend build

FROM node:20-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache openssl
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/backend
EXPOSE 3001
CMD ["node", "dist/main.js"]
