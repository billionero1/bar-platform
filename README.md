# Bar Platform

Monorepo для платформы сотрудников общепита:

- `backend/` — API на Express + PostgreSQL
- `frontend/` — React + Vite (web/PWA)
- `ops/` — deployment и webhook-инструменты
- `redirect-service/` — отдельный сервис редиректа

## Что реализовано в текущем скоупе

- Единый workspace по ролям (`manager` / `staff` / `solo`)
- Модули: ингредиенты, заготовки, коктейли, обучение, тесты, документация, заявки, команда
- Invite/onboarding сотрудников + пооперационная матрица прав
- Серверные API: `/v1/ingredients`, `/v1/preparations`, `/v1/cocktails`, `/v1/forms`, `/v1/team`, `/v1/training`, `/v1/analytics`
- Калькуляторы себестоимости для заготовок и коктейлей
- PWA (manifest + service worker)

## Локальный запуск (macOS/Linux)

### 1) Подготовка env

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Готовые VPS-шаблоны с комментариями:

- `ops/env/backend.vps.env`
- `ops/env/frontend.vps.env`

Заполните в `backend/.env` минимум:

- `PG*` параметры базы
- `JWT_SECRET` (обязателен)

### 2) Установка зависимостей

```bash
npm run setup
```

### 3) Запуск

```bash
npm --prefix backend run dev
npm --prefix frontend run dev
```

### 4) (Опционально) демо-данные

```bash
node backend/scripts/seed_demo.mjs
```

## Миграции

- При старте backend выполняет versioned-миграции из `backend/migrations`.
- Деструктивный reset вынесен из автоконтура в `/backend/scripts/sql/reset_public_schema.sql`.
- Для аварийного локального сброса запускай reset вручную, а не через обычный старт приложения.

## Проверка качества

```bash
npm run check
```

Проверяет:

- backend syntax/lint + unit tests
- frontend typecheck + unit tests + production build

## Ротация секретов (prod/staging)

Важно: это админ-процедура, не для ежедневной работы платформы.
Запускается только при первом прод-запуске или плановой смене секретов.

Быстрая команда-шпаргалка:

```bash
npm --prefix backend run secrets:rotate -- --env .env --in-place
```

1. Сгенерировать новые секреты в отдельный файл:

```bash
npm --prefix backend run secrets:rotate -- --env .env --out .env.rotated
```

2. Применить DB пароль в PostgreSQL (команду скрипт выводит в консоль), затем заменить `backend/.env`:

```bash
mv backend/.env.rotated backend/.env
```

3. Проверить env-политику:

```bash
NODE_ENV=production npm --prefix backend run env:check
```

## Проверка OTP на staging

Запусти smoke-check (реально отправляет код через настроенный провайдер):

```bash
API_BASE_URL=https://staging.example.com \
OTP_TEST_PHONE=79991234567 \
ENV_PATH=backend/.env \
./ops/staging/otp_smoke.sh
```

`ops/deploy.sh` also runs `env:check` automatically; if `OTP_TEST_PHONE` is exported on server, it additionally runs `otp:probe` before backend restart.

Для Telegram bind-flow (привязка телефона -> chat_id) нужен отдельный auth-бот:

- `OTP_TELEGRAM_BOT_TOKEN` — токен auth-бота (не VPN-бота)
- `OTP_TELEGRAM_BOT_USERNAME` — username auth-бота без `@`
- `OTP_TELEGRAM_BIND_SECRET` — секрет webhook URL

Webhook у бота должен смотреть в backend бара:

```bash
curl -sS -X POST "https://api.telegram.org/bot${OTP_TELEGRAM_BOT_TOKEN}/setWebhook" \
  -d "url=https://bar-calc.ru/v1/auth/telegram/webhook/${OTP_TELEGRAM_BIND_SECRET}"
```

## CI

GitHub Actions: `.github/workflows/ci.yml`.

## VPS Runbook

Подробный гайд под сценарий "VPN-бот уже живет на сервере, бар-платформа отдельно":

- `ops/VPS_DEPLOY_RU.md`
