/**
 * Privacy-safe analytics abstraction. Event names are allowlisted and private guest content is
 * never emitted. ConsoleAnalytics remains the local/test implementation until a real provider is
 * explicitly configured.
 */

export type AnalyticsEventName =
  | 'shift_edited'
  | 'recipe_edited'
  | 'connect_guest_created'
  | 'connect_visit_logged';

export interface AnalyticsEvent {
  name: AnalyticsEventName;
  userId: string;
  timestamp: number;
  properties: Record<string, string | number | boolean>;
}

export interface AnalyticsService {
  track(event: AnalyticsEvent): void;
}

const ALLOWED_PROPERTY_KEYS = new Set(['recipeCategory', 'fieldCount']);
const PROHIBITED_KEY_PATTERNS = [/tip/i, /amount/i, /price/i, /cost/i, /recipe.*name/i, /ingredient/i, /note/i, /guest/i, /email/i, /phone/i, /message/i, /password/i, /token/i];

function sanitizeProperties(properties: Record<string, string | number | boolean>): Record<string, string | number | boolean> {
  const safe: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (!ALLOWED_PROPERTY_KEYS.has(key)) continue;
    if (PROHIBITED_KEY_PATTERNS.some((p) => p.test(key))) continue;
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

export function trackSafely(analytics: AnalyticsService, event: AnalyticsEvent): void {
  try {
    analytics.track(event);
  } catch {
    // Analytics must never break the product workflow that triggered it.
  }
}
