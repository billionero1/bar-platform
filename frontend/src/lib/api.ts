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

const ENV_BASE = (import.meta.env.VITE_API_URL || '').trim();

// Авто-база: если VITE_API_URL не задан — берём hostname текущей страницы и порт 3001
const AUTO_BASE =
  typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:3001`
    : '';

const API_BASE = ENV_BASE || AUTO_BASE;

export function setAuthHandlers(handlers: AuthHandlers) {
  authHandlers = handlers;
}

// ===================================================================
// CSRF
// ===================================================================

function normalizeBase(base: string) {
  return base.replace(/\/+$/, '');
}

async function fetchCsrfToken(): Promise<string> {
  const base = normalizeBase(API_BASE);

  const response = await fetch(base + '/v1/auth/csrf-token', {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) {
    // тут НЕ логируем, просто кидаем ошибку наверх
    throw new Error(`CSRF fetch failed: ${response.status}`);
  }

  const data = await response.json();
  const token: string | null = data?.csrfToken ?? null;

  if (!token) {
    throw new Error('CSRF token missing in response');
  }

  csrfToken = token;
  csrfInitialized = true;
  return token;
}

export async function ensureCsrfInitialized(): Promise<void> {
  if (!csrfInitialized || !csrfToken) {
    await fetchCsrfToken();
  }
}

// ===================================================================
// API
// ===================================================================

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const base = normalizeBase(API_BASE);
  const p = path.startsWith('/') ? path : `/${path}`;
  const url = path.startsWith('http') ? path : base + p;

  const method = (init.method || 'GET').toUpperCase();
  const isModifying = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method);

  // POST/PUT/DELETE/PATCH — всегда с CSRF
  if (isModifying) {
    await ensureCsrfInitialized();
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

  try {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    };

    if (isModifying && csrfToken) {
      (headers as any)['X-CSRF-Token'] = csrfToken;
    }

    let response = await fetch(url, {
      ...init,
      method,
      headers,
      credentials: 'include',
      signal: controller.signal,
    });

    // CSRF 403 → обновляем токен и пробуем ещё один раз
    if (response.status === 403 && isModifying) {
      try {
        const data = await response.clone().json();
        if (
          data?.code === 'CSRF_TOKEN_INVALID' ||
          data?.error === 'invalid_csrf_token'
        ) {
          await fetchCsrfToken();
          if (csrfToken) {
            (headers as any)['X-CSRF-Token'] = csrfToken;

            response = await fetch(url, {
              ...init,
              method,
              headers,
              credentials: 'include',
              signal: controller.signal,
            });
          }
        }
      } catch {
        // ignore
      }
    }

    clearTimeout(timeoutId);

    // SUCCESS
    if (response.ok) {
      if (response.status === 204) return undefined as unknown as T;

      const text = await response.text();
      if (!text) return undefined as unknown as T;

      try {
        return JSON.parse(text) as T;
      } catch {
        return text as unknown as T;
      }
    }

    // ERROR
    let data: any = null;
    try {
      data = await response.json();
    } catch {}

    const err = new Error(
      data?.message || data?.error || response.statusText || 'Request failed'
    ) as ApiError;

    err.status = response.status;
    if (data?.code) err.code = data.code;
    if (data?.details) err.details = data.details;

    // 401: дергаем onSessionExpired только по “сессионным” кодам
    if (response.status === 401) {
      const sessionExpiredCodes = new Set([
        'SESSION_EXPIRED',
        'NO_SESSION',
        'INVALID_SESSION',
        'EXPIRED',
      ]);

      if (err.code && sessionExpiredCodes.has(err.code)) {
        authHandlers.onSessionExpired?.();
      }
    }

    throw err;
  } catch (error: any) {
    clearTimeout(timeoutId);

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
