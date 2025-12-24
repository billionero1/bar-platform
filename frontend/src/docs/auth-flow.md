# Auth Flow (desktop web)

Этот документ описывает актуальную схему аутентификации, блокировки по PIN и работы с серверными сессиями.

## 1. Основные сущности

### 1.1. Серверная sid-сессия

- На бэке есть таблица `sessions`.
- При успешном логине / регистрации / восстановлении пароля создаётся запись:
  - `user_id`
  - `sid_hash` (SHA-256 от сырого sid)
  - `expires_at` (фиксированный срок жизни, например 30 дней)
  - `last_activity_at` (обновляется через `ping`)
- В браузер ставится httpOnly-cookie `COOKIE_NAME` с **сырым** sid:  
  `sidPlain = uuid:randomHex`.

### 1.2. Флаги на фронте

В `AuthContext` мы оперируем следующими флагами:

- `hasSession: boolean`  
  Есть ли живущая серверная sid-сессия (по мнению фронта).
- `hasPin: boolean`  
  Создан ли у пользователя PIN.
- `needsPin: boolean`  
  Требуется ли сейчас ввод PIN для разблокировки.
- `user: UserPayload | null`  
  Данные пользователя (phone, name, роль, заведение и т.п.).
- `lastPhone: string | null`  
  Последний телефон, который мы знаем (для подсказок в формах).

Интерпретация:

- **Пользователь авторизован и разблокирован** — `hasSession === true` и `needsPin === false`.
- **Есть сессия, но экран залочен** — `hasSession === true` и `needsPin === true`.
- **Не авторизован** — `hasSession === false` (остальные значения неважны).

### 1.3. Глобальные хэндлеры ошибок

В `src/lib/api.ts` есть глобальные хэндлеры:

- `onPinRequired()` — вызывается, если сервер возвращает `401` с кодом `PIN_REQUIRED`.
- `onSessionExpired()` — вызывается, если сервер возвращает `401` с кодом `SESSION_EXPIRED`.

`AuthContext` регистрирует эти хэндлеры через `setAuthHandlers`, и внутри:

- `onPinRequired`:
  - `setHasSession(true)`
  - `setHasPin(true)`
  - `setNeedsPin(true)`
  - `broadcast('pin_required')`
- `onSessionExpired`:
  - `reset()` (чистим все флаги и `user`)
  - `broadcast('logout')`

Любой запрос через `api()` в защищённый эндпоинт автоматически попадает под эту схему.

---

## 2. Эндпоинты аутентификации

### 2.1. CSRF

- `GET /v1/auth/csrf-token`
- Возвращает токен и ставит CSRF-cookie (через `double-csrf`).
- Вызывается **перед любыми POST/PUT/DELETE** запросами (инициализация приложения).

### 2.2. Логин / регистрация / PIN

- `POST /v1/auth/login-password`  
  Вход по телефону + паролю.  
  - При успехе:
    - создаёт sid-сессию;
    - ставит sid-cookie;
    - возвращает `user` и `has_pin`;
    - фронт делает:
      - `setUser(user)`
      - `setHasSession(true)`
      - `setNeedsPin(false)`
      - `setHasPin(has_pin)`
- `POST /v1/auth/register-user`  
  Регистрация (solo) пользователя. Аналогично логину, создаёт sid-сессию.
- `POST /v1/auth/unlock`  
  Быстрый вход по PIN.  
  - При успехе:
    - проверяет PIN по текущей sid-сессии;
    - снимает `need_pin` на бэке;
    - фронт делает:
      - `setNeedsPin(false)`
      - `setHasSession(true)`
- `POST /v1/auth/update-pin`  
  Установка / смена PIN по валидной sid-сессии.

### 2.3. Восстановление доступа

- `POST /v1/auth/request-verify` — отправка кода для регистрации.
- `POST /v1/auth/request-reset` — отправка кода для восстановления пароля.
- `POST /v1/auth/reset-password` — проверка кода + запись нового пароля + создание новой sid-сессии.

Эти формы используют общий `useResendTimer` для кнопки «Отправить код ещё раз».

### 2.4. Логаут

- `POST /v1/auth/logout`  
  - Удаляет sid-сессию на сервере (по cookie).
  - Чистит cookie.
  - Фронт после этого делает `reset()` и `broadcast('logout')`.

---

## 3. Проверка сессии: `has-session` vs `ping`

### 3.1. `/v1/auth/has-session` (толстая проверка)

- `GET /v1/auth/has-session`
- Назначение:
  - использовать **только** для:
    - инициализации приложения (после CSRF);
    - обновления состояния во вторых вкладках при событии `login` (через BroadcastChannel/`localStorage`).
- Возвращает JSON вида:

```json
{
  "has": true,
  "phone": "+7... ",
  "has_pin": true,
  "need_pin": false,
  "user": { "...payload..." }
}

