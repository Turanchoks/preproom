# TeachFlow — Cloud Run image (Next.js standalone)
FROM node:22-slim AS base
RUN corepack enable pnpm
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build-time placeholders; real values are injected at runtime by Cloud Run.
ENV POSTGRES_URL=postgres://build:build@localhost:5432/build \
    AUTH_SECRET=build-placeholder \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm exec next build
# Precompile the MCP exercise server (standalone image has no tsx)
RUN pnpm exec esbuild mcp/exercise-server.ts --bundle --platform=node \
    --format=cjs --outfile=mcp-dist/exercise-server.cjs

FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/mcp-dist/exercise-server.cjs ./mcp/exercise-server.cjs
EXPOSE 8080
CMD ["node", "server.js"]
