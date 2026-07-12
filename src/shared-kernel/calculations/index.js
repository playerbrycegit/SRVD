'use strict';
/**
 * Shared Kernel calculation engine. Pure, stateless functions - single source of truth per
 * Stage 4 §10, never duplicated per-endpoint or per-screen (Stage 9 §1). Every formula, precision
 * rule, and error-handling behavior below matches Stage 4 §10 exactly.
 */

class CalculationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CalculationError';
  }
}

function round(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Batch scaling. scaled_amount = amount * (target_servings / base_servings)
 * Precision: 2 decimal places (Stage 4 §10).
 */
function scaleBatch({ baseServings, targetServings, ingredients }) {
  if (!(baseServings > 0) || !(targetServings > 0)) {
    throw new CalculationError('Servings must be greater than zero');
  }
  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    throw new CalculationError('Add at least one ingredient');
  }
  const factor = targetServings / baseServings;
  return ingredients.map((ing) => {
    const amount = Number(ing.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      // Stage 4 §10: invalid rows are skipped with a per-row error, not a full-form failure.
      return { name: ing.name || 'Ingredient', unit: ing.unit || '', scaledAmount: null, error: 'Invalid amount' };
    }
    return { name: ing.name || 'Ingredient', unit: ing.unit || '', scaledAmount: round(amount * factor, 2), error: null };
  });
}

/**
 * ABV / Proof. total_alcohol = sum(volume_i * abv_i/100)
 * final_abv = total_alcohol / (sum(volume_i) + dilution) * 100; proof = final_abv * 2
 * Precision: ABV/proof 1 decimal, volume 2 decimals (Stage 4 §10).
 * Assumption (documented, not silent): volumes are additive, no density/mixing-loss accounting -
 * standard bar-industry practice per Stage 4 §10.
 */
function calculateAbv({ ingredients, dilution = 0 }) {
  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    throw new CalculationError('Add at least one ingredient');
  }
  const dilutionVol = Number(dilution) || 0;
  if (dilutionVol < 0) throw new CalculationError('Dilution cannot be negative');

  let totalVolume = 0;
  let totalAlcohol = 0;
  for (const ing of ingredients) {
    const volume = Number(ing.volumeOz);
    const abvPct = Number(ing.abvPercent);
    if (!Number.isFinite(volume) || volume < 0) throw new CalculationError(`Invalid volume for ${ing.name || 'ingredient'}`);
    if (!Number.isFinite(abvPct) || abvPct < 0 || abvPct > 100) {
      throw new CalculationError(`ABV% must be between 0 and 100 for ${ing.name || 'ingredient'}`);
    }
    totalVolume += volume;
    totalAlcohol += volume * (abvPct / 100);
  }
  const finalVolume = totalVolume + dilutionVol;
  const finalAbv = finalVolume > 0 ? (totalAlcohol / finalVolume) * 100 : 0;
  return {
    finalAbvPercent: round(finalAbv, 1),
    proof: round(finalAbv * 2, 1),
    totalVolumeOz: round(finalVolume, 2),
  };
}

/**
 * Unit conversion. Fixed milliliter-based lookup table (Stage 4 §10). Precision: 3 decimals.
 */
const ML_PER_UNIT = Object.freeze({
  oz: 29.5735,
  ml: 1,
  cl: 10,
  tsp: 4.92892,
  tbsp: 14.7868,
  cup: 236.588,
  l: 1000,
});

function convertUnit({ amount, fromUnit, toUnit }) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value < 0) throw new CalculationError('Amount must be a non-negative number');
  if (!(fromUnit in ML_PER_UNIT)) throw new CalculationError(`Unknown unit: ${fromUnit}`);
  if (!(toUnit in ML_PER_UNIT)) throw new CalculationError(`Unknown unit: ${toUnit}`);
  const ml = value * ML_PER_UNIT[fromUnit];
  const result = ml / ML_PER_UNIT[toUnit];
  return round(result, 3);
}

const StationCalculations = { CalculationError, scaleBatch, calculateAbv, convertUnit, ML_PER_UNIT, round };

// UMD-style dual export: Node (require) and browser (<script> tag) load the exact same
// implementation - Stage 9 §1 forbids a second, duplicated client-side copy of these formulas.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = StationCalculations;
}
if (typeof window !== 'undefined') {
  window.STATION_CALC = StationCalculations;
}
