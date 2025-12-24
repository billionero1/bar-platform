// src/lib/api.ts
const API_TIMEOUT = 10000;

export type ApiError = Error & {
  status?: number;
  code?: string;
  details?: unknown;
};

type AuthHandlers = {
  onSessionExpired?: () => void;
};

let authHandlers: AuthHandlers = {};
let csrfToken: string | null = null;
let csrfInitialized = false;

const API_BASE = import.meta.env.VITE_API_URL || '';

export function setAuthHandlers(handlers: AuthHandlers) {
  authHandlers = handlers;
}

// === CSRF ===

async function fetchCsrfToken(): Promise<string> {
  try {
    const response = await fetch(API_BASE + '/v1/auth/csrf-token', {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`CSRF fetch failed: ${response.status}`);
    }

    const data = await response.json();
    const token = data.csrfToken || 'not_available';
    csrfToken = token;
    csrfInitialized = true;
    console.log('🔄 CSRF token obtained');
    return token;
  } catch (error) {
    console.warn('⚠️ CSRF token fetch failed:', error);
    csrfToken = 'not_available';
    csrfInitialized = true;
    return 'not_available';
  }
}

export async function ensureCsrfInitialized(): Promise<void> {
  if (!csrfInitialized) {
    await fetchCsrfToken();
  }
}

// === Основная функция API ===

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = path.startsWith('http') ? path : API_BASE + path;
  const method = (init.method || 'GET').toUpperCase();
  const isModifying = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method);

  // Для модифицирующих запросов — гарантируем CSRF
  if (isModifying) {
    if (!csrfInitialized || !csrfToken) {
      await fetchCsrfToken();
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

  try {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    };

    if (isModifying && csrfToken && csrfToken !== 'not_available') {
      (headers as any)['X-CSRF-Token'] = csrfToken;
    }

    const doFetch = async (): Promise<Response> => {
      return fetch(url, {
        ...init,
        method,
        headers,
        credentials: 'include',
        signal: controller.signal,
      });
    };

    let response = await doFetch();

    // Спец-обработка CSRF 403 → обновляем токен и пробуем один раз ещё раз
    if (response.status === 403 && isModifying) {
      try {
        const ct = response.headers.get('content-type');
        if (ct && ct.includes('application/json')) {
          const errData = await response.clone().json();
          if (
            errData?.code === 'CSRF_TOKEN_INVALID' ||
            errData?.error === 'invalid_csrf_token'
          ) {
            await fetchCsrfToken();
            if (csrfToken && csrfToken !== 'not_available') {
              const retryHeaders: HeadersInit = {
                ...headers,
                'X-CSRF-Token': csrfToken,
              };
              response = await fetch(url, {
                ...init,
                method,
                headers: retryHeaders,
                credentials: 'include',
                signal: controller.signal,
              });
            }
          }
        }
      } catch {
        // если не смогли прочитать тело — просто идём дальше в общую обработку
      }
    }

    clearTimeout(timeoutId);

    // Успешный ответ
    if (response.ok) {
      if (response.status === 204) {
        return undefined as unknown as T;
      }
      const text = await response.text();
      if (!text) return undefined as unknown as T;
      try {
        return JSON.parse(text) as T;
      } catch {
        return text as unknown as T;
      }
    }

    // НЕуспешный ответ → разбираем ошибку
    let data: any = null;
    try {
      data = await response.json();
    } catch {
      // тело не JSON — оставляем data = null
    }

    const err = new Error(
      data?.message ||
        data?.error ||
        response.statusText ||
        'Request failed'
    ) as ApiError;

    err.status = response.status;
    if (data?.code) err.code = data.code;
    if (data?.details) err.details = data.details;

    // === Специальная логика по 401 ===
    if (response.status === 401) {
      // Все 401 ошибки считаем истечением сессии
      authHandlers.onSessionExpired?.();
    } else if (response.status === 403 && isModifying) {
      // CSRF после ретрая не починился
      console.warn('⚠️ CSRF/403 for modifying request', {
        path,
        code: err.code,
      });
    } else {
      // Все остальные ошибки логируем один раз
      console.error('❌ API error', {
        path,
        status: err.status,
        code: err.code,
        message: err.message,
      });
    }

    throw err;
  } catch (error: any) {
    clearTimeout(timeoutId);

    // Таймаут
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('Request timeout') as ApiError;
      timeoutError.status = 408;
      timeoutError.code = 'REQUEST_TIMEOUT';
      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}