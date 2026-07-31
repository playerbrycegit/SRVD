// SRVD lint config (flat, ESLint 9). Mirrors the original .eslintrc.json intent
// (Stage 9 §1-4 coding standards), now executable. TS source uses the typescript-eslint
// recommended set; .js test files are intentionally CommonJS (run via `node --test` against
// compiled dist, covered by the 172-test suite) and linted with a plain config.
//
// eqeqeq uses { null: 'ignore' } to permit the deliberate `!= null` idiom (matches null AND
// undefined) while enforcing ===/!== everywhere else.
const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  {
    ignores: [
      'dist/**', 'node_modules/**', 'web/**', '**/*.sqlite',
      'src/shared-kernel/data-access.postgres.reference.ts',
      'eslint.config.js',
    ],
  },
  { linterOptions: { reportUnusedDisableDirectives: 'off' } },
  {
    files: ['src/**/*.ts', 'scripts/**/*.ts'],
    extends: [...tseslint.configs.recommended],
    rules: {
      'no-console': ['warn', { allow: ['error'] }],
      'no-eval': 'error',
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    files: ['test/**/*.js'],
    rules: {
      'no-eval': 'error',
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
);
