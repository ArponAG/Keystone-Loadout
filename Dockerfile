# Keystone Loadout — LAN deployment.
#
# Multi-stage so the runtime image does not carry the toolchain. better-sqlite3 is a
# native module, so it is compiled in a builder stage with build tools present and the
# result copied forward; the runtime image needs no compiler.
#
# The database is a mounted volume, NOT baked into the image: it is data you sync and
# re-sync, and a rebuild must never discard it.

# --- build -------------------------------------------------------------------
FROM node:24-bookworm-slim AS builder
WORKDIR /app

# python3/make/g++ are needed to compile better-sqlite3 from source when no prebuilt
# binary matches the platform.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Next collects page data at build time. Nothing here touches the database — every page
# is `force-dynamic` — but the directory must exist for the module to load.
RUN mkdir -p data && npm run build

# --- runtime -----------------------------------------------------------------
FROM node:24-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
# Bind to all interfaces so the container is reachable from the LAN, not just itself.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Drop root. The volume is chowned in compose so the sync scripts can still write.
RUN groupadd --system --gid 1001 keystone \
    && useradd --system --uid 1001 --gid keystone keystone

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
# public/ is kept (with a .gitkeep) purely so this COPY resolves — the app serves no
# static assets of its own, all artwork comes from Blizzard's and Wowhead's CDNs.
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts

# Needed at runtime, not just build: the ETL scripts and migrations run inside this
# container via `docker compose exec`.
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/config ./config

RUN mkdir -p data && chown -R keystone:keystone /app/data
USER keystone

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "run", "start"]
