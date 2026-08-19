# syntax=docker/dockerfile:1
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate --schema=apps/identity-service/prisma/schema.prisma
RUN npx nest build identity-service

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY apps/identity-service/prisma ./apps/identity-service/prisma
RUN npx prisma generate --schema=apps/identity-service/prisma/schema.prisma
COPY --from=build /app/dist/apps/identity-service ./dist/apps/identity-service
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/apps/identity-service/main.js"]
