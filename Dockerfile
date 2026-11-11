# EstateMaster server (Express API + the web app). Used by Google Cloud Run, Render, Fly.io, etc.
# Build:  docker build -t estatemaster .        Run:  docker run -p 8080:8080 --env-file .env estatemaster

FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
# `npm install` (not `npm ci`): package-lock.json predates firebase-admin / pdfkit. Run `npm install` locally and commit
# the refreshed lockfile, then this can become `npm ci`.
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:20-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
# The server bundle keeps its dependencies external, so production node_modules are required at runtime.
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY public ./public
USER node
# Cloud Run supplies PORT (8080). The server listens on it.
ENV PORT=8080
EXPOSE 8080
CMD ["node", "dist/server.cjs"]
