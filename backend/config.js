import 'dotenv/config';

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

export const JWT_SECRET = requiredEnv('JWT_SECRET');
export const JWT_TTL    = process.env.JWT_TTL || '30d';

// Имя sid-куки (одинаковое для auth.js и requireAuth.js)
export const COOKIE_NAME = process.env.COOKIE_NAME || 'sid';

// Лимит простоя сессии в минутах.
// Используется для будущих policy-ограничений; сейчас просто храним конфиг централизованно.
export const IDLE_MINUTES = Number(process.env.SESSION_IDLE_MINUTES || 5);
