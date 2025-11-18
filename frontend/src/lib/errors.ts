// src/lib/errors.ts
// Единая карта сообщений на русском и вспомогательная функция rusify()

type Err = { error?: string; status?: number; message?: string };

const map: Record<string, string> = {
  // аутентификация / сессии
  invalid_credentials: 'Неверный телефон или пароль',
  phone_already_registered: 'Этот номер уже зарегистрирован',
  phone_required: 'Укажите номер телефона',
  phone_and_password_required: 'Укажите телефон и пароль',
  phone_and_establishment_required: 'Укажите телефон и название заведения',
  phone_establishment_password_required: 'Укажите телефон, пароль и название заведения',
  phone_and_code_required: 'Нужно указать телефон и код',
  code_expired_or_not_found: 'Код истёк или не найден',
  invalid_code: 'Неверный код',
  too_many_requests: 'Слишком много попыток. Повторите позже.',
  no_refresh: 'Сессия не найдена. Выполните вход.',
  invalid_refresh: 'Сессия недействительна. Выполните вход.',
  bad_token: 'Недействительный токен',
  no_token: 'Токен не найден',
  pin_required: 'Введите PIN',
  invalid_pin: 'Неверный PIN',
  membership_revoked: 'Доступ в заведение отозван',
  not_found: 'Пользователь не найден',
  phone_code_password_required: 'Укажите телефон, код и новый пароль',


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
