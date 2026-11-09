/**
 * EstateMaster server entry point.
 *
 * All business logic lives in src/server/*:
 *   auth.ts / authRoutes.ts   sessions, login, 2FA, password reset, step-up
 *   accountRoutes.ts          landlords, properties, units, tenants (ownership-scoped)
 *   billingRoutes.ts          invoices, quotes, payments, unaccounted queue, statement reconciliation, PDFs
 *   ledger.ts                 the ONLY code that posts money (atomic, claim-once)
 *   bankRoutes.ts             Equity (Jenga) / KCB (Buni) / Co-op / PesaLink webhooks, verification, status
 *   mpesaRoutes.ts            Daraja STK + C2B (confirmed before posting)
 *   src/lib/bankService.ts    bank OAuth drivers, signature verification, payload normalisers, matching engine
 */
import dotenv from 'dotenv';
dotenv.config();

import { initStore } from './src/server/store.js';
import { createApp } from './src/server/app.js';
import { assertProductionConfig } from './src/server/config.js';
import { runStartupMigration } from './src/server/migrate.js';
import { seedDemoData } from './src/server/demoSeed.js';

async function startServer() {
  assertProductionConfig();
  await initStore();
  await runStartupMigration();
  await seedDemoData();

  const app = await createApp();
  const PORT = Number(process.env.PORT || 3000);
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`EstateMaster server running on http://0.0.0.0:${PORT} (${process.env.NODE_ENV || 'development'})`);
  });
}

startServer().catch((err) => {
  console.error('Fatal startup error:', err?.message || err);
  process.exit(1);
});
