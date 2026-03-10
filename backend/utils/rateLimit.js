import { query as db } from '../db.js';

function normalizeWindowSeconds(rawWindowSeconds) {
  const n = Number(rawWindowSeconds);
  if (!Number.isFinite(n) || n <= 0) return 60;
  return Math.max(1, Math.trunc(n));
}

function normalizeLimit(rawLimit) {
  const n = Number(rawLimit);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.max(1, Math.trunc(n));
}

export async function consumeRateLimit(key, limit, windowSeconds) {
  const safeKey = String(key || '').trim();
  if (!safeKey) {
    return {
      limited: false,
      count: 0,
      limit: normalizeLimit(limit),
      windowSeconds: normalizeWindowSeconds(windowSeconds),
    };
  }

  const safeLimit = normalizeLimit(limit);
  const safeWindowSeconds = normalizeWindowSeconds(windowSeconds);

  const q = await db(
    `INSERT INTO rate_limits(key, window_start, count, updated_at)
     VALUES ($1, now(), 1, now())
     ON CONFLICT (key)
     DO UPDATE SET
       count = CASE
         WHEN rate_limits.window_start <= now() - make_interval(secs => $2::int)
           THEN 1
         ELSE rate_limits.count + 1
       END,
       window_start = CASE
         WHEN rate_limits.window_start <= now() - make_interval(secs => $2::int)
           THEN now()
         ELSE rate_limits.window_start
       END,
       updated_at = now()
     RETURNING count`,
    [safeKey, safeWindowSeconds]
  );

  if (Math.random() < 0.01) {
    db(
      `DELETE FROM rate_limits
        WHERE updated_at < now() - interval '7 days'`
    ).catch(() => {});
  }

  const count = Number(q.rows[0]?.count || 0);
  return {
    limited: count > safeLimit,
    count,
    limit: safeLimit,
    windowSeconds: safeWindowSeconds,
  };
}
