import "server-only";

type Limit = { name: string; max: number; windowSec: number };

export const LIMITS = {
  // Each person can read a handful of bills with live AI; samples are unlimited.
  aiPerIp: { name: "ai-ip", max: 10, windowSec: 60 * 60 },
  // Whole-site cap that keeps the demo under the free Gemini daily quota.
  aiPerDay: { name: "ai-all", max: 300, windowSec: 24 * 60 * 60 },
  ordersPerIp: { name: "orders-ip", max: 20, windowSec: 60 * 60 },
} satisfies Record<string, Limit>;

export type LimitResult = { ok: true } | { ok: false; retryAfterSec: number };

// Upstash Redis (or Vercel KV, which uses the same REST API) when configured, so limits hold across
// serverless instances. Without it, counts live in this process: fine locally, best-effort when hosted.
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

const memory = new Map<string, { count: number; expiresAt: number }>();

async function increment(key: string, windowSec: number): Promise<number> {
  if (REDIS_URL && REDIS_TOKEN) {
    const res = await fetch(`${REDIS_URL}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
      body: JSON.stringify([
        ["INCR", key],
        ["EXPIRE", key, String(windowSec)],
      ]),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Rate limit store returned ${res.status}`);
    const [incr] = (await res.json()) as [{ result: number }];
    return incr.result;
  }

  const now = Date.now();
  for (const [k, v] of memory) if (v.expiresAt <= now) memory.delete(k);
  const entry = memory.get(key) ?? { count: 0, expiresAt: now + windowSec * 1000 };
  entry.count += 1;
  memory.set(key, entry);
  return entry.count;
}

// Fixed window: counts reset at the start of each window.
export async function hit(limit: Limit, id: string): Promise<LimitResult> {
  const now = Math.floor(Date.now() / 1000);
  const window = Math.floor(now / limit.windowSec);
  try {
    const count = await increment(`rl:${limit.name}:${id}:${window}`, limit.windowSec);
    if (count <= limit.max) return { ok: true };
    return { ok: false, retryAfterSec: (window + 1) * limit.windowSec - now };
  } catch (err) {
    // A broken limiter shouldn't take the demo down; the Gemini and Razorpay quotas still apply.
    console.error("rate limit check failed:", err);
    return { ok: true };
  }
}

// Vercel sets x-forwarded-for itself, so the first address is the real client there.
export function clientId(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "local"
  );
}

export function waitText(sec: number) {
  if (sec < 90) return "a minute";
  if (sec < 90 * 60) return `${Math.ceil(sec / 60)} minutes`;
  return `${Math.ceil(sec / 3600)} hours`;
}
