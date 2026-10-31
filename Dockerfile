# last_tenant: the client is built on the Mac (pnpm build -> client/dist) and copied in; the server has no npm
# dependencies (node:http), so the image builds offline.
FROM node:22-alpine
WORKDIR /app
COPY server/src server/src
COPY client/dist public
ENV NODE_ENV=production PUBLIC_DIR=/app/public PORT=2567
EXPOSE 2567
WORKDIR /app/server
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:2567/health || exit 1
CMD ["node", "src/index.ts"]
