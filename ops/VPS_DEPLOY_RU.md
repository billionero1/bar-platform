# VPS Deploy (отдельно от VPN-бота)

Этот план учитывает, что на сервере уже живет VPN Telegram-бот в:
`/opt/vpn-bot/telegram-bot-final`

Новый проект бара поднимается отдельно в:
`/opt/bar-platform`

И отдельный PostgreSQL инстанс/кластер — на порту `5433` (не смешивается с БД VPN-бота).

## 0. Можно ли сделать так, как ты описал?

Да, это полностью рабочая схема:
1. Отдельная директория проекта: `/opt/bar-platform`
2. Отдельная БД (другой кластер/порт): `127.0.0.1:5433`
3. Отдельный systemd-сервис backend: `bar-backend.service`

VPN-бот не должен пострадать, если не трогать его директорию, его systemd unit и его порты.

## 1. Подготовка сервера

```bash
sudo apt update
sudo apt install -y git curl rsync nginx postgresql postgresql-contrib jq
```

Node.js 22:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

## 2. Пользователь и директория проекта

```bash
sudo useradd -m -s /bin/bash barapp || true
sudo mkdir -p /opt/bar-platform
sudo chown -R barapp:barapp /opt/bar-platform
```

Клонирование проекта:

```bash
sudo -u barapp git clone <REPO_URL> /opt/bar-platform
```

Если репозиторий уже есть:

```bash
sudo -u barapp bash -lc 'cd /opt/bar-platform && git pull'
```

## 3. Отдельный PostgreSQL кластер для бара (порт 5433)

Проверяем существующие кластеры:

```bash
sudo pg_lsclusters
```

Создаем новый кластер (пример для PostgreSQL 17):

```bash
sudo pg_createcluster 17 bar --start -- --port=5433
```

Если у тебя другая версия PostgreSQL, замени `17` на свою.

Создаем отдельную роль и БД:

```bash
sudo -u postgres psql -p 5433 -c "CREATE ROLE bar_platform_user WITH LOGIN PASSWORD 'REPLACE_DB_PASSWORD';"
sudo -u postgres psql -p 5433 -c "CREATE DATABASE bar_platform OWNER bar_platform_user;"
```

## 4. Подготовка .env файлов

Готовые шаблоны лежат в репозитории:
- `ops/env/backend.vps.env`
- `ops/env/frontend.vps.env`

Копируем в рабочие .env:

```bash
sudo -u barapp cp /opt/bar-platform/ops/env/backend.vps.env /opt/bar-platform/backend/.env
sudo -u barapp cp /opt/bar-platform/ops/env/frontend.vps.env /opt/bar-platform/frontend/.env
```

Редактируем:

```bash
sudo -u barapp nano /opt/bar-platform/backend/.env
sudo -u barapp nano /opt/bar-platform/frontend/.env
```

Права на секреты:

```bash
sudo chown barapp:barapp /opt/bar-platform/backend/.env /opt/bar-platform/frontend/.env
sudo chmod 600 /opt/bar-platform/backend/.env
sudo chmod 600 /opt/bar-platform/frontend/.env
```

## 5. Telegram OTP (код в Telegram)

1. Создай бота через `@BotFather`, получи токен.
2. Напиши боту `/start` (или добавь его в нужный чат/группу и отправь сообщение).
3. Узнай `chat_id`:

```bash
curl -s "https://api.telegram.org/bot<BOT_TOKEN>/getUpdates" | jq .
```

4. Вставь в `backend/.env`:
- `OTP_PROVIDER_ORDER=telegram`
- `OTP_TELEGRAM_BOT_TOKEN=<BOT_TOKEN>`
- `OTP_TELEGRAM_CHAT_IDS=<CHAT_ID>`

## 6. Установка зависимостей и сборка

```bash
sudo -u barapp bash -lc 'cd /opt/bar-platform && npm run setup'
sudo -u barapp bash -lc 'cd /opt/bar-platform/frontend && npm run build'
```

## 7. Проверка env и OTP до старта

```bash
sudo -u barapp bash -lc 'cd /opt/bar-platform/backend && NODE_ENV=production npm run env:check'
sudo -u barapp bash -lc 'cd /opt/bar-platform/backend && NODE_ENV=production npm run otp:probe -- --env .env --phone 79991234567 --purpose verify'
```

## 8. Systemd сервис backend

Создай файл `/etc/systemd/system/bar-backend.service`:

```ini
[Unit]
Description=Bar Platform Backend
After=network.target

[Service]
Type=simple
User=barapp
WorkingDirectory=/opt/bar-platform/backend
EnvironmentFile=/opt/bar-platform/backend/.env
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

Включи и запусти:

```bash
sudo systemctl daemon-reload
sudo systemctl enable bar-backend
sudo systemctl restart bar-backend
sudo systemctl status bar-backend --no-pager
```

## 9. Nginx (frontend + /v1 proxy)

Скопируй шаблон:

```bash
sudo cp /opt/bar-platform/ops/bar-frontend.nginx.sample /etc/nginx/sites-available/bar-platform
```

Отредактируй домен(ы), затем:

```bash
sudo ln -sf /etc/nginx/sites-available/bar-platform /etc/nginx/sites-enabled/bar-platform
sudo nginx -t
sudo systemctl reload nginx
```

Сертификат (если нужен):

```bash
sudo certbot --nginx -d bar.example.com -d www.bar.example.com
```

## 10. Публикация frontend

```bash
sudo mkdir -p /var/www/bar-frontend
sudo rsync -a --delete /opt/bar-platform/frontend/dist/ /var/www/bar-frontend/
sudo chown -R www-data:www-data /var/www/bar-frontend
```

## 11. Деплой одной командой (дальше)

В проекте есть `ops/deploy.sh` (по умолчанию работает с `/opt/bar-platform`).

Пример:

```bash
cd /opt/bar-platform
OTP_TEST_PHONE=79991234567 ./ops/deploy.sh
```

Если основной код у тебя не в `master`, укажи ветку явно:

```bash
cd /opt/bar-platform
DEPLOY_BRANCH=dev-local OTP_TEST_PHONE=79991234567 ./ops/deploy.sh
```

Важно: `DEPLOY_BRANCH` должна существовать на GitHub (`origin/<branch>`), иначе скрипт остановится с ошибкой.

## 12. Проверка после запуска

```bash
curl -fsS https://bar.example.com/healthz
curl -fsS https://bar.example.com/v1/auth/csrf-token
```

Если оба ответа корректны, backend и nginx связаны правильно.
