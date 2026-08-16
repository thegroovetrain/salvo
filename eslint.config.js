import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.recommended],
    rules: {
      // Enforced: no function may exceed cyclomatic complexity of 10
      'complexity': ['error', 10],
      // Advisory: functions over 50 lines get a warning
      'max-lines-per-function': ['warn', { max: 50, skipBlankLines: true, skipComments: true }],
      // Allow unused vars prefixed with _
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // THE COMBAT-BOT PERCEPTION BOUNDARY (Story 6.4): server/src/game/ai/ may
    // import perception.js, inputs.js, participants.js, signals.js (types),
    // @salvo/shared and its own files — and may NOT import the world's
    // internals. `World`/`ShipRecord` stay reachable as TYPES ONLY
    // (allowTypeImports on the world.js group): the driver needs the World
    // type for perception.observe()'s signature and the narrow port, while a
    // VALUE import of world.js (or match/drones/frames/equipment/rooms at
    // all, types included) is a structural cheat path and fails the lint.
    // Built-in rule via the installed typescript-eslint extension — no new
    // dependency.
    files: ['server/src/game/ai/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/world.js'],
              allowTypeImports: true,
              message: 'ai/ may reach World as a TYPE only — state reads go through the BotWorldPort, perception through observe().',
            },
            {
              group: ['**/match.js', '**/drones.js', '**/frames.js', '**/equipment/*', '**/rooms/*'],
              message: 'ai/ is perception-gated: no match/drones/frames/equipment/rooms imports (see game/ai/types.ts).',
            },
          ],
        },
      ],
    },
  },
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/*.js', '**/__tests__/**', '.claude/**', '.gstack/**'],
  },
);
