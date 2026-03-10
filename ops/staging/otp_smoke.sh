#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACK_DIR="$ROOT_DIR/backend"
ENV_PATH="${ENV_PATH:-$BACK_DIR/.env}"
API_BASE_URL="${API_BASE_URL:-}"
OTP_TEST_PHONE="${OTP_TEST_PHONE:-}"

if [[ -z "$API_BASE_URL" ]]; then
  echo "ERROR: API_BASE_URL is required (example: https://staging.bar-calc.ru)"
  exit 1
fi

if [[ -z "$OTP_TEST_PHONE" ]]; then
  echo "ERROR: OTP_TEST_PHONE is required (example: 79991234567)"
  exit 1
fi

echo "===> env check"
NODE_ENV=production node "$BACK_DIR/scripts/check_env.mjs" --env "$ENV_PATH"

echo "===> health check: $API_BASE_URL/healthz"
curl -fsS "$API_BASE_URL/healthz" >/dev/null

echo "===> otp provider probe"
NODE_ENV=production node "$BACK_DIR/scripts/otp_probe.mjs" --env "$ENV_PATH" --phone "$OTP_TEST_PHONE" --purpose verify

echo "===> staging otp smoke: OK"
