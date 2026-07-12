'use strict';
/**
 * Rate limiter. Source: Stage 4 §17 ("tighter on auth endpoints, looser on authenticated read/write").
 * In-memory sliding window - appropriate at V1 scale (Stage 4 §23 notes distributed infra is a
 * later-tier concern). A production deployment with multiple server instances would need a shared
 * store (e.g. the database or a cache layer) instead of per-process memory; documented, not built,
 * since it's a real architectural difference, not just a config change.
 */
const buckets = new Map(); // key -> [timestamps]

function isRateLimited(key, { maxRequests, windowMs }) {
  const now = Date.now();
  const timestamps = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (timestamps.length >= maxRequests) {
    buckets.set(key, timestamps);
    return true;
  }
  timestamps.push(now);
  buckets.set(key, timestamps);
  return false;
}

// Stage 4 §17: auth endpoints get the tight limit (blunts credential stuffing / enumeration).
const AUTH_LIMIT = { maxRequests: 10, windowMs: 60_000 }; // 10/min per IP
const STANDARD_LIMIT = { maxRequests: 120, windowMs: 60_000 }; // 120/min per IP

function clearAll() { buckets.clear(); } // test-only reset

module.exports = { isRateLimited, AUTH_LIMIT, STANDARD_LIMIT, clearAll };
