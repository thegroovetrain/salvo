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
    // THE COMBAT-BOT PERCEPTION BOUNDARY (Story 6.4, tightened at the review
    // gate): server/src/game/ai/ may import inputs.js, participants.js,
    // signals.js (types), @salvo/shared and its own files — and may NOT
    // reach the world or the fog machinery at all:
    //   * `world.js` is banned OUTRIGHT, types included. The driver holds
    //     the narrow BotWorldPort and receives each bot's own record + a
    //     bound observe() thunk from world.ts every tick (BotTickEntry), so
    //     nothing in ai/ needs — or can hold — a World or a ShipRecord.
    //   * `perception.js` is TYPE-ONLY (PerceptionView). A VALUE import is a
    //     fog bypass: `observeSpectator` — the unfogged omniscient view —
    //     lives in that module, and one lint-clean value import of it would
    //     be a total wallhack. The import-surface pin test in bots.test.ts
    //     enforces the same line from the test side.
    //   * `combat.js` is banned by name: it is `export * from
    //     './equipment/guns.js'`, i.e. a sanctioned re-export that would
    //     bypass the `**/equipment/*` ban below.
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
              message: 'ai/ may not reach world.js AT ALL (types included) — world.ts injects the per-bot record and observe thunk (BotTickEntry); state reads go through the BotWorldPort.',
            },
            {
              group: ['**/perception.js'],
              allowTypeImports: true,
              message: 'ai/ may import perception.js types only (PerceptionView) — the fogged view arrives as an injected thunk, and a value import (observe/observeSpectator) is a fog bypass.',
            },
            {
              group: ['**/match.js', '**/drones.js', '**/frames.js', '**/combat.js', '**/equipment/*', '**/rooms/*'],
              message: 'ai/ is perception-gated: no match/drones/frames/combat/equipment/rooms imports (see game/ai/types.ts).',
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
