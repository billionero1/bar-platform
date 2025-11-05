import 'dotenv/config';
export const JWT_SECRET = process.env.JWT_SECRET || 'dev-super-secret-please-change';
export const JWT_TTL    = process.env.JWT_TTL    || '30d';
