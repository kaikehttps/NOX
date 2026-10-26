# Build a partir da raiz do monorepo:
#   docker build -f services/api/Dockerfile -t nox-api .
FROM node:22-slim AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/validation/package.json packages/validation/
COPY services/api/package.json services/api/
RUN npm ci --workspace @nox/api --include-workspace-root=false --ignore-scripts
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/validation packages/validation
COPY services/api services/api
# Empacota o código próprio e os pacotes internos; dependências externas ficam em node_modules.
RUN npx esbuild services/api/src/server.ts --bundle --platform=node --target=node22 --format=esm \
      --outfile=services/api/dist/server.mjs \
      --external:firebase-admin --external:livekit-server-sdk --external:hono --external:@hono/node-server

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN echo '{"private":true}' > package.json && npm install --omit=dev --ignore-scripts --no-audit --no-fund \
      firebase-admin@^14.5.0 livekit-server-sdk@^2.19.2 hono@^4.13.14 @hono/node-server@^2.1.5
COPY --from=build /repo/services/api/dist/server.mjs ./server.mjs
USER node
EXPOSE 8080
ENV PORT=8080
CMD ["node", "server.mjs"]
