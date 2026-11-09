/**
 * Landlord subscription activation (platform revenue). Idempotent per payment reference.
 */
import { getStore } from './store.js';
import { COLLECTIONS } from './db.js';
import { claimSubscriptionReference, refKey } from './ledger.js';
import type { Landlord } from '../types.js';

export const PLATFORM_SUBSCRIPTION_AMOUNT = Number(process.env.PLATFORM_SUBSCRIPTION_AMOUNT || 20000);

export type ActivationResult = { status: 'activated' | 'duplicate' | 'underpaid' | 'not-found'; landlord?: Landlord };

/** Activates/extends a landlord's licence by one year, exactly once per reference. */
export async function activateSubscription(landlordId: string, reference: string, amount: number): Promise<ActivationResult> {
  const store = getStore();
  const landlord = await store.get<Landlord>(COLLECTIONS.LANDLORDS, landlordId);
  if (!landlord) return { status: 'not-found' };
  if (amount + 0.5 < PLATFORM_SUBSCRIPTION_AMOUNT) return { status: 'underpaid', landlord };
  if (!(await claimSubscriptionReference(reference, landlordId, amount))) return { status: 'duplicate', landlord };
  try {
    const base = landlord.subscriptionExpiry && new Date(landlord.subscriptionExpiry) > new Date() ? new Date(landlord.subscriptionExpiry) : new Date();
    base.setFullYear(base.getFullYear() + 1);
    await store.update(COLLECTIONS.LANDLORDS, landlordId, {
      subscriptionStatus: 'Active', subscriptionPaid: true,
      subscriptionExpiry: base.toISOString().split('T')[0], receiptCode: reference
    });
  } catch (err) {
    await store.delete(COLLECTIONS.REF_CLAIMS, `ref-${refKey(reference)}`).catch(() => undefined); // let the retry succeed
    throw err;
  }
  return { status: 'activated', landlord: { ...landlord, subscriptionStatus: 'Active', subscriptionPaid: true } };
}
