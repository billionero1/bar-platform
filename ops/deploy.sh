#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/bar-platform}"
FRONT_DIR="${FRONT_DIR:-$REPO_DIR/frontend}"
BACK_DIR="${BACK_DIR:-$REPO_DIR/backend}"
WEB_ROOT="${WEB_ROOT:-/var/www/bar-frontend}"

log() { echo -e "\n===> $*"; }

cd "$REPO_DIR"

DEPLOY_BRANCH="${DEPLOY_BRANCH:-}"
if [ -z "$DEPLOY_BRANCH" ]; then
  # Detect default remote branch (main/master/etc.)
  DEFAULT_BRANCH="$(git remote show origin | sed -n 's/.*HEAD branch: //p')"
  if [ -z "${DEFAULT_BRANCH:-}" ]; then
    if git ls-remote --exit-code --heads origin main >/dev/null 2>&1; then
      DEFAULT_BRANCH="main"
    elif git ls-remote --exit-code --heads origin master >/dev/null 2>&1; then
      DEFAULT_BRANCH="master"
    else
      echo "Could not detect default branch from origin."
      exit 1
    fi
  fi
  DEPLOY_BRANCH="$DEFAULT_BRANCH"
fi

if ! git ls-remote --exit-code --heads origin "$DEPLOY_BRANCH" >/dev/null 2>&1; then
  echo "Remote branch not found: origin/$DEPLOY_BRANCH"
  exit 1
fi

log "git pull ($DEPLOY_BRANCH)"
git fetch --all --prune
git reset --hard "origin/$DEPLOY_BRANCH"

log "backend deps"
cd "$BACK_DIR"
if [ -f package-lock.json ]; then
  npm ci --no-audit --no-fund
else
  npm install --no-audit --no-fund
fi

log "backend env policy check (production)"
NODE_ENV=production npm run env:check

if [ -n "${OTP_TEST_PHONE:-}" ]; then
  log "backend otp probe (production)"
  NODE_ENV=production npm run otp:probe -- --env .env --phone "$OTP_TEST_PHONE" --purpose verify
fi

log "restart backend (systemd)"
sudo systemctl restart bar-backend
sleep 1
sudo systemctl is-active --quiet bar-backend && echo "backend: OK" || (echo "backend: FAIL" && exit 1)

log "frontend build"
cd "$FRONT_DIR"
if [ -f package-lock.json ]; then
  npm ci --no-audit --no-fund
else
  npm install --no-audit --no-fund
fi
npm run build

log "publish frontend to $WEB_ROOT"
sudo mkdir -p "$WEB_ROOT"
sudo rsync -a --delete "$FRONT_DIR/dist/" "$WEB_ROOT/"

if id -u www-data >/dev/null 2>&1; then
  sudo chown -R www-data:www-data "$WEB_ROOT"
fi
sudo find "$WEB_ROOT" -type d -exec chmod 755 {} \;
sudo find "$WEB_ROOT" -type f -exec chmod 644 {} \;

log "reload nginx"
sudo nginx -t
sudo systemctl reload nginx

log "done at $(date -Iseconds)"
