// src/lib/api.ts
export const API = import.meta.env.VITE_API_URL || "";

const RU_ERRORS: Record<string, string> = {
  phone_already_registered: "Этот телефон уже зарегистрирован",
  phone_and_password_required: "Укажите телефон и пароль",
  phone_establishment_password_required: "Телефон, пароль и название заведения — обязательны",
  phone_required: "Укажите номер телефона",
  code_expired_or_not_found: "Код не найден или срок действия истёк",
  invalid_code: "Неверный код",
  invalid_credentials: "Неверный телефон или пароль",
  no_membership: "Нет доступа к заведению",
  no_refresh: "Сессия не найдена (требуется вход)",
  invalid_refresh: "Сессия недействительна (повторите вход)",
  bad_token: "Недействительный токен",
  pin_required: "Укажите PIN (4 цифры)",
  too_many_requests: "Слишком часто. Попробуйте позже",
  internal_error: "Внутренняя ошибка. Попробуйте ещё раз",
  http_error: "Ошибка сети. Попробуйте ещё раз",
};

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(API + path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });

  if (!res.ok) {
    // 401 — глобально считаем, что нужна авторизация
    if (res.status === 401) {
      try {
        const err = await res.json();
        const msg = RU_ERRORS[err?.error] || RU_ERRORS.http_error;
        throw { ...err, message: msg, status: 401 };
      } catch {
        throw { error: "http_error", message: RU_ERRORS.http_error, status: 401 };
      }
    }

    // Остальные статусы — пытаемся вернуть локализованную ошибку
    try {
      const err = await res.json();
      const msg = RU_ERRORS[err?.error] || RU_ERRORS.http_error;
      throw { ...err, message: msg, status: res.status };
    } catch {
      throw { error: "http_error", message: RU_ERRORS.http_error, status: res.status };
    }
  }

  return res.json();
}
