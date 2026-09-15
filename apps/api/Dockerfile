FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/
RUN npm install --omit=dev --workspace apps/api --include-workspace-root

COPY apps/api apps/api

WORKDIR /app/apps/api
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "src/server.js"]
