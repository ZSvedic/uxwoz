# UX Woz as one long-running Bun process. The screen cache lives on a volume mounted at /data.
# Railway builds this file as it is and sets PORT itself; 8080 is the fallback elsewhere.
FROM oven/bun:1.3.11-slim
WORKDIR /app/src

# Install first, so a code change does not reinstall.
COPY src/package.json src/bun.lock src/bunfig.toml src/tsconfig.json ./
COPY src/packages/core/package.json packages/core/
COPY src/packages/web/package.json packages/web/
RUN bun install --frozen-lockfile

COPY src/packages packages

ENV NODE_ENV=production \
    UXWOZ_HOST=0.0.0.0 \
    PORT=8080 \
    UXWOZ_CACHE_FILE=/data/screen-cache.json
EXPOSE 8080
CMD ["bun", "packages/web/src/server.ts"]
