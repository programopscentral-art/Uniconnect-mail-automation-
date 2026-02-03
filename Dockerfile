# Base stage for all services
FROM node:18-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Install system dependencies (only what's needed for PDF/Node)
RUN apt-get update && apt-get install -y \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY . /app
WORKDIR /app



# Build stage
FROM base AS build
RUN pnpm install
RUN pnpm run build

# Production stage (Unified)
FROM base AS production
COPY --from=build /app /app

EXPOSE 3000
ENV PORT=3000

# Unified Startup Logic
CMD ["sh", "-c", "\
    if [ \"$RAILWAY_DOCKER_TARGET\" = \"worker\" ]; then \
    node apps/app/build/worker.js; \
    else \
    node apps/app/build/index.js; \
    fi"]
