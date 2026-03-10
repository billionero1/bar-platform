// src/shared/lib/errors.ts
// Единая карта сообщений на русском и вспомогательная функция rusify()

type Err = { error?: string; status?: number; message?: string };

const map: Record<string, string> = {
  // аутентификация / сессии
  invalid_credentials: 'Неверный телефон или пароль',
  phone_already_registered: 'Этот номер уже зарегистрирован',
  invalid_phone: 'Некорректный номер телефона',
  phone_required: 'Укажите номер телефона',
  phone_and_password_required: 'Укажите телефон и пароль',
  phone_password_required: 'Укажите телефон и пароль',
  phone_and_establishment_required: 'Укажите телефон и название заведения',
  phone_establishment_password_required: 'Укажите телефон, пароль и название заведения',
  phone_and_code_required: 'Нужно указать телефон и код',
  code_expired_or_not_found: 'Код истёк или не найден',
  invalid_code: 'Неверный код',
  too_many_attempts: 'Слишком много неверных попыток. Запросите новый код.',
  too_many_requests: 'Слишком много попыток. Повторите позже.',
  phone_not_verified: 'Сначала подтвердите номер кодом из Telegram',
  telegram_bind_required: 'Подтвердите номер через Telegram и продолжите регистрацию',
  TELEGRAM_BIND_REQUIRED: 'Подтвердите номер через Telegram и продолжите регистрацию',
  telegram_bind_unavailable: 'Подтверждение через Telegram временно недоступно. Сообщите администратору',
  telegram_bind_token_required: 'Токен привязки не передан',
  telegram_bind_not_found: 'Ссылка привязки недействительна. Запросите новую',
  bad_input: 'Проверьте заполнение полей',
  no_refresh: 'Сессия не найдена. Выполните вход.',
  invalid_refresh: 'Сессия недействительна. Выполните вход.',
  bad_token: 'Недействительный токен',
  no_token: 'Токен не найден',
  invalid_invite_token: 'Некорректная ссылка приглашения',
  invite_not_found: 'Приглашение не найдено',
  invite_expired: 'Срок действия приглашения истёк или оно отозвано',
  already_member: 'Пользователь уже состоит в команде заведения',
  membership_revoked: 'Доступ в заведение отозван',
  not_found: 'Пользователь не найден',
  phone_code_password_required: 'Укажите телефон, код и новый пароль',
  establishment_required: 'Сначала создайте или выберите заведение',
  establishment_name_required: 'Укажите название заведения',
  manager_required: 'Это действие доступно только менеджеру',
  forbidden: 'Недостаточно прав для этого действия',
  invalid_id: 'Некорректный идентификатор записи',
  invalid_payload: 'Проверьте заполнение формы и попробуйте снова',
  invalid_component: 'Один из компонентов указан неверно',
  components_required: 'Добавьте хотя бы один компонент',
  file_required: 'Выберите файл для загрузки',
  file_too_large: 'Файл слишком большой. Максимум 5 МБ',
  invalid_file_type: 'Разрешены только изображения JPG, PNG или WEBP',
  upload_failed: 'Не удалось загрузить файл. Повторите попытку',
  invalid_category: 'Выбрана недопустимая категория',
  invalid_status: 'Недопустимый статус заявки',
  invalid_role: 'Недопустимая роль сотрудника',
  last_manager: 'Нельзя удалить или понизить последнего менеджера',
  cannot_revoke_self: 'Нельзя отозвать доступ у собственного аккаунта',
  name_required: 'Укажите название',
  shift_date_required: 'Укажите дату смены',
  title_required: 'Укажите название',
  calc_failed: 'Не удалось выполнить расчёт. Проверьте состав карты',
  otp_delivery_failed: 'Не удалось доставить код подтверждения. Повторите позже',

  // новые ошибки для CSRF и валидации пароля
  invalid_csrf_token: 'Недействительный токен безопасности. Перезагрузите страницу.',
  CSRF_TOKEN_INVALID: 'Недействительный токен безопасности. Перезагрузите страницу.',
  
  // ошибки валидации пароля
  password_too_short: 'Пароль должен содержать минимум 8 символов',
  password_no_uppercase: 'Пароль должен содержать хотя бы одну заглавную букву',
  password_no_lowercase: 'Пароль должен содержать хотя бы одну строчную букву', 
  password_no_digit: 'Пароль должен содержать хотя бы одну цифру',

  // общее
  internal_error: 'Внутренняя ошибка. Попробуйте позже.',
  http_error: 'Ошибка сети. Попробуйте ещё раз.',
};

export function rusify(e: Err | unknown): string {
  const err = (e ?? {}) as Err;

  if (typeof err.error === 'string' && map[err.error]) return map[err.error];
  if (typeof err.message === 'string' && map[err.message]) return map[err.message];

  if (typeof err.status === 'number') {
    if (err.status === 401) return 'Не авторизовано';
    if (err.status === 403) return 'Доступ запрещён';
    if (err.status === 404) return 'Не найдено';
  }

  // если вообще непонятно — считаем сетевой ошибкой
  return map.http_error;
}
