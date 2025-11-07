const BASE = import.meta.env.VITE_API_URL;

export async function api<T=any>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include', // важно для refresh-куки
    headers: { 'Content-Type': 'application/json', ...(opts.headers||{}) },
    ...opts,
  });
  if (!res.ok) {
    const txt = await res.text().catch(()=> '');
    throw new Error(txt || `HTTP ${res.status}`);
  }
  return res.json();
}
