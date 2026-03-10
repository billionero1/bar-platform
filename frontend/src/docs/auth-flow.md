# Auth Flow (актуально)

Документ отражает текущую реализацию аутентификации на `sid`-сессиях.

## 1. Что используется

- Серверная таблица `sessions`.
- `httpOnly` cookie `sid` (имя задаётся через `COOKIE_NAME`).
- CSRF-модель `double-submit`:
  - `GET /v1/auth/csrf-token` возвращает токен и ставит CSRF-cookie.
  - Все mutating-запросы (`POST/PUT/PATCH/DELETE`) идут с заголовком `X-CSRF-Token`.

## 2. Эндпоинты

- `GET /v1/auth/has-session` — проверка живой sid-сессии и получение профиля.
- `POST /v1/auth/login-password` — логин по телефону/паролю.
- `POST /v1/auth/logout` — logout + revoke сессии.
- `POST /v1/auth/request-verify` — отправка кода подтверждения для регистрации.
- `POST /v1/auth/verify-code` — проверка кода подтверждения, создание временной отметки `phone_verifications`.
- `POST /v1/auth/register-user` — регистрация пользователя (требует предварительно подтверждённый номер).
- `POST /v1/auth/request-reset` — отправка кода восстановления.
- `POST /v1/auth/reset-password` — проверка кода + смена пароля + новая sid-сессия.
- `POST /v1/auth/establishments` — создание заведения для авторизованного пользователя.

## 3. Важные правила

- PIN-контур (`unlock/update-pin/has_pin/need_pin`) в текущей версии **не используется**.
- Верификация регистрации обязательна на бэкенде:
  - Без успешного `verify-code` `register-user` вернёт `403 phone_not_verified`.
- Для SMS-кодов действует ограничение попыток (`attempts_left`), при исчерпании — `429 too_many_attempts`.

## 4. Фронтенд

- Инициализация идёт через `AuthContext` + `api()` из `src/shared/api/api.ts`.
- `api()` автоматически:
  - добавляет `credentials: include`,
  - инициирует CSRF,
  - повторяет mutating-запрос при `CSRF_TOKEN_INVALID` после рефреша токена.
