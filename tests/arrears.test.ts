import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateTenantArrears } from '../src/lib/arrears.ts';

const tenant: any = { id: 't1', fullName: 'Tee', email: 't@example.com', monthlyRent: 50000, unitNumber: 'A1', propertyName: 'P' };
const inv = (o: any): any => ({ tenantId: 't1', invoiceNumber: o.id, issueDate: '2026-10-01', status: 'Unpaid', amountPaid: 0, ...o });

test('rolled-over arrears are counted once, not once per invoice', () => {
  const sep = inv({ id: 'sep', totalAmount: 50000, amountPaid: 10000, status: 'Partial', carriedForwardToInvoiceId: 'oct' });
  const oct = inv({ id: 'oct', totalAmount: 90000, previousArrears: 40000 });
  const r = calculateTenantArrears(tenant, [sep, oct], []);
  assert.equal(r.totalInvoiced, 100000); // 50,000 (Sep) + 50,000 own charges (Oct)
  assert.equal(r.totalPaid, 10000);
  assert.equal(r.totalArrears, 90000); // everything still owed is on the October invoice
  assert.equal(r.monthlyBreakdown.find((m) => m.invoiceId === 'sep')!.status, 'Carried Forward');
  assert.equal(r.monthlyBreakdown.find((m) => m.invoiceId === 'sep')!.arrearsRemaining, 0);
});

test('a landlord-waived part of the arrears is not owed any more', () => {
  const sep = inv({ id: 'sep', totalAmount: 50000, amountPaid: 0, carriedForwardToInvoiceId: 'oct' });
  const oct = inv({ id: 'oct', totalAmount: 55000, previousArrears: 5000 }); // 45,000 waived
  assert.equal(calculateTenantArrears(tenant, [sep, oct], []).totalArrears, 55000);
});

test('only the tenant\'s own records count (same name or e-mail on another tenant is ignored)', () => {
  const other = inv({ id: 'x', tenantId: 't2', tenantName: 'Tee', tenantEmail: 't@example.com', totalAmount: 50000 });
  const r = calculateTenantArrears(tenant, [other], []);
  assert.equal(r.totalInvoiced, 0);
  assert.equal(r.totalArrears, 0);
});

test('overpayment becomes credit; fully paid is up to date', () => {
  const paid = inv({ id: 'a', totalAmount: 50000, amountPaid: 50000, status: 'Paid' });
  assert.equal(calculateTenantArrears(tenant, [paid], []).status, 'Up-To-Date');
  const over = inv({ id: 'b', totalAmount: 50000, amountPaid: 60000, status: 'Paid' });
  const r = calculateTenantArrears(tenant, [over], []);
  assert.equal(r.totalOverpaid, 10000);
  assert.equal(r.status, 'Overpaid / In Credit');
});
