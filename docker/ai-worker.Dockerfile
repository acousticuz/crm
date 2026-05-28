FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY packages packages
COPY apps/ai-worker apps/ai-worker
COPY prompts prompts
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @acoustic-crm/shared build
RUN pnpm --filter @acoustic-crm/ai-worker build

FROM node:20-alpine AS runtime
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/ai-worker
CMD ["node", "dist/main.js"]
