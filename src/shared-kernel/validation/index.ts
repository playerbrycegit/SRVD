/**
 * Shared validation rules. Source of truth: Stage 4 §8, restated as binding rules in Stage 9 §6.
 * Converted to strict TypeScript per this migration's §2 — every input/output is explicitly typed,
 * no `any`. Still plain, framework-free functions (Stage 4 §2's "avoid vendor lock-in" principle).
 */
import type {
  ShiftInput, GoalInput, RecipeInput, ValidatedRecipe,
  FeedbackInput, RecipeCategory,
} from '../types';

export class ValidationError extends Error {
  public readonly field: string | null;
  constructor(message: string, field: string | null = null) {
    super(message);
    this.name = 'ValidationError';
    this.field = field; // null => not attributable to one field (Stage 9 §6's error-format rule)
  }
}

export const RECIPE_CATEGORIES: readonly RecipeCategory[] = ['Classic', 'Original', 'Stirred', 'Shaken', 'Built', 'Batch'];

export function isValidEmail(email: unknown): email is string {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validateEmail(email: unknown): string {
  if (!isValidEmail(email)) throw new ValidationError('Enter a valid email address', 'email');
  return email.trim().toLowerCase();
}

export function validatePassword(password: unknown): string {
  if (typeof password !== 'string' || password.length < 8) {
    throw new ValidationError('Password must be at least 8 characters', 'password');
  }
  return password;
}

interface ValidatedShift {
  shift_date: string;
  hours: number | null;
  cash_tips: number;
  card_tips: number;
}

/** Stage 4 §9: shifts require at least one non-zero tip value. Enforced here (validation layer),
 * not the database, since Stage 4 explicitly notes this rule may evolve. */
export function validateShift(input: Partial<ShiftInput>): ValidatedShift {
  const { shift_date, hours, cash_tips, card_tips } = input;
  if (!shift_date || !/^\d{4}-\d{2}-\d{2}$/.test(shift_date)) {
    throw new ValidationError('Enter a valid date', 'shift_date');
  }
  const cash = Number(cash_tips) || 0;
  const card = Number(card_tips) || 0;
  if (cash < 0 || card < 0) throw new ValidationError('Tip amounts cannot be negative', 'cash_tips');
  if (cash + card <= 0) throw new ValidationError('Enter at least one tip amount', null);
  if (hours != null && (Number(hours) < 0 || Number(hours) > 24)) {
    throw new ValidationError('Hours must be between 0 and 24', 'hours');
  }
  return { shift_date, hours: hours != null ? Number(hours) : null, cash_tips: cash, card_tips: card };
}

export function validateGoal(input: Partial<GoalInput>): { target_amount: number } {
  const target = Number(input.target_amount);
  if (!(target > 0)) throw new ValidationError('Enter a valid target', 'target_amount');
  return { target_amount: target };
}

/** Stage 4 §8/§9: recipe name required 1-120 chars, fixed category enum, >=1 named ingredient. */
export function validateRecipe(input: Partial<RecipeInput>): ValidatedRecipe {
  const { name, category, glassware, method, tasting_notes, ingredients } = input;
  if (!name || typeof name !== 'string' || name.trim().length < 1 || name.length > 120) {
    throw new ValidationError('Recipe needs a name', null);
  }
  if (!category || !RECIPE_CATEGORIES.includes(category as RecipeCategory)) {
    throw new ValidationError('Invalid category', 'category');
  }
  const validIngredients = (ingredients ?? []).filter(
    (i): i is typeof i & { ingredient_name: string } => Boolean(i && i.ingredient_name && i.ingredient_name.trim())
  );
  if (!Array.isArray(ingredients) || validIngredients.length === 0) {
    throw new ValidationError('Add at least one ingredient', null);
  }
  return {
    name: name.trim(),
    category,
    glassware: glassware ? String(glassware).slice(0, 120) : null,
    method: method || null,
    tasting_notes: tasting_notes || null,
    ingredients: validIngredients.map((i, idx) => ({
      sort_order: idx,
      amount: i.amount != null ? String(i.amount) : null,
      unit: i.unit != null ? String(i.unit) : null,
      ingredient_name: String(i.ingredient_name).trim(),
    })),
  };
}

export const FEEDBACK_TYPES = [
  'bug', 'confusing_experience', 'performance', 'calculation_concern',
  'accessibility', 'feature_request', 'positive', 'other',
] as const;
export const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;

/**
 * Redacts patterns that match our own token formats (64-char hex session/verification tokens,
 * scrypt salt:hash pairs) before feedback text is ever persisted. This is a real technical
 * safeguard, not just a policy statement in a welcome guide — someone pasting a copied token or
 * password hash into a bug report gets it stripped automatically, not merely discouraged.
 */
export function redactSensitivePatterns(text: string | null | undefined): string | null {
  if (!text) return text ?? null;
  return String(text)
    .replace(/\b[a-f0-9]{64}\b/gi, '[REDACTED-TOKEN]')
    .replace(/\b[a-f0-9]{32}:[a-f0-9]{128}\b/gi, '[REDACTED-CREDENTIAL]');
}

interface ValidatedFeedback {
  feedbackType: string;
  severity: string;
  description: string;
  expectedBehavior: string | null;
  actualBehavior: string | null;
  reproductionSteps: string | null;
  affectedFeature: string | null;
  route: string | null;
  deviceType: string | null;
  browser: string | null;
  operatingSystem: string | null;
  frequency: string | null;
  contactPermission: boolean;
}

export function validateFeedback(input: Partial<FeedbackInput>): ValidatedFeedback {
  const {
    feedbackType, severity, description, expectedBehavior, actualBehavior,
    reproductionSteps, affectedFeature, route, deviceType, browser, operatingSystem,
    frequency, contactPermission,
  } = input;
  if (!feedbackType || !(FEEDBACK_TYPES as readonly string[]).includes(feedbackType)) {
    throw new ValidationError('Invalid feedback type', 'feedbackType');
  }
  if (!severity || !(SEVERITIES as readonly string[]).includes(severity)) {
    throw new ValidationError('Invalid severity', 'severity');
  }
  if (!description || typeof description !== 'string' || description.trim().length < 1) {
    throw new ValidationError('Description is required', 'description');
  }
  if (description.length > 2000) throw new ValidationError('Description is too long (max 2000 characters)', 'description');
  return {
    feedbackType, severity,
    description: redactSensitivePatterns(description.trim()) as string,
    expectedBehavior: redactSensitivePatterns(expectedBehavior),
    actualBehavior: redactSensitivePatterns(actualBehavior),
    reproductionSteps: redactSensitivePatterns(reproductionSteps),
    affectedFeature: affectedFeature ?? null,
    route: route ?? null,
    deviceType: deviceType ?? null,
    browser: browser ?? null,
    operatingSystem: operatingSystem ?? null,
    frequency: frequency ?? null,
    contactPermission: Boolean(contactPermission),
  };
}
