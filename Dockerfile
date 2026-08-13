FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json eslint.config.js ./
COPY src ./src
COPY scripts ./scripts
COPY db ./db
COPY web ./web
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/db ./db
COPY --from=build /app/web ./web
COPY --from=build /app/package.json ./package.json
RUN mkdir -p /data
EXPOSE 4001
CMD ["node", "dist/scripts/prod-server.js"]
