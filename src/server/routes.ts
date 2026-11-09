/**
 * Registers every API route on an Express-compatible app (or the fake router used in tests).
 */
import { App } from './http.js';
import { registerAuthRoutes } from './authRoutes.js';
import { registerAccountRoutes } from './accountRoutes.js';
import { registerBillingRoutes } from './billingRoutes.js';
import { registerMpesaRoutes } from './mpesaRoutes.js';
import { registerBankRoutes, BankRouteDeps, subscriptionReferenceFor } from './bankRoutes.js';
import { registerOpsRoutes } from './opsRoutes.js';
import { logSecurityEvent } from './audit.js';
import { sendReceipt } from './receipts.js';
import { dispatchSystemEmail } from './mailer.js';
import { getStore } from './store.js';
import { COLLECTIONS } from './db.js';
import { escapeHtml } from '../lib/security.js';
import type { Landlord } from '../types.js';

export function buildBankDeps(): BankRouteDeps {
  return {
    onPaymentPosted: (payment, invoice) => sendReceipt(payment, invoice),
    audit: logSecurityEvent as any,
    onQueued: async (u) => {
      if (!u.landlordId) return;
      const l = await getStore().get<Landlord>(COLLECTIONS.LANDLORDS, u.landlordId);
      if (!l) return;
      await dispatchSystemEmail({
        recipientEmail: l.email, recipientName: l.name, landlordId: l.id, emailType: 'Payment Receipt', prefix: 'RCT',
        subject: `A deposit of KSh ${u.amount.toLocaleString('en-KE')} needs your attention`,
        bodyHtml: `<p>A deposit (reference <strong>${escapeHtml(u.referenceCode)}</strong>) could not be matched to an invoice automatically. Open <strong>Payments &rarr; Unaccounted</strong> to assign it to the right tenant.</p>`
      });
    },
    onSubscriptionActivated: async (landlord) => {
      await dispatchSystemEmail({
        recipientEmail: landlord.email, recipientName: landlord.name, landlordId: landlord.id, emailType: 'Payment Receipt', prefix: 'SUB',
        subject: 'EstateMaster subscription activated',
        bodyHtml: `<p>Thank you, <strong>${escapeHtml(landlord.name)}</strong>. Your annual EstateMaster licence is now active (reference ${escapeHtml(subscriptionReferenceFor(landlord))}).</p>`
      });
    }
  };
}

export function registerAllRoutes(app: App) {
  const deps = buildBankDeps();
  app.get('/api/health', (_req: any, res: any) => res.json({ status: 'ok', time: new Date().toISOString() }));
  registerAuthRoutes(app);
  registerAccountRoutes(app);
  registerBillingRoutes(app);
  registerMpesaRoutes(app, deps);
  registerBankRoutes(app, deps);
  registerOpsRoutes(app);
}
