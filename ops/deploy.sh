#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="/home/app/bar-platform"
FRONT_DIR="$REPO_DIR/frontend"
BACK_DIR="$REPO_DIR/backend"
WEB_ROOT="/var/www/bar-frontend"

log(){ echo -e "\n===> $*"; }

# Определяем дефолтную ветку origin (main/master/и т.п.)
cd "$REPO_DIR"
DEFAULT_BRANCH="$(git remote show origin | sed -n 's/.*HEAD branch: //p')"
if [ -z "${DEFAULT_BRANCH:-}" ]; then
  # Фоллбэк: если HEAD не настроен, пробуем main, затем master
  if git ls-remote --exit-code --heads origin main >/dev/null 2>&1; then
    DEFAULT_BRANCH="main"
  elif git ls-remote --exit-code --heads origin master >/dev/null 2>&1; then
    DEFAULT_BRANCH="master"
  else
    echo "Не смог определить ветку. Настрой origin/HEAD или укажи ветку вручную."
    exit 1
  fi
fi

log "git pull ($DEFAULT_BRANCH)"
git fetch --all --prune
git reset --hard "origin/$DEFAULT_BRANCH"

log "backend deps"
cd "$BACK_DIR"
if [ -f package-lock.json ]; then
  npm ci --no-audit --no-fund
else
  npm install --no-audit --no-fund
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

# Права для nginx
if id -u www-data >/dev/null 2>&1; then
  sudo chown -R www-data:www-data "$WEB_ROOT"
fi
sudo find "$WEB_ROOT" -type d -exec chmod 755 {} \;
sudo find "$WEB_ROOT" -type f -exec chmod 644 {} \;

log "reload nginx"
sudo nginx -t
sudo systemctl reload nginx

log "done at $(date -Iseconds)"
