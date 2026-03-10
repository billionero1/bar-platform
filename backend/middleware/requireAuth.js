// backend/middleware/requireAuth.js
import crypto from 'crypto';
import { COOKIE_NAME } from '../config.js';
import { loadUserData, validateSession } from '../utils/sessionUtils.js';

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

export async function requireAuth(req, res, next) {
  try {
    const raw = req.cookies?.[COOKIE_NAME];
    if (!raw) {
      return res.status(401).json({ error: 'no_session', code: 'SESSION_EXPIRED' });
    }
    
    const h = sha256(raw);
    const session = await validateSession(h, true); // true - обновить активность
    
    if (!session.valid) {
      return res.status(401).json({ error: 'session_expired', code: 'SESSION_EXPIRED' });
    }
    
    const user = await loadUserData(session.userId);
    if (!user) {
      return res.status(401).json({ error: 'invalid_session', code: 'INVALID_SESSION' });
    }

    req.userId = session.userId;
    req.user = user;
    return next();
  } catch (e) {
    console.error('requireAuth error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
}
