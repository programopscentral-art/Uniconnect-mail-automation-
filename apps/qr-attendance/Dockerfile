FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

FROM base AS deps
COPY package.json ./
COPY prisma ./prisma
# Install ALL dependencies including devDeps for the build phase
RUN npm install

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN mkdir -p public
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Copy standalone build
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Also copy the prisma CLI and engines needed for the startup migration/seeding
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000

# Run prisma migration + seeding then start the server
CMD ["sh", "-c", "node node_modules/prisma/build/index.js db push --accept-data-loss && node node_modules/ts-node/dist/bin.js --project tsconfig.json prisma/seed.ts && node server.js"]
