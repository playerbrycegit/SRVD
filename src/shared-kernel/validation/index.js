'use strict';
/**
 * Shared validation rules. Source of truth: Stage 4 §8, restated as binding rules in Stage 9 §6.
 * Intended to be usable identically from server code and (once a client build exists) client code -
 * plain functions with no framework dependency, per Stage 4 §2's "avoid vendor lock-in" principle.
 */

class ValidationError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = 'ValidationError';
    this.field = field; // null => not attributable to one field (Stage 9 §6's error-format rule)
  }
}

const RECIPE_CATEGORIES = ['Classic', 'Original', 'Stirred', 'Shaken', 'Built', 'Batch'];

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateEmail(email) {
  if (!isValidEmail(email)) throw new ValidationError('Enter a valid email address', 'email');
  return email.trim().toLowerCase();
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    throw new ValidationError('Password must be at least 8 characters', 'password');
  }
  return password;
}

/** Stage 4 §9: shifts require at least one non-zero tip value. Enforced here (validation layer),
 * not the database, since Stage 4 explicitly notes this rule may evolve. */
function validateShift({ shift_date, hours, cash_tips, card_tips }) {
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

function validateGoal({ target_amount }) {
  const target = Number(target_amount);
  if (!(target > 0)) throw new ValidationError('Enter a valid target', 'target_amount');
  return { target_amount: target };
}

/** Stage 4 §8/§9: recipe name required 1-120 chars, fixed category enum, >=1 named ingredient. */
function validateRecipe({ name, category, glassware, method, tasting_notes, ingredients }) {
  if (!name || typeof name !== 'string' || name.trim().length < 1 || name.length > 120) {
    throw new ValidationError('Recipe needs a name', null);
  }
  if (!RECIPE_CATEGORIES.includes(category)) {
    throw new ValidationError('Invalid category', 'category');
  }
  if (!Array.isArray(ingredients) || ingredients.filter((i) => i && i.ingredient_name && i.ingredient_name.trim()).length === 0) {
    throw new ValidationError('Add at least one ingredient', null);
  }
  return {
    name: name.trim(),
    category,
    glassware: glassware ? String(glassware).slice(0, 120) : null,
    method: method || null,
    tasting_notes: tasting_notes || null,
    ingredients: ingredients
      .filter((i) => i && i.ingredient_name && i.ingredient_name.trim())
      .map((i, idx) => ({
        sort_order: idx,
        amount: i.amount != null ? String(i.amount) : null,
        unit: i.unit != null ? String(i.unit) : null,
        ingredient_name: String(i.ingredient_name).trim(),
      })),
  };
}

const FEEDBACK_TYPES = ['bug', 'confusing_experience', 'performance', 'calculation_concern', 'accessibility', 'feature_request', 'positive', 'other'];
const SEVERITIES = ['critical', 'high', 'medium', 'low'];

/**
 * Redacts patterns that match our own token formats (64-char hex session/verification tokens,
 * scrypt salt:hash pairs) before feedback text is ever persisted. This is a real technical
 * safeguard, not just a policy statement in a welcome guide — someone pasting a copied token or
 * password hash into a bug report gets it stripped automatically, not merely discouraged.
 */
function redactSensitivePatterns(text) {
  if (!text) return text;
  return String(text)
    .replace(/\b[a-f0-9]{64}\b/gi, '[REDACTED-TOKEN]')
    .replace(/\b[a-f0-9]{32}:[a-f0-9]{128}\b/gi, '[REDACTED-CREDENTIAL]');
}

function validateFeedback({ feedbackType, severity, description, expectedBehavior, actualBehavior, reproductionSteps, affectedFeature, route, deviceType, browser, operatingSystem, frequency, contactPermission }) {
  if (!FEEDBACK_TYPES.includes(feedbackType)) throw new ValidationError('Invalid feedback type', 'feedbackType');
  if (!SEVERITIES.includes(severity)) throw new ValidationError('Invalid severity', 'severity');
  if (!description || typeof description !== 'string' || description.trim().length < 1) {
    throw new ValidationError('Description is required', 'description');
  }
  if (description.length > 2000) throw new ValidationError('Description is too long (max 2000 characters)', 'description');
  return {
    feedbackType, severity,
    description: redactSensitivePatterns(description.trim()),
    expectedBehavior: redactSensitivePatterns(expectedBehavior || null),
    actualBehavior: redactSensitivePatterns(actualBehavior || null),
    reproductionSteps: redactSensitivePatterns(reproductionSteps || null),
    affectedFeature: affectedFeature || null,
    route: route || null,
    deviceType: deviceType || null,
    browser: browser || null,
    operatingSystem: operatingSystem || null,
    frequency: frequency || null,
    contactPermission: Boolean(contactPermission),
  };
}

module.exports = {
  ValidationError,
  RECIPE_CATEGORIES,
  isValidEmail,
  validateEmail,
  validatePassword,
  validateShift,
  validateGoal,
  validateRecipe,
  validateFeedback,
  redactSensitivePatterns,
  FEEDBACK_TYPES,
  SEVERITIES,
};
