import { createHash } from "node:crypto";

// Bounded, short-lived per-worker cache. Colour/mount/selection changes share
// the same photograph analysis; no photos or tokens are retained in the key.
const cache = new Map<string, { until: number; value: Promise<Buffer | null> }>();
export function cachedForeground(image: string, load: () => Promise<Buffer | null>) {
  const key = createHash("sha256").update(image).digest("hex");
  const now = Date.now();
  for (const [k, entry] of cache) if (entry.until <= now) cache.delete(k);
  const existing = cache.get(key);
  if (existing) return existing.value;
  if (cache.size >= 4) cache.delete(cache.keys().next().value!);
  const value = load().catch(error => { cache.delete(key); throw error; });
  cache.set(key, {until: now + 10 * 60_000, value});
  return value;
}
