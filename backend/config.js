import 'dotenv/config';

export const JWT_SECRET = process.env.JWT_SECRET || 'LpRrftzPB2Qhzp8UvkGtyqfYtZ0keR/Spy983f4aWy4';
export const JWT_TTL    = process.env.JWT_TTL    || '30d';

// Имя sid-куки (одинаковое для auth.js и requireAuth.js)
export const COOKIE_NAME = process.env.COOKIE_NAME || 'sid';

// Лимит простоя сессии в минутах.
// После этого requireAuth начнёт просить PIN (если он есть) или разлогинивать (если PIN нет).
export const IDLE_MINUTES = Number(process.env.SESSION_IDLE_MINUTES || 5);
