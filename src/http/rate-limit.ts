/**
 * Rate limiter, converted to strict TypeScript. Source: Stage 4 §17. In-memory sliding window -
 * appropriate at V1 scale; a multi-instance deployment needs a shared store instead (documented
 * in the prior production audit as a real, not-yet-solved risk, not a config change).
 */
const buckets = new Map<string, number[]>();

export interface RateLimitOptions {
  maxRequests: number;
  windowMs: number;
}

export function isRateLimited(key: string, { maxRequests, windowMs }: RateLimitOptions): boolean {
  const now = Date.now();
  const timestamps = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (timestamps.length >= maxRequests) {
    buckets.set(key, timestamps);
    return true;
  }
  timestamps.push(now);
  buckets.set(key, timestamps);
  return false;
}

// Stage 4 §17: auth endpoints get the tight limit (blunts credential stuffing / enumeration).
export const AUTH_LIMIT: RateLimitOptions = { maxRequests: 10, windowMs: 60_000 };
export const STANDARD_LIMIT: RateLimitOptions = { maxRequests: 120, windowMs: 60_000 };
// §13: export is sensitive and comparatively expensive - a tighter limit than standard reads.
export const EXPORT_LIMIT: RateLimitOptions = { maxRequests: 5, windowMs: 60_000 };

export function clearAll(): void {
  buckets.clear();
} // test-only reset
