# V58: Nuclear Docker Build to bypass Railway auto-detection failures
FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS build
COPY . /app
WORKDIR /app

# Final Canvas fix: PNPM override is in root package.json
# No native dependencies (pixman/cairo) needed because we use @napi-rs/canvas
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Run migrations and build
# Note: Database URL must be provided at build time if migrations run here
# If migrations fail, we'll continue the build and run them at runtime
RUN PGSSLMODE=no-verify NODE_TLS_REJECT_UNAUTHORIZED=0 pnpm -F @uniconnect/shared migrate || true
RUN pnpm -F app build

FROM base
COPY --from=build /app /app
WORKDIR /app/apps/app

EXPOSE 3000
ENV NODE_ENV=production
CMD [ "node", "build/index.js" ]
