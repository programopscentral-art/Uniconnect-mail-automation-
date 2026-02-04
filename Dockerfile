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
RUN pnpm install --no-frozen-lockfile

# Run migrations and build all components
RUN PGSSLMODE=no-verify NODE_TLS_REJECT_UNAUTHORIZED=0 pnpm -F @uniconnect/shared migrate || true
RUN pnpm -F app exec svelte-kit sync
RUN pnpm -r build

FROM base
COPY --from=build /app /app
WORKDIR /app

EXPOSE 3000
ENV NODE_ENV=production
# Default start is the app, but Railway services can override this via startCommand
CMD [ "node", "apps/app/build/index.js" ]
