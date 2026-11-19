FROM node:22-slim AS build
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
# The host mounts a persistent disk here (see render.yaml). Hosts mount disks as root,
# so the app runs as root to be able to write the database.
ENV DB_PATH=/data/tailormade.db
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
EXPOSE 8787
CMD ["node", "--disable-warning=ExperimentalWarning", "dist/index.js"]
