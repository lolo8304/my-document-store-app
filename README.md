# my-document-store

React + Tailwind search UI for scanned Dropbox documents.

## Setup

Copy `.env.example` into `.env` and set the API URL/key if needed.

```bash
npm install
npm run dev
```

The app expects the API at `http://localhost:3000` and runs on
`http://localhost:3001` by default.

## Docker

The Docker image contains both the React app and NestJS API. The app is served
by nginx on container port `80`; the API listens on container port `3000`.
Poppler and Tesseract German/English/French OCR packages are installed in the image.

Build and run from this folder:

```bash
docker compose -f docker-compose.yml up --build
```

Port mappings:

- `localhost:3001` -> container `80`
- `localhost:3000` -> container `3000`

The compose file loads API secrets from `../my-document-store-api/.env`.
