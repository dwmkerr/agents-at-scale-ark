FROM node:24-alpine AS builder

WORKDIR /workspace
COPY package.json package-lock.json* ./
RUN npm ci --only=production

COPY . .
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

COPY --from=builder --chown=nodejs:nodejs /workspace/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /workspace/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /workspace/package.json ./package.json

USER nodejs

EXPOSE 8080

CMD ["node", "dist/server.js"]