# VPS Deploy (бар-платформа отдельно от VPN-бота)

Этот runbook под твой текущий кейс:
- VPN-бот уже работает в `/opt/vpn-bot/telegram-bot-final` на `tools.bar-calc.ru`
- бар-платформа живет отдельно в `/opt/bar-platform/app`
- backend бара слушает `127.0.0.1:3001`
- отдельный PostgreSQL кластер для бара слушает `127.0.0.1:5433`

Важно: OTP-бот для бара должен быть отдельным Telegram-ботом с отдельным токеном.

## 1. Базовая установка (если еще не ставил)

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

## 2. Директория проекта

Если уже сделал клон в `/opt/bar-platform/app`, этот шаг пропусти.

```bash
sudo mkdir -p /opt/bar-platform
sudo chown -R "$USER":"$USER" /opt/bar-platform

cd /opt/bar-platform
git clone https://github.com/billionero1/bar-platform.git app
cd app
git checkout master
```

## 3. Отдельный PostgreSQL для бара (порт 5433)

Проверка кластеров:

```bash
sudo pg_lsclusters
```

Создание отдельного кластера (пример для PostgreSQL 17):

```bash
sudo pg_createcluster 17 bar --start -- --port=5433
```

Создание отдельной роли/БД:

```bash
sudo -u postgres psql -p 5433 -c "CREATE ROLE bar_platform_user WITH LOGIN PASSWORD 'REPLACE_DB_PASSWORD';"
sudo -u postgres psql -p 5433 -c "CREATE DATABASE bar_platform OWNER bar_platform_user;"
```

## 4. .env файлы (backend/frontend)

Шаблоны в репозитории:
- `ops/env/backend.vps.env`
- `ops/env/frontend.vps.env`

Копирование:

```bash
cp /opt/bar-platform/app/ops/env/backend.vps.env /opt/bar-platform/app/backend/.env
cp /opt/bar-platform/app/ops/env/frontend.vps.env /opt/bar-platform/app/frontend/.env
```

Открыть и заполнить:

```bash
nano /opt/bar-platform/app/backend/.env
nano /opt/bar-platform/app/frontend/.env
```

Критично заполнить в `backend/.env`:
- `PGPORT=5433`
- `PGDATABASE`, `PGUSER`, `PGPASSWORD`
- `JWT_SECRET`
- `CSRF_SECRET`
- `FRONTEND_ORIGIN=https://bar-calc.ru,https://www.bar-calc.ru`
- `OTP_TELEGRAM_BOT_TOKEN` (токен отдельного auth-бота)
- `OTP_TELEGRAM_BOT_USERNAME` (без `@`)
- `OTP_TELEGRAM_BIND_SECRET` (длинный случайный секрет)

Важно:
- `OTP_TELEGRAM_CHAT_IDS` оставь пустым, чтобы исключить широкую рассылку в фиксированные чаты.
- Не используй токен VPN-бота в бар-платформе.

Права на env:

```bash
chmod 600 /opt/bar-platform/app/backend/.env /opt/bar-platform/app/frontend/.env
```

## 5. Установка зависимостей и сборка frontend

```bash
cd /opt/bar-platform/app
npm run setup
npm --prefix frontend run build
```

Публикация статики в nginx root:

```bash
sudo mkdir -p /var/www/bar-frontend
sudo rsync -a --delete /opt/bar-platform/app/frontend/dist/ /var/www/bar-frontend/
sudo chown -R www-data:www-data /var/www/bar-frontend
```

## 6. Проверка env перед стартом

```bash
cd /opt/bar-platform/app/backend
NODE_ENV=production npm run env:check
```

## 7. Webhook для Telegram auth-бота

Webhook должен идти в backend бара (не в VPN-бот):

```bash
BOT_TOKEN='PASTE_AUTH_BOT_TOKEN'
BIND_SECRET='PASTE_BIND_SECRET_FROM_BACKEND_ENV'
curl -sS -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -d "url=https://bar-calc.ru/v1/auth/telegram/webhook/${BIND_SECRET}" | jq .
```

Проверить:

```bash
curl -sS "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo" | jq .
```

Ожидаемо в `url` будет `https://bar-calc.ru/v1/auth/telegram/webhook/...`.

## 8. Systemd для backend бара

Создай `/etc/systemd/system/bar-backend.service`:

```ini
[Unit]
Description=Bar Platform Backend
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/bar-platform/app/backend
EnvironmentFile=/opt/bar-platform/app/backend/.env
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

Применить:

```bash
sudo systemctl daemon-reload
sudo systemctl enable bar-backend
sudo systemctl restart bar-backend
sudo systemctl status bar-backend --no-pager
```

Логи:

```bash
sudo journalctl -u bar-backend -n 200 --no-pager
```

## 9. Nginx

У тебя уже есть `bar-calc.ru` и `tools.bar-calc.ru` как отдельные server blocks. Это корректно.

Проверка актуального конфига:

```bash
sudo nginx -T | grep -nE 'server_name|proxy_pass|bar-calc\.ru|tools\.bar-calc\.ru'
```

Требование для бара:
- `bar-calc.ru` должен раздавать `/var/www/bar-frontend`
- `location /v1/` должен проксировать в `http://127.0.0.1:3001`

## 10. Как теперь пользователь получает OTP в Telegram

1. Пользователь вводит телефон в регистрации.
2. Backend возвращает ссылку привязки к отдельному auth-боту.
3. Пользователь открывает ссылку `https://t.me/<auth_bot>?start=bind_<token>` и жмет `Start`.
4. Telegram отправляет update на webhook backend бара.
5. Backend связывает `phone -> chat_id`.
6. Пользователь нажимает в UI "Я нажал Start, проверить".
7. После подтверждения backend отправляет OTP-код в этот же чат.

Итог: код приходит адресно конкретному пользователю, а не "всем".

## 11. Быстрый smoke-check после запуска

- Открыть `https://bar-calc.ru/register`
- Ввести номер и имя
- Нажать ссылку в Telegram, нажать `Start`
- Вернуться и нажать "Я нажал Start, проверить"
- Убедиться, что код пришел в чат auth-бота

## 12. Ротация секретов (не каждый день)

Команда запускается только при первичной настройке/плановой ротации:

```bash
npm --prefix backend run secrets:rotate -- --env .env --in-place
```

Это не команда для обычного использования платформы сотрудниками.
