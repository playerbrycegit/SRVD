/**
 * Optional local-development seed script. NOT required to run the application - all V1 screens
 * work correctly against an empty database (every list/empty-state was built and tested against
 * zero data, per the original design system's empty-state requirements). This exists purely to
 * save a new developer the few minutes of manually registering/verifying/logging a shift by hand
 * when poking around locally.
 *
 * Per this project's standing rule (data-access.ts's own comments, carried from the original
 * architecture): never run this against production. There is no production guard *enforced* here
 * beyond this comment and the NODE_ENV check below, because this script is not wired into any
 * deploy process - it must be run manually, on purpose, which is the actual safeguard.
 */
import { createDb, runMigrations } from '../src/shared-kernel/data-access';
import { AuthService } from '../src/modules/auth/service';
import { ShiftsService } from '../src/modules/shifts/service';
import { RecipesService } from '../src/modules/recipes/service';

if (process.env.NODE_ENV === 'production') {
  // eslint-disable-next-line no-console
  console.error('[seed] Refusing to run with NODE_ENV=production. This script is local-dev only.');
  process.exit(1);
}

const SEED_EMAIL = 'demo@srvd.local';
const SEED_PASSWORD = 'demopassword123';

const db = createDb();
runMigrations(db);

const auth = new AuthService(db);
const shifts = new ShiftsService(db);
const recipes = new RecipesService(db);

// Idempotent: if the demo account already exists, do nothing rather than erroring or duplicating.
let userId: string;
try {
  const result = auth.register({ email: SEED_EMAIL, password: SEED_PASSWORD });
  userId = result.id;
  const token = auth.issueVerificationToken(userId);
  auth.verifyEmail(token);
  // eslint-disable-next-line no-console
  console.log(`[seed] Created demo account: ${SEED_EMAIL} / ${SEED_PASSWORD}`);
} catch {
  const login = auth.login({ email: SEED_EMAIL, password: SEED_PASSWORD });
  userId = login.user.id;
  // eslint-disable-next-line no-console
  console.log(`[seed] Demo account already exists: ${SEED_EMAIL} / ${SEED_PASSWORD}`);
}

const existingShifts = shifts.listShifts(userId);
if (existingShifts.length === 0) {
  shifts.logShift(userId, { shift_date: '2026-07-10', cash_tips: 85, card_tips: 120 });
  shifts.logShift(userId, { shift_date: '2026-07-11', cash_tips: 60, card_tips: 95 });
  shifts.setGoal(userId, { target_amount: 500 });
  // eslint-disable-next-line no-console
  console.log('[seed] Added 2 demo shifts and a weekly goal.');
}

const existingRecipes = recipes.listRecipes(userId);
if (existingRecipes.length === 0) {
  recipes.createRecipe(userId, {
    name: 'Black Wolf',
    category: 'Shaken',
    glassware: 'Rocks glass, large cube',
    method: 'Shaken hard, served over weight.',
    tasting_notes: 'Quiet dominance.',
    ingredients: [
      { ingredient_name: 'Bourbon', amount: '2', unit: 'oz' },
      { ingredient_name: 'Blackberry', amount: '0.75', unit: 'oz' },
      { ingredient_name: 'Lemon', amount: '0.5', unit: 'oz' },
    ],
  });
  // eslint-disable-next-line no-console
  console.log('[seed] Added 1 demo recipe.');
}

// eslint-disable-next-line no-console
console.log('[seed] Done. Log in with:', SEED_EMAIL, '/', SEED_PASSWORD);
