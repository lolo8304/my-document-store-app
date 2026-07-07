#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_CONTEXT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DOCKERFILE="${SCRIPT_DIR}/Dockerfile"

IMAGE_NAME="${IMAGE_NAME:-my-document-store:latest}"
CONTAINER_NAME="${CONTAINER_NAME:-my-document-store}"
HOST_APP_PORT="${HOST_APP_PORT:-3001}"
HOST_API_PORT="${HOST_API_PORT:-3000}"
DOCKER_PLATFORM="${DOCKER_PLATFORM:-linux/amd64}"
BUILD_IMAGE=true
START_ONLY=false
ENDPOINT_OVERRIDE="http://192.168.1.107:3000"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-build|--no)
      BUILD_IMAGE=false
      shift
      ;;
    --start)
      START_ONLY=true
      shift
      ;;
    --endpoint)
      if [[ $# -lt 2 ]]; then
        echo "--endpoint requires a URL" >&2
        echo "Usage: $0 [--no-build|--no] [--start] [--endpoint URL] [--arm|--amd|--intel|--x86]" >&2
        exit 1
      fi
      ENDPOINT_OVERRIDE="$2"
      shift 2
      ;;
    --arm)
      DOCKER_PLATFORM="linux/arm64"
      shift
      ;;
    --amd|--intel|--x86)
      DOCKER_PLATFORM="linux/amd64"
      shift
      ;;
    *)
      echo "Unknown option: $1" >&2
      echo "Usage: $0 [--no-build|--no] [--start] [--endpoint URL] [--arm|--amd|--intel|--x86]" >&2
      exit 1
      ;;
  esac
done

if [[ "${START_ONLY}" == "true" ]]; then
  echo "Starting existing container ${CONTAINER_NAME}"
  docker start "${CONTAINER_NAME}"
  echo "Started ${CONTAINER_NAME}"
  echo "App: http://localhost:${HOST_APP_PORT}"
  echo "API: http://localhost:${HOST_API_PORT}"
  exit 0
fi

APP_ENV_FILE="${APP_ENV_FILE:-${SCRIPT_DIR}/.env}"
API_ENV_FILE="${API_ENV_FILE:-${SCRIPT_DIR}/../my-document-store-api/.env}"

if [[ ! -f "${API_ENV_FILE}" ]]; then
  echo "API env file not found: ${API_ENV_FILE}" >&2
  exit 1
fi

read_env_value() {
  local file="$1"
  local key="$2"

  if [[ ! -f "${file}" ]]; then
    return 1
  fi

  awk -F= -v key="${key}" '
    $0 !~ /^[[:space:]]*#/ && $1 == key {
      sub(/^[^=]*=/, "")
      gsub(/\r$/, "")
      print
      exit
    }
  ' "${file}"
}

VITE_API_BASE_URL="$(read_env_value "${APP_ENV_FILE}" VITE_API_BASE_URL || true)"
VITE_API_KEY="$(read_env_value "${APP_ENV_FILE}" VITE_API_KEY || true)"

VITE_API_BASE_URL="${VITE_API_BASE_URL:-http://localhost:3000}"
VITE_API_BASE_URL="${ENDPOINT_OVERRIDE:-${VITE_API_BASE_URL}}"
VITE_API_KEY="${VITE_API_KEY:-my-document-store-key}"

ENV_ARGS=()
if [[ -f "${APP_ENV_FILE}" ]]; then
  ENV_ARGS+=(--env-file "${APP_ENV_FILE}")
fi
ENV_ARGS+=(--env-file "${API_ENV_FILE}")

if [[ "${BUILD_IMAGE}" == "true" ]]; then
  echo "Building ${IMAGE_NAME}"
  docker build \
    --file "${DOCKERFILE}" \
    --tag "${IMAGE_NAME}" \
    --platform "${DOCKER_PLATFORM}" \
    --build-arg "VITE_API_BASE_URL=${VITE_API_BASE_URL}" \
    --build-arg "VITE_API_KEY=${VITE_API_KEY}" \
    "${BUILD_CONTEXT}"
else
  echo "Skipping build, using existing image ${IMAGE_NAME}"
fi

echo "Using app env: ${APP_ENV_FILE}"
echo "Using API env: ${API_ENV_FILE}"

echo "Replacing container ${CONTAINER_NAME}"
docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true

docker save -o my-document-store.tar my-document-store:latest

echo "Starting ${CONTAINER_NAME}"
docker run -d \
  --name "${CONTAINER_NAME}" \
  --restart unless-stopped \
  --platform "${DOCKER_PLATFORM}" \
  -p "${HOST_APP_PORT}:80" \
  -p "${HOST_API_PORT}:3000" \
  "${ENV_ARGS[@]}" \
  "${IMAGE_NAME}"

echo "Started ${CONTAINER_NAME}"
echo "App: http://localhost:${HOST_APP_PORT}"
echo "API: http://localhost:${HOST_API_PORT}"

