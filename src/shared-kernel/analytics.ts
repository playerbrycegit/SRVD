/**
 * Analytics abstraction. Source: V1.1 decision package §15 (only `shift_edited` and
 * `recipe_edited`, no other events approved this phase) and the standing project-wide rule that
 * analytics payloads never carry exact tip values, recipe content, or any private free text.
 *
 * HONESTY NOTE: same pattern as email.ts - no real analytics provider (Segment/Amplitude/etc.)
 * can be integrated here (no network). `ConsoleAnalytics` is a real, working implementation
 * suitable for local dev and for verifying event *shape* is privacy-safe before a real provider
 * is ever wired in.
 */

export type AnalyticsEventName = 'shift_edited' | 'recipe_edited';

export interface AnalyticsEvent {
  name: AnalyticsEventName;
  userId: string;
  timestamp: number;
  properties: Record<string, string | number | boolean>;
}

export interface AnalyticsService {
  track(event: AnalyticsEvent): void;
}

// Every property key ever allowed on any event - a real, enforced allowlist, not just a comment.
// Anything not on this list is dropped before it's ever logged, let alone sent to a real provider.
const ALLOWED_PROPERTY_KEYS = new Set(['recipeCategory', 'fieldCount']);
const PROHIBITED_KEY_PATTERNS = [/tip/i, /amount/i, /price/i, /cost/i, /recipe.*name/i, /ingredient/i, /note/i, /password/i, /token/i];

function sanitizeProperties(properties: Record<string, string | number | boolean>): Record<string, string | number | boolean> {
  const safe: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (!ALLOWED_PROPERTY_KEYS.has(key)) continue; // not on the allowlist at all - dropped silently, not an error
    if (PROHIBITED_KEY_PATTERNS.some((p) => p.test(key))) continue; // defense in depth even for allowlisted keys
    safe[key] = value;
  }
  return safe;
}

export class ConsoleAnalytics implements AnalyticsService {
  track(event: AnalyticsEvent): void {
    const safeProperties = sanitizeProperties(event.properties);
    // eslint-disable-next-line no-console
    console.log(`[analytics] ${event.name} user=${event.userId} ${JSON.stringify(safeProperties)}`);
  }
}

/** Never let analytics failure block the actual product workflow (§13's explicit requirement) -
 * every call site wraps track() in this, not a bare call, so a bug in analytics can never break
 * a real user action like saving a shift. */
export function trackSafely(analytics: AnalyticsService, event: AnalyticsEvent): void {
  try {
    analytics.track(event);
  } catch {
    // Deliberately swallowed - analytics must never be able to break the workflow that triggered it.
  }
}
