type Err = { error?: string; status?: number; message?: string };

const map: Record<string,string> = {
  // auth
  invalid_credentials: 'Неверный телефон или пароль',
  phone_already_registered: 'Этот номер уже зарегистрирован',
  phone_and_establishment_required: 'Укажите телефон и название заведения',
  phone_establishment_password_required: 'Укажите телефон, пароль и название заведения',
  phone_and_code_required: 'Нужно указать телефон и код',
  code_expired_or_not_found: 'Код истёк или не найден',
  invalid_code: 'Неверный код',
  too_many_requests: 'Слишком много попыток. Повторите позже.',
  no_membership: 'Нет доступа к заведению',
  no_refresh: 'Сессия не найдена. Выполните вход.',
  invalid_refresh: 'Сессия недействительна. Выполните вход.',
  bad_token: 'Недействительный токен',
  pin_required: 'Введите PIN',
  // generic
  internal_error: 'Внутренняя ошибка. Попробуйте позже.',
  http_error: 'Ошибка сети. Попробуйте ещё раз.',
};

export function rusify(e: Err): string {
  if (!e) return 'Ошибка';
  if (e.error && map[e.error]) return map[e.error];
  if (typeof e.message === 'string' && map[e.message]) return map[e.message];
  if (e.status === 401) return 'Не авторизовано';
  if (e.status === 403) return 'Доступ запрещён';
  if (e.status === 404) return 'Не найдено';
  return map.internal_error;
}
