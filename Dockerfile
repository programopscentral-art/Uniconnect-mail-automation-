# Base stage for all services
FROM node:18-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
COPY . /app
WORKDIR /app

# Build stage
FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm run build

# Production stage for App
FROM base AS app
COPY --from=build /app/apps/app/build /app/apps/app/build
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/app/node_modules /app/apps/app/node_modules
COPY --from=build /app/apps/app/package.json /app/apps/app/package.json

EXPOSE 3000
ENV PORT=3000
CMD ["node", "apps/app/build/index.js"]

# Production stage for Worker
FROM base AS worker
COPY --from=build /app/apps/worker/dist /app/apps/worker/dist
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/worker/node_modules /app/apps/worker/node_modules
COPY --from=build /app/apps/worker/package.json /app/apps/worker/package.json

CMD ["node", "apps/worker/dist/index.js"]
