import jwt from 'jsonwebtoken';

const { JWT_SECRET = 'dev_secret_change_me' } = process.env;

export function requireAuth(req, res, next) {
  try {
    const hdr = req.headers.authorization || '';
    const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'no_token' });
    const payload = jwt.verify(token, JWT_SECRET);
    // payload: { sub, phone, establishment_id, role, name, surname, ... }
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'invalid_token' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'no_user' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'forbidden' });
    next();
  };
}
