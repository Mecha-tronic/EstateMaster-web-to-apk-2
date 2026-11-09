import { Tenant, Invoice, UnaccountedPayment, BankStatementRecord, Payment } from '../types';

export interface MatchAnalysis {
  confidence: number;
  reason: string;
  suggestedTenant?: Tenant;
  suggestedInvoice?: Invoice;
}

/**
 * Intelligent reconciliation matching engine for rent payments.
 * Compares incoming payment attributes against active tenants and unpaid invoices.
 */
export function analyzePaymentMatch(
  amount: number,
  narration: string = '',
  referenceCode: string = '',
  senderName: string = '',
  senderPhone: string = '',
  tenants: Tenant[] = [],
  invoices: Invoice[] = []
): MatchAnalysis {
  const normNarration = (narration + ' ' + senderName).toLowerCase();
  const cleanPhone = senderPhone.replace(/[^0-9]/g, '');
  // Invoices whose balance was rolled into a later invoice owe nothing themselves.
  const unpaidInvoices = invoices.filter((i) => i.status !== 'Paid' && !i.carriedForwardToInvoiceId);

  let bestMatch: MatchAnalysis = {
    confidence: 0,
    reason: 'No clear matching tenant or unit detected.'
  };

  // 1. Check for exact unit number occurrences in narration (e.g. "A101", "B201", "Suite 301")
  for (const tenant of tenants) {
    let score = 0;
    const reasons: string[] = [];
    const unit = tenant.unitNumber ? tenant.unitNumber.toLowerCase().trim() : '';

    if (unit && unit.length >= 2 && normNarration.includes(unit)) {
      score += 55;
      reasons.push(`Unit ${tenant.unitNumber} detected in narration`);
    }

    // 2. Check for tenant full name or parts of name in narration / sender name
    const nameParts = tenant.fullName.toLowerCase().split(' ').filter((p) => p.length >= 3);
    const matchedParts = nameParts.filter((p) => normNarration.includes(p));
    if (matchedParts.length > 0) {
      const nameScore = Math.min(40, matchedParts.length * 20);
      score += nameScore;
      reasons.push(`Tenant name '${tenant.fullName}' matched`);
    }

    // 3. Check for phone match
    if (cleanPhone && tenant.phone) {
      const tenantCleanPhone = tenant.phone.replace(/[^0-9]/g, '');
      if (tenantCleanPhone.endsWith(cleanPhone.slice(-8)) || cleanPhone.endsWith(tenantCleanPhone.slice(-8))) {
        score += 50;
        reasons.push(`Sender phone matches tenant profile (${tenant.phone})`);
      }
    }

    // 4. Check for invoice amount match
    const matchingInvoice = unpaidInvoices.find(
      (inv) =>
        (inv.tenantId === tenant.id || inv.tenantName.toLowerCase() === tenant.fullName.toLowerCase()) &&
        (Math.abs(inv.totalAmount - (inv.amountPaid || 0) - amount) < 1 || Math.abs(inv.totalAmount - amount) < 1)
    );

    if (matchingInvoice) {
      score += 35;
      reasons.push(`Exact amount KSh ${amount.toLocaleString()} matches Invoice #${matchingInvoice.invoiceNumber}`);
    } else if (tenant.monthlyRent && Math.abs(tenant.monthlyRent - amount) < 1) {
      score += 25;
      reasons.push(`Amount matches monthly lease rent (KSh ${tenant.monthlyRent.toLocaleString()})`);
    }

    if (score > bestMatch.confidence) {
      bestMatch = {
        confidence: Math.min(100, score),
        reason: reasons.join(' • '),
        suggestedTenant: tenant,
        suggestedInvoice: matchingInvoice || unpaidInvoices.find((i) => i.tenantId === tenant.id)
      };
    }
  }

  // Fallback: If no tenant matched yet, check if any unpaid invoice matches amount directly
  if (bestMatch.confidence < 40) {
    const directAmountInvoice = unpaidInvoices.find(
      (inv) => Math.abs(inv.totalAmount - (inv.amountPaid || 0) - amount) < 1
    );
    if (directAmountInvoice) {
      const tenantOfInvoice = tenants.find((t) => t.id === directAmountInvoice.tenantId);
      bestMatch = {
        confidence: 45,
        reason: `Amount matches outstanding invoice #${directAmountInvoice.invoiceNumber} for ${directAmountInvoice.tenantName}`,
        suggestedTenant: tenantOfInvoice,
        suggestedInvoice: directAmountInvoice
      };
    }
  }

  return bestMatch;
}

/** Splits one CSV / TSV line, honouring "quoted, fields" so narrations containing commas stay in one column. */
export function splitStatementLine(line: string): string[] {
  const delimiter = line.includes('\t') ? '\t' : ',';
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i++; } else quoted = !quoted;
    } else if (ch === delimiter && !quoted) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** A bank-issued transaction reference: 6-32 letters / digits / dashes with at least one digit, no spaces. */
const looksLikeReference = (v: string): boolean => /^(?=.*\d)[A-Za-z0-9][A-Za-z0-9_-]{5,31}$/.test(v);

const toAmount = (v: string): number => {
  const n = parseFloat(String(v || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Standard Bank & M-Pesa CSV Statement Parser.
 *
 * IMPORTANT (anti-double-entry): a row only ever carries the reference the BANK printed. Earlier versions invented
 * a random one when the column was missing, which made re-uploading the same statement post the same deposit twice.
 * Rows without a genuine reference are returned with an empty `referenceCode` and a `parseWarning`; the UI refuses to
 * submit them and the server would reject them anyway.
 */
export function parseBankStatementCSV(
  csvContent: string,
  bankName: string,
  tenants: Tenant[] = [],
  invoices: Invoice[] = []
): BankStatementRecord[] {
  if (!csvContent || !csvContent.trim()) return [];

  const lines = csvContent.split(/\r?\n/).filter((l) => l.trim().length > 0).slice(0, 2000);
  const records: BankStatementRecord[] = [];

  // Column positions learned from the header row, when the file has one.
  let creditIdx = -1;
  let refIdx = -1;
  let descIdx = -1;

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx].trim();
    const lower = line.toLowerCase();
    // Header rows: remember where the credit / reference / narration columns are, then skip the row.
    if (lower.includes('date') && (lower.includes('description') || lower.includes('narration') || lower.includes('amount') || lower.includes('credit') || lower.includes('reference') || lower.includes('particulars'))) {
      const names = splitStatementLine(line).map((c) => c.toLowerCase());
      creditIdx = names.findIndex((c) => /(credit|deposit|paid in|money in)/.test(c) && !/debit/.test(c));
      if (creditIdx < 0) creditIdx = names.findIndex((c) => /amount/.test(c) && !/(debit|balance|withdraw)/.test(c));
      refIdx = names.findIndex((c) => /(ref|transaction id|txn|receipt)/.test(c));
      descIdx = names.findIndex((c) => /(narration|description|details|particulars|remarks)/.test(c));
      continue;
    }

    const cols = splitStatementLine(line);
    if (cols.length < 3) continue;

    const dateStr = cols[0];
    let desc = cols[1];
    let refCode = '';
    let amountNum = 0;

    if (creditIdx >= 0 && creditIdx < cols.length) {
      // Header known: only the CREDIT column counts. A blank credit cell means a debit row, which is ignored.
      amountNum = toAmount(cols[creditIdx]);
      if (descIdx >= 0 && cols[descIdx]) desc = cols[descIdx];
      if (refIdx >= 0 && looksLikeReference(cols[refIdx] || '')) refCode = cols[refIdx];
      else refCode = (desc.match(/\b(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{8,12}\b/i) || [''])[0];
    } else if (cols.length >= 4) {
      if (looksLikeReference(cols[2])) {
        // Format A: Date, Description, Reference, Amount (credit)
        refCode = cols[2];
        amountNum = toAmount(cols[3]);
      } else if (looksLikeReference(cols[1])) {
        // Format B: Date, Reference, Description, [Debit,] Credit. With no header the LAST column is the credit,
        // never an earlier (debit) column.
        refCode = cols[1];
        desc = cols[2];
        amountNum = toAmount(cols[cols.length - 1]);
      } else {
        // Reference hidden inside the narration (e.g. an M-Pesa code)
        refCode = (cols[1].match(/\b(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{8,12}\b/i) || [''])[0];
        amountNum = toAmount(cols[cols.length - 1]);
      }
    } else {
      amountNum = toAmount(cols[2]);
    }

    // Ignore debit / zero transactions
    if (amountNum <= 0) continue;

    const match = analyzePaymentMatch(amountNum, desc, refCode, '', '', tenants, invoices);

    records.push({
      id: `stmt-${idx}-${(refCode || 'noref').toUpperCase()}`,
      date: dateStr || '',
      referenceCode: refCode.toUpperCase(),
      description: desc || 'Direct Bank Deposit',
      amount: amountNum,
      bankName: bankName || 'Bank / M-Pesa Statement',
      matchedTenantId: match.suggestedTenant?.id,
      matchedTenantName: match.suggestedTenant?.fullName,
      matchedUnitNumber: match.suggestedTenant?.unitNumber,
      matchedInvoiceId: match.suggestedInvoice?.id,
      matchConfidence: match.confidence,
      matchReason: match.reason,
      isReconciled: false,
      parseWarning: refCode ? undefined : 'No bank reference found on this row. It cannot be posted: add the reference column and upload again.'
    });
  }

  return records;
}
