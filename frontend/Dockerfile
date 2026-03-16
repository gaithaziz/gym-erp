FROM node:22-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/i18n/package.json ./packages/i18n/package.json
RUN npm ci

FROM node:22-alpine AS builder

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_API_URL=/api/v1
ARG BACKEND_INTERNAL_URL=http://backend:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV BACKEND_INTERNAL_URL=$BACKEND_INTERNAL_URL

COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/package-lock.json ./package-lock.json
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/frontend/package.json ./frontend/package.json
COPY --from=deps /app/frontend/node_modules ./frontend/node_modules
COPY --from=deps /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=deps /app/packages/i18n/package.json ./packages/i18n/package.json
COPY frontend ./frontend
COPY packages ./packages

RUN npm install --no-save @tailwindcss/oxide-linux-x64-musl@$(node -p "require('./frontend/node_modules/@tailwindcss/oxide/package.json').version")
RUN npm run build --workspace frontend

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

COPY --from=builder /app/frontend/.next/standalone ./
COPY --from=builder /app/frontend/.next/static ./frontend/.next/static
COPY --from=builder /app/frontend/public ./frontend/public

EXPOSE 3000

CMD ["node", "frontend/server.js"]
