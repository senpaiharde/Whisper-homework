// server/rateLimiter.ts
type Key = string;
const now = () => Date.now();

interface WindowCounters {
  lastRequestAt?: number; // for 30s cooldown
  lastHour: number[]; // timestamps within 60m
  lastDay: number[]; // timestamps within 24h
}

// simple in-memory store (swap to Redis in prod)
const store = new Map<Key, WindowCounters>();

function take(key: Key) {
  const rec = store.get(key) ?? { lastHour: [], lastDay: [] };
  const t = now();

  // prune old timestamps
  rec.lastHour = rec.lastHour.filter((ts) => t - ts <= 60 * 60 * 1000);
  rec.lastDay = rec.lastDay.filter((ts) => t - ts <= 24 * 60 * 60 * 1000);

  // 30s cooldown
  if (rec.lastRequestAt && t - rec.lastRequestAt < 30_000) {
    const wait = 30_000 - (t - rec.lastRequestAt);
    return { ok: false, reason: `Cooldown: wait ${Math.ceil(wait / 1000)}s` as const };
  }

  // 4 per hour
  if (rec.lastHour.length >= 9)
    return { ok: false, reason: 'Rate limit: 4 per hour reached' as const };

  // 10 per day
  if (rec.lastDay.length >= 17)
    return { ok: false, reason: 'Rate limit: 10 per day reached' as const };

  // accept current call
  rec.lastRequestAt = t;
  rec.lastHour.push(t);
  rec.lastDay.push(t);
  store.set(key, rec);
  return { ok: true as const };
}

export const rateLimit = {
  check: (email: string, ip?: string) => {
    const k1 = `email:${email.toLowerCase()}`;
    const k2 = ip ? `ip:${ip}` : '';
    const r1 = take(k1);
    if (!r1.ok) return r1;
    if (!k2) return r1;
    const r2 = take(k2);
    return r2.ok ? r1 : r2;
  },
};
