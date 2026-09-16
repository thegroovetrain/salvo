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
    // THE MEASUREMENT SCRIPTS GET STATIC ANALYSIS TOO (Story 7.1 review).
    // The config scoped to `**/*.ts` only, so `client/scripts/*.mjs` landed
    // entirely unlinted — and shipped a duplicate object key in the audit
    // record's own basis block that nothing could have caught. These files
    // decide what the perf evidence says, so they get at least the correctness
    // rules; `complexity` stays off here because a capture script is a linear
    // recipe and splitting one for a metric would make it harder to read.
    files: ['client/scripts/**/*.mjs'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module' },
    rules: {
      'no-dupe-keys': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-undef': 'off', // node globals; no env plugin is installed and none is worth adding
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
    // THE DAMAGE GATE'S FENCE (Story 8.4, AR47 / placement rule 12): hull hp is
    // decremented in EXACTLY ONE place, `World.applyDamage` in
    // server/src/game/world.ts. Everywhere else in the server an `x.hp -=` is a
    // defect of the same class as a spatial emit outside frames.ts — it routes
    // around no-friendly-fire, the shield, the assist ledger, the sink check
    // and the `dmg` event all at once.
    //
    // A COMPANION GREP TEST (damageGate.test.ts) pins the other half: that
    // world.ts itself contains exactly one such decrement and that
    // applyStorm/hitShip/burnShip contain none. The two are complementary — the
    // lint rule cannot be scoped INSIDE a file, and a grep cannot see the other
    // 60 server files.
    //
    // `buoy.hp -=` in world.ts is the one non-hull decrement and is allowed by
    // the same file exception (a buoy is not a ship: no XP, no feed line, no
    // dmg event, and it never enters the gate).
    files: ['server/src/**/*.ts'],
    ignores: ['server/src/game/world.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "AssignmentExpression[operator='-='] > MemberExpression.left[property.name='hp']",
          message: 'Hull hp is decremented ONLY by World.applyDamage (game/world.ts) — the damage gate (Story 8.4, AR47). Route the damage through it.',
        },
      ],
    },
  },
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/*.js', '**/__tests__/**', '.claude/**', '.gstack/**'],
  },
);
