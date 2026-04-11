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
# Pre-compile seed script to avoid needing ts-node in runner
RUN npx tsc prisma/seed.ts --outDir dist-seed --esModuleInterop --module esnext --moduleResolution node --target es2020

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
COPY --from=builder /app/dist-seed ./dist-seed

# Copy only what's needed for the prisma client/CLI
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/bcryptjs ./node_modules/bcryptjs

EXPOSE 3000

# Run prisma migration + pre-compiled seeding then start the server
CMD ["sh", "-c", "node node_modules/prisma/build/index.js db push --accept-data-loss && node dist-seed/seed.js && node server.js"]
