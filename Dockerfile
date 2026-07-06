# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS api-build

WORKDIR /build/api
COPY my-document-store-api/package*.json ./
RUN npm ci
COPY my-document-store-api/nest-cli.json ./
COPY my-document-store-api/tsconfig*.json ./
COPY my-document-store-api/src ./src
RUN npm run build && npm prune --omit=dev


FROM node:24-bookworm-slim AS app-build

ARG VITE_API_BASE_URL=http://localhost:3000
ARG VITE_API_KEY=my-document-store-key
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_API_KEY=${VITE_API_KEY}

WORKDIR /build/app
COPY my-document-store-app/package*.json ./
RUN npm ci
COPY my-document-store-app/index.html ./
COPY my-document-store-app/tsconfig*.json ./
COPY my-document-store-app/vite.config.ts ./
COPY my-document-store-app/postcss.config.js ./
COPY my-document-store-app/tailwind.config.js ./
COPY my-document-store-app/src ./src
RUN npm run build


FROM node:24-bookworm-slim AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    nginx \
    poppler-utils \
    supervisor \
    tesseract-ocr \
    tesseract-ocr-deu \
    tesseract-ocr-eng \
    tesseract-ocr-fra \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3000
ENV OCR_LANGUAGES=deu+eng+fra
ENV NODE_ENV=production
ENV PORT=3000
ENV APP_CORS_ORIGIN=http://192.168.1.107:3001
ENV OCR_LANGUAGES=deu+eng+fra
ENV MY_DOCUMENT_STORE_API_KEY=replace
ENV MONGODB_URI=mongodb+srv://lolo8304:od5vcG8kiUVBqKuY@app-fcrww.3llam.mongodb.net/?appName=app-fcrww
ENV MONGODB_DB_NAME=my-document-store-local
ENV DROPBOX_BASE_LOCATION=/localhost
ENV DROPBOX_ACCESS_TOKEN=replace
ENV DROPBOX_REFRESH_TOKEN=replace
ENV DROPBOX_SOURCE_FOLDER=/From_BrotherDevice
ENV DROPBOX_SYNC_INTERVAL_MS=60000
ENV DROPBOX_CLIENT_ID=5iec59wlnfjxusl
ENV DROPBOX_CLIENT_SECRET=replace
ENV DROPBOX_REDIRECT_URL=http://192.168.1.107:3000/dropbox/authorize
ENV DROPBOX_OAUTH_SETUP_ENABLED=true
ENV OPERATIONAL_SETUP_KEY=replace
ENV OPENAI_API_KEY=replace
ENV OPENAI_EMBEDDING_MODEL=text-embedding-3-small
ENV VECTOR_INDEX_NAME=documents_vector_index
ENV OCR_TEMP_DIR=.tmp/ocr
ENV VECTOR_SEARCH_ENABLED=false
ENV OCR_AUTO_ROTATE=true
ENV OCR_DPI=300
ENV OCR_LOW_CONFIDENCE_THRESHOLD=65

WORKDIR /app/api
COPY --from=api-build /build/api/dist ./dist
COPY --from=api-build /build/api/node_modules ./node_modules
COPY --from=api-build /build/api/package*.json ./

COPY --from=app-build /build/app/dist /usr/share/nginx/html

RUN mkdir -p /run/nginx /var/log/supervisor

RUN <<'EOF'
cat > /etc/nginx/nginx.conf <<'NGINX'
user www-data;
worker_processes auto;
pid /run/nginx.pid;

events {
  worker_connections 1024;
}

http {
  include /etc/nginx/mime.types;
  default_type application/octet-stream;

  sendfile on;
  tcp_nopush on;
  keepalive_timeout 65;

  server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    location / {
      try_files $uri $uri/ /index.html;
    }

    location = /healthz {
      access_log off;
      add_header Content-Type text/plain;
      return 200 "ok\n";
    }
  }
}
NGINX
EOF

RUN <<'EOF'
cat > /etc/supervisor/conf.d/my-document-store.conf <<'SUPERVISOR'
[supervisord]
nodaemon=true
logfile=/dev/stdout
logfile_maxbytes=0
pidfile=/tmp/supervisord.pid

[program:api]
directory=/app/api
command=node dist/main.js
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0

[program:nginx]
command=nginx -g "daemon off;"
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
SUPERVISOR
EOF

EXPOSE 80 3000

CMD ["supervisord", "-c", "/etc/supervisor/conf.d/my-document-store.conf"]
