import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBankStatementCSV, splitStatementLine, analyzePaymentMatch } from '../src/lib/reconciliation';
import type { Invoice, Tenant } from '../src/types';

const tenant = (over: Partial<Tenant> = {}): Tenant => ({
  id: 't1', fullName: 'Jane Wanjiku', email: 'jane@example.com', phone: '0712345678', unitNumber: 'A101', ...over
} as Tenant);

const invoice = (over: Partial<Invoice> = {}): Invoice => ({
  id: 'i1', tenantId: 't1', tenantName: 'Jane Wanjiku', invoiceNumber: 'INV-000111', unitNumber: 'A101',
  totalAmount: 65000, amountPaid: 0, status: 'Unpaid', ...over
} as Invoice);

const CSV = [
  'Date,Narration,Reference,Amount',
  '2026-10-20,EFT RENT UNIT A101 JANE WANJIKU,EQ98102910,65000',
  '2026-10-21,"Rent, deposit and water - A101",EQ98102911,5000'
].join('\n');

test('statement parsing is deterministic: same file twice gives the same references and ids', () => {
  const a = parseBankStatementCSV(CSV, 'Equity Bank', [tenant()], [invoice()]);
  const b = parseBankStatementCSV(CSV, 'Equity Bank', [tenant()], [invoice()]);
  assert.equal(a.length, 2);
  assert.deepEqual(a.map((r) => [r.id, r.referenceCode]), b.map((r) => [r.id, r.referenceCode]));
  assert.deepEqual(a.map((r) => r.referenceCode), ['EQ98102910', 'EQ98102911']);
});

test('a row without a bank reference never receives an invented one', () => {
  const rows = parseBankStatementCSV('2026-10-22,CASH DEPOSIT A101,,3000', 'Generic CSV', [tenant()], [invoice()]);
  // amount column present but no reference column value: must be flagged, never given a synthetic code
  const noRef = parseBankStatementCSV('2026-10-22,CASH DEPOSIT UNIT A101,3000', 'Generic CSV', [tenant()], [invoice()]);
  for (const r of [...rows, ...noRef]) {
    assert.equal(r.referenceCode, '');
    assert.ok(r.parseWarning && /reference/i.test(r.parseWarning));
    assert.doesNotMatch(r.id, /\d{10,}/); // no timestamps / random digits in ids
  }
  assert.ok(noRef.length === 1);
});

test('re-parsing a row without a reference gives identical output (no randomness)', () => {
  const x = parseBankStatementCSV('2026-10-22,CASH DEPOSIT UNIT A101,3000', 'Generic CSV');
  const y = parseBankStatementCSV('2026-10-22,CASH DEPOSIT UNIT A101,3000', 'Generic CSV');
  assert.deepEqual(x, y);
});

test('quoted narrations containing commas stay in one column', () => {
  assert.deepEqual(splitStatementLine('2026-10-21,"Rent, deposit and water - A101",EQ98102911,5000'),
    ['2026-10-21', 'Rent, deposit and water - A101', 'EQ98102911', '5000']);
  const rows = parseBankStatementCSV(CSV, 'Equity Bank', [tenant()], [invoice()]);
  assert.equal(rows[1].amount, 5000);
  assert.equal(rows[1].referenceCode, 'EQ98102911');
  assert.match(rows[1].description, /deposit and water/);
});

test('header rows and debits are skipped; reference-first layout is understood', () => {
  const csv = ['Date,Reference,Description,Debit,Credit', '2026-10-23,KCB1234567890,SALARY OUT,1000,', '2026-10-23,KCB1234567891,RENT A101,,65000'].join('\n');
  const rows = parseBankStatementCSV(csv, 'KCB Bank', [tenant()], [invoice()]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].referenceCode, 'KCB1234567891');
  assert.equal(rows[0].amount, 65000);
});

test('oversized statements are capped', () => {
  const big = Array.from({ length: 2500 }, (_, i) => `2026-10-20,RENT,EQ${String(100000 + i)},1000`).join('\n');
  assert.ok(parseBankStatementCSV(big, 'Equity Bank').length <= 2000);
});

test('matching never suggests an invoice that was rolled into a later one', () => {
  const rolled = invoice({ id: 'old', status: 'Overdue', carriedForwardToInvoiceId: 'new' });
  const current = invoice({ id: 'new', invoiceNumber: 'INV-000222', totalAmount: 130000 });
  const m = analyzePaymentMatch(65000, 'RENT UNIT A101', 'EQ1', '', '', [tenant()], [rolled, current]);
  assert.equal(m.suggestedInvoice?.id, 'new');
});

test('with a header row only the Credit column is read (never Debit or Balance)', () => {
  const csv = [
    'Date,Narration,Reference,Debit,Credit,Balance',
    '2026-10-24,ATM WITHDRAWAL,EQ55500001,2000,,480000',
    '2026-10-24,RENT A101 JANE,EQ55500002,,65000,545000'
  ].join('\n');
  const rows = parseBankStatementCSV(csv, 'Equity Bank', [tenant()], [invoice()]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].referenceCode, 'EQ55500002');
  assert.equal(rows[0].amount, 65000);
});
