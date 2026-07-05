FROM node:20-alpine AS base
WORKDIR /app

# Prisma on Alpine needs openssl; bcrypt native build needs python/make/g++.
RUN apk add --no-cache openssl libc6-compat python3 make g++

# Install deps at the root so workspace links work.
COPY package.json package-lock.json* ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
RUN npm install --workspaces --include-workspace-root --ignore-scripts \
 && npm rebuild bcrypt --build-from-source

# Copy the rest of the sources.
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

# Build shared first (api requires the compiled dist at runtime).
WORKDIR /app/packages/shared
RUN npx tsc -p tsconfig.json

WORKDIR /app/apps/api
RUN npx prisma generate
RUN npm run build

EXPOSE 4000
# Sync schema (no migration files committed yet) then start.
CMD ["sh", "-c", "npx prisma db push --skip-generate --accept-data-loss && node dist/index.js"]
