# =============================================================================
# Stage 1 — Build the Vite PWA
# =============================================================================
FROM node:20-alpine AS frontend-build

WORKDIR /app/farmer-frontend

# Firebase client-side config — public values, safe as build args
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID

ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY
ENV VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN
ENV VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID
ENV VITE_FIREBASE_STORAGE_BUCKET=$VITE_FIREBASE_STORAGE_BUCKET
ENV VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID
ENV VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID

COPY farmer-frontend/package*.json ./
RUN npm ci

COPY farmer-frontend/ ./
RUN npm run build
# Output: /app/farmer-frontend/dist

# =============================================================================
# Stage 2 — Production image
# =============================================================================
FROM node:20-alpine AS production

WORKDIR /app

# Install backend dependencies
COPY farmer-backend/package*.json ./
RUN npm ci --omit=dev

# Copy backend source
COPY farmer-backend/ ./

# Copy the built PWA into the location Fastify serves static files from
COPY --from=frontend-build /app/farmer-frontend/dist ./public

EXPOSE 8080

ENV NODE_ENV=production
ENV PORT=8080

CMD ["node", "server/server.js"]