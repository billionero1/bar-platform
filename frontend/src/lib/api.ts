// src/lib/api.ts
const BASE = import.meta.env.VITE_API_URL || ''; 
// в проде у тебя nginx проксирует /v1 → бекенд, поэтому BASE можно оставить пустым
// локально dev-proxy из vite.config.ts тоже ловит /v1

type Opts = RequestInit & { skipJson?: boolean };

export async function api(path: string, opts: Opts = {}) {
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  const init: RequestInit = {
    credentials: opts.credentials, // важно: для refresh-куки указывать 'include'
    method: opts.method || 'GET',
    headers: {
      ...(opts.headers || {}),
    },
    body: opts.body,
  };

  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    // попробуем распарсить json, но не упадём
    let msg: any = text;
    try { msg = JSON.parse(text); } catch {}
    throw new Error(msg?.error || msg || `HTTP ${res.status}`);
  }

  if (opts.skipJson) return res;
  const data = await res.json();
  return data;
}
