# ============================================
# Development stage
# ============================================
FROM node:20-alpine AS dev

WORKDIR /app

# Install dependencies for native modules
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

COPY . .

# Generate Prisma client
RUN npx prisma generate

# Development command with hot reload
CMD ["npm", "run", "dev"]

# ============================================
# Builder stage
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

COPY . .

# Generate Prisma client and build TypeScript
RUN npx prisma generate
RUN npm run build

# ============================================
# Production stage
# ============================================
FROM node:20-alpine AS prod

WORKDIR /app

# Install OpenSSL 1.1 compatibility (required by Prisma)
RUN apk add --no-cache openssl1.1-compat

# Security: Run as non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Install only production dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy Prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

# Copy compiled code from builder
COPY --from=builder /app/dist ./dist

# Set ownership
RUN chown -R nodejs:nodejs /app

USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

EXPOSE 3000

# Production command
CMD ["node", "dist/index.js"]
