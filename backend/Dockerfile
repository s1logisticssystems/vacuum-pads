FROM node:22-alpine AS deps
WORKDIR /app
ENV DATABASE_URL=postgresql://vacuum_user:vacuum_pass@localhost:5432/vacuum_traceability?schema=public

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

FROM deps AS migration
WORKDIR /app

# Maintenance tooling ships alongside the migration job: this stage keeps the
# dev dependencies (tsx, the Prisma CLI) that the production image drops, so it
# is also where operators bootstrap the first administrator account and reset
# forgotten passwords.
COPY scripts ./scripts

# Run as the unprivileged "node" user (uid 1000) that the base image already
# provides, instead of root.
USER node

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

# Install production dependencies from scratch rather than copying the build
# stage's node_modules and pruning: pruning left dev-only tooling (the Prisma
# CLI and its transitive deps) in the shipped image. Only the generated Prisma
# client is carried over from the builder, since generating it needs the CLI.
COPY package*.json ./
# The Prisma CLI is a peer dependency of @prisma/client, so npm resolves it as
# part of the production tree and no --omit flag removes it. The running server
# never loads it (generate and migrate happen in the builder/migration stages),
# so it is dropped explicitly along with its exclusive dependencies. This is
# what clears the remaining high-severity advisories from the shipped image.
RUN npm ci --omit=dev \
 && rm -rf node_modules/prisma \
           node_modules/@prisma/config \
           node_modules/deepmerge-ts \
           node_modules/.bin/prisma \
 && npm cache clean --force

COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/dist ./dist

# Drop root. The runtime only reads from /app (repair photos go to S3/MinIO and
# the filesystem fallback is disabled when NODE_ENV=production), so no write
# access to the image filesystem is required.
USER node

EXPOSE 3000

CMD ["node", "dist/src/main.js"]
