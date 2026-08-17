# syntax=docker/dockerfile:1
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate --schema=apps/sales-service/prisma/schema.prisma
RUN npx nest build sales-service

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY apps/sales-service/prisma ./apps/sales-service/prisma
RUN npx prisma generate --schema=apps/sales-service/prisma/schema.prisma
COPY --from=build /app/dist/apps/sales-service ./dist/apps/sales-service
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3002/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/apps/sales-service/main.js"]
