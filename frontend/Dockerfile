FROM node:22-slim AS deps

WORKDIR /app

COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/i18n/package.json ./packages/i18n/package.json
RUN npm install

FROM node:22-slim AS builder

WORKDIR /app

ARG BACKEND_INTERNAL_URL=http://backend:8000
ENV NEXT_TELEMETRY_DISABLED=1
ENV BACKEND_INTERNAL_URL=${BACKEND_INTERNAL_URL}

COPY --from=deps /app/ ./
COPY frontend/ ./frontend/
COPY packages/ ./packages/

RUN npm run build --workspace frontend

FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

COPY --from=builder /app/frontend/.next/standalone ./
COPY --from=builder /app/frontend/.next/static ./frontend/.next/static
COPY --from=builder /app/frontend/public ./frontend/public

EXPOSE 3000

CMD ["node", "frontend/server.js"]
