FROM node:22-alpine AS deps
WORKDIR /app
ENV DATABASE_URL=postgresql://vacuum_user:vacuum_pass@localhost:5432/vacuum_traceability?schema=public

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

FROM deps AS migration
WORKDIR /app

CMD ["npx", "prisma", "migrate", "deploy"]

FROM node:22-alpine AS builder
WORKDIR /app
ENV DATABASE_URL=postgresql://vacuum_user:vacuum_pass@localhost:5432/vacuum_traceability?schema=public

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-alpine AS production
WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
RUN npm prune --omit=dev

COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/src/main.js"]
