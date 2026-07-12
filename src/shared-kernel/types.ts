/**
 * Central domain types. Source of truth: Stage 4 §4 (schema), this migration's §2 requirement to
 * type Users/Sessions/Tokens/Shifts/Goals/Recipes/API shapes/ValidationErrors/DB rows explicitly.
 *
 * These types describe the *logical* shape of each entity. DB row types (suffixed `Row`) describe
 * exactly what a SQLite query returns (snake_case columns, nullable fields as `| null`, epoch-ms
 * timestamps as `number`) - kept separate from the shapes returned over the API, since the two are
 * allowed to diverge (they don't today, but conflating them would make future divergence a type
 * error waiting to happen rather than a deliberate choice).
 */

// ---------- Users ----------
export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  email_verified_at: number | null;
  display_name: string | null;
  unit_preference: 'oz' | 'ml';
  currency_preference: string;
  created_at: number;
  updated_at: number;
}

export interface PublicUser {
  id: string;
  email: string;
}

// ---------- Sessions ----------
export interface SessionRow {
  id: string;
  user_id: string;
  refresh_token_hash: string;
  device_label: string | null;
  created_at: number;
  expires_at: number;
  revoked_at: number | null;
}

export interface LoginResult {
  user: PublicUser;
  token: string;
  expiresAt: number;
}

// ---------- Verification / password-reset tokens ----------
export type TokenPurpose = 'email_verify' | 'password_reset';

export interface VerificationTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  purpose: TokenPurpose;
  created_at: number;
  expires_at: number;
  used_at: number | null;
}

// ---------- Shifts ----------
export interface ShiftRow {
  id: string;
  user_id: string;
  shift_date: string; // plain YYYY-MM-DD, no time/timezone (Stage 9 §7)
  hours: number | null;
  cash_tips: number;
  card_tips: number;
  notes: string | null;
  created_at: number;
  updated_at: number;
}

export interface ShiftInput {
  shift_date: string;
  hours?: number | null;
  cash_tips: number;
  card_tips: number;
  notes?: string | null;
}

export interface ShiftStats {
  lifetimeTotal: number;
  avgPerShift: number;
  bestShift: number;
  shiftCount: number;
}

// ---------- Weekly goals ----------
export interface GoalRow {
  id: string;
  user_id: string;
  target_amount: number;
  window_days: number;
  created_at: number;
  updated_at: number;
}

export interface GoalInput {
  target_amount: number;
}

export interface GoalProgress {
  target: number;
  current: number;
  percent: number;
}

// ---------- Recipes ----------
export type RecipeCategory = 'Classic' | 'Original' | 'Stirred' | 'Shaken' | 'Built' | 'Batch';

export interface RecipeRow {
  id: string;
  user_id: string;
  name: string;
  category: RecipeCategory;
  glassware: string | null;
  method: string | null;
  tasting_notes: string | null;
  created_at: number;
  updated_at: number;
}

export interface RecipeIngredientRow {
  id: string;
  recipe_id: string;
  sort_order: number;
  amount: string | null;
  unit: string | null;
  ingredient_name: string;
}

export interface RecipeWithIngredients extends RecipeRow {
  ingredients: RecipeIngredientRow[];
}

export interface RecipeIngredientInput {
  amount?: string | number | null;
  unit?: string | null;
  ingredient_name: string;
}

export interface RecipeInput {
  name: string;
  category: string; // validated against RecipeCategory at runtime, not assumed at the type level
  glassware?: string | null;
  method?: string | null;
  tasting_notes?: string | null;
  ingredients: RecipeIngredientInput[];
}

export interface ValidatedRecipeIngredient {
  sort_order: number;
  amount: string | null;
  unit: string | null;
  ingredient_name: string;
}

export interface ValidatedRecipe {
  name: string;
  category: string;
  glassware: string | null;
  method: string | null;
  tasting_notes: string | null;
  ingredients: ValidatedRecipeIngredient[];
}

// ---------- Alpha operations ----------
export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

export interface AlphaInvitationRow {
  id: string;
  email: string;
  token_hash: string;
  segment: string | null;
  status: InvitationStatus;
  created_at: number;
  expires_at: number;
  accepted_at: number | null;
  user_id: string | null;
}

export type FeedbackType =
  | 'bug' | 'confusing_experience' | 'performance' | 'calculation_concern'
  | 'accessibility' | 'feature_request' | 'positive' | 'other';
export type FeedbackSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface FeedbackSubmissionRow {
  id: string;
  user_id: string | null;
  feedback_type: FeedbackType;
  affected_feature: string | null;
  severity: FeedbackSeverity;
  description: string;
  expected_behavior: string | null;
  actual_behavior: string | null;
  route: string | null;
  device_type: string | null;
  browser: string | null;
  operating_system: string | null;
  reproduction_steps: string | null;
  frequency: string | null;
  contact_permission: number; // SQLite has no boolean type; stored as 0/1 (Stage 9 §7-adjacent note)
  created_at: number;
}

export interface FeedbackInput {
  feedbackType: string;
  severity: string;
  description: string;
  expectedBehavior?: string | null;
  actualBehavior?: string | null;
  reproductionSteps?: string | null;
  affectedFeature?: string | null;
  route?: string | null;
  deviceType?: string | null;
  browser?: string | null;
  operatingSystem?: string | null;
  frequency?: string | null;
  contactPermission?: boolean;
}

// ---------- Calculation engine ----------
export interface BatchIngredientInput {
  name?: string;
  unit?: string;
  amount: number | string;
}

export interface BatchIngredientResult {
  name: string;
  unit: string;
  scaledAmount: number | null;
  error: string | null;
}

export interface AbvIngredientInput {
  name?: string;
  volumeOz: number | string;
  abvPercent: number | string;
}

export interface AbvResult {
  finalAbvPercent: number;
  proof: number;
  totalVolumeOz: number;
}

export type VolumeUnit = 'oz' | 'ml' | 'cl' | 'tsp' | 'tbsp' | 'cup' | 'l';

// ---------- API envelope ----------
export interface ApiSuccessEnvelope<T> {
  data: T;
  devOnly?: Record<string, unknown>;
}

export interface ApiErrorEnvelope {
  error: {
    message: string;
    field: string | null;
  };
}
