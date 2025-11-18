// src/lib/api.ts
export type ApiError = Error & {
  status?: number;
  code?: string;
  details?: unknown;
};

// ==== Глобальные хендлеры авторизации (ставятся из AuthContext) ====
type AuthHandlers = {
  onPinRequired?: () => void;
  onSessionExpired?: () => void;
};

let authHandlers: AuthHandlers = {};

export function setAuthHandlers(handlers: AuthHandlers) {
  authHandlers = handlers;
}

// ==== Базовый хелпер для запросов ====

const API_BASE = import.meta.env.VITE_API_URL || '';

export async function api<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const url = path.startsWith('http') ? path : API_BASE + path;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(init.headers || {}),
  };

  const res = await fetch(url, {
    ...init,
    headers,
    credentials: 'include',
  });


  // Успех
  if (res.ok) {
    // 204 No Content
    if (res.status === 204) return undefined as unknown as T;

    const text = await res.text();
    if (!text) return undefined as unknown as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      // если пришёл не-JSON
      return text as unknown as T;
    }
  }

  // Ошибка
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // тело не JSON
  }

  const err = new Error(
    data?.message ||
    data?.error ||
    res.statusText ||
    'Request failed'
  ) as ApiError;

  err.status = res.status;
  if (data?.code && typeof data.code === 'string') {
    err.code = data.code;
  }
  if (data?.details) {
    err.details = data.details;
  }

  // Глобальная реакция на авторизационные 401
  if (res.status === 401) {
    if (err.code === 'PIN_REQUIRED') {
      authHandlers.onPinRequired?.();
    } else if (
      err.code === 'SESSION_EXPIRED' ||
      err.code === 'SESSION_NOT_FOUND' ||
      !err.code // на всякий случай
    ) {
      authHandlers.onSessionExpired?.();
    }
  }

  throw err;
}
