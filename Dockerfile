FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json yarn.lock* pnpm-lock.yaml* ./
RUN if [ -f pnpm-lock.yaml ]; then npm i -g pnpm && pnpm install --frozen-lockfile; \
    elif [ -f yarn.lock ]; then yarn install --frozen-lockfile; \
    elif [ -f package-lock.json ]; then npm ci; \
    else npm install; fi
COPY . .
RUN npm run build || true

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app .
EXPOSE 8080
ENV PORT=8080
CMD ["npm", "start"]
