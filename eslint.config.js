import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // ---------------------------------------------------------------------------
  // THE ARCHITECTURAL CONSTRAINT (DESIGN.md §14)
  //
  // `sim/` is pure logic with zero DOM. It must never import from `render/` or
  // `ui/`. This is what makes the headless balance harness possible, and it is
  // why tuning the simulation can never break the visuals.
  //
  // This is a lint rule, not a good intention.
  // ---------------------------------------------------------------------------
  {
    files: ['src/sim/**/*.ts', 'src/data/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/render/**', '**/ui/**', '**/save/**'],
              message:
                'sim/ and data/ must stay pure. No imports from render/, ui/ or save/ — this is what keeps the headless balance harness possible.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'sim/ must be DOM-free so it can run headless.' },
        { name: 'document', message: 'sim/ must be DOM-free so it can run headless.' },
        { name: 'localStorage', message: 'sim/ must be DOM-free. Persistence belongs in save/.' },
        { name: 'requestAnimationFrame', message: 'sim/ is tick-driven, not frame-driven.' },
      ],
    },
  },
);
