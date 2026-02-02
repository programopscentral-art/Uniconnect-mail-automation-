# Base stage for all services
FROM node:18-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Install Python and OpenCV system dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-dev \
    python3-venv \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    && rm -rf /var/lib/apt/lists/*

COPY . /app
WORKDIR /app

# Create virtual environment and install dependencies
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Build stage
FROM base AS build
RUN pnpm install
RUN pnpm run build

# Production stage (Unified)
FROM base AS production
COPY --from=build /app/apps/app/build /app/apps/app/build
COPY --from=build /app/apps/worker/dist /app/apps/worker/dist
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/package.json /app/package.json
# Ensure Python files are copied if not already in base
COPY template_extractor.py /app/template_extractor.py

EXPOSE 3000
ENV PORT=3000

# Unified Startup Logic
CMD ["sh", "-c", "\
    if [ \"$RAILWAY_DOCKER_TARGET\" = \"worker\" ]; then \
    node apps/worker/dist/index.js; \
    elif [ \"$RAILWAY_DOCKER_TARGET\" = \"extractor\" ]; then \
    python3 template_extractor.py; \
    else \
    node apps/app/build/index.js; \
    fi"]
