import 'dotenv/config';

export const JWT_SECRET = process.env.JWT_SECRET || 'LpRrftzPB2Qhzp8UvkGtyqfYtZ0keR/Spy983f4aWy4';
export const JWT_TTL    = process.env.JWT_TTL    || '30d';