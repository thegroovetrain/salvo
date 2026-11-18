// drizzle-kit's config (Story 12.1). `npm run db:generate -w server` diffs
// src/ledger/schema.ts against the checked-in snapshots and writes the next SQL
// migration into drizzle/. Generation only: boot applies those files through
// Drizzle's migrator (src/ledger/store.ts), and nothing ever pushes the schema.
// Outside tsconfig's rootDir (./src) on purpose — it is a tool input, not part
// of the server build.
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/ledger/schema.ts',
  out: './drizzle',
});
