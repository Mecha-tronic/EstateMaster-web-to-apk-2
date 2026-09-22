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
  const unpaidInvoices = invoices.filter((i) => i.status !== 'Paid');

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

/**
 * Standard Bank & M-Pesa CSV Statement Parser
 * Parses lines into structured BankStatementRecord entries.
 */
export function parseBankStatementCSV(
  csvContent: string,
  bankName: string,
  tenants: Tenant[] = [],
  invoices: Invoice[] = []
): BankStatementRecord[] {
  if (!csvContent || !csvContent.trim()) return [];

  const lines = csvContent.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const records: BankStatementRecord[] = [];

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx].trim();
    // Skip common headers
    if (
      line.toLowerCase().includes('date') &&
      (line.toLowerCase().includes('description') ||
        line.toLowerCase().includes('narration') ||
        line.toLowerCase().includes('amount') ||
        line.toLowerCase().includes('credit'))
    ) {
      continue;
    }

    // Parse comma or tab separated fields
    const delimiter = line.includes('\t') ? '\t' : ',';
    const cols = line.split(delimiter).map((c) => c.replace(/^["']|["']$/g, '').trim());

    if (cols.length < 3) continue;

    let dateStr = cols[0];
    let desc = cols[1];
    let refCode = '';
    let amountNum = 0;

    // Detect Kenyan Bank Column Layouts:
    // Format A: Date, Description, Reference, Amount (or Credit)
    // Format B: Date, Reference, Description, Debit, Credit
    if (cols.length >= 4) {
      if (cols[2].match(/^[A-Z0-9_-]{5,20}$/i)) {
        refCode = cols[2];
        amountNum = parseFloat(cols[3].replace(/[^0-9.-]/g, '')) || 0;
      } else {
        refCode = cols[1].match(/[A-Z0-9]{8,12}/i)?.[0] || `TX-${Date.now().toString().slice(-6)}-${idx}`;
        // Find first positive numeric col starting from right
        for (let c = cols.length - 1; c >= 2; c--) {
          const val = parseFloat(cols[c].replace(/[^0-9.-]/g, ''));
          if (!isNaN(val) && val > 0) {
            amountNum = val;
            break;
          }
        }
      }
    } else {
      refCode = `REF-${Math.floor(100000 + Math.random() * 900000)}`;
      amountNum = parseFloat(cols[2].replace(/[^0-9.-]/g, '')) || 0;
    }

    // Ignore debit / zero transactions
    if (amountNum <= 0) continue;

    // Run reconciliation analysis against this line
    const match = analyzePaymentMatch(amountNum, desc, refCode, '', '', tenants, invoices);

    records.push({
      id: `stmt-${Date.now()}-${idx}`,
      date: dateStr || new Date().toISOString().split('T')[0],
      referenceCode: refCode || `TRX-${Math.floor(100000 + Math.random() * 900000)}`,
      description: desc || 'Direct Bank Deposit',
      amount: amountNum,
      bankName: bankName || 'Bank / M-Pesa Statement',
      matchedTenantId: match.suggestedTenant?.id,
      matchedTenantName: match.suggestedTenant?.fullName,
      matchedUnitNumber: match.suggestedTenant?.unitNumber,
      matchedInvoiceId: match.suggestedInvoice?.id,
      matchConfidence: match.confidence,
      matchReason: match.reason,
      isReconciled: false
    });
  }

  return records;
}

/**
 * Realistic Sample Kenyan Bank & M-Pesa Statements for Demo & Testing
 */
export const SAMPLE_BANK_STATEMENTS = {
  equity: `Date,Description,Reference,Credit
2026-09-18,EFT RENT UNIT A101 JANE WANJIKU,EQ98102910,65000
2026-09-19,PESALINK FROM DAVID OMONDI UNIT B201,EQ98102922,95000
2026-09-20,DIRECT DEPOSIT SUITE 301 GRANDVIEW,EQ98103011,120000
2026-09-21,MOBILE TRANSFER KPLC ELECTRICITY REBATE,EQ98103045,4500
2026-09-22,CASH DEPOSIT KILIMANI BRANCH NO NARRATION,EQ98103190,48000`,

  kcb: `Date,Narration,Transaction_Ref,Amount
2026-09-15,KCB MPESA TO ACC JANE WANJIKU A101,KCB-771920,65000
2026-09-17,STANDING ORDER DAVID OMONDI RENT B201,KCB-771945,95000
2026-09-21,PESALINK INWARD DEPOSIT A102 AVAILABLE UNIT,KCB-772001,48000
2026-09-22,UNIDENTIFIED CASHIER REMITTANCE TILL 998,KCB-772109,25000`,

  mpesaTill: `Date,Description,ReceiptCode,Amount
2026-09-18,CustomerBuyGoodsOnline - 0712345678 JANE WANJIKU,SAB98214K1,65000
2026-09-19,CustomerBuyGoodsOnline - 0733456789 DAVID OMONDI,SAB98214K2,95000
2026-09-20,CustomerPayBillOnline - ACC: A101 RENT SEPTEMBER,SAB98214K3,65000
2026-09-21,CustomerBuyGoodsOnline - 0722000111 UNKNOWN SENDER,SAB98214K4,35000
2026-09-22,CustomerBuyGoodsOnline - 0799444333 ACC: SUITE 301,SAB98214K5,120000`
};

/**
 * Initial sample unaccounted payments for simulation if local store is empty
 */
export const DEFAULT_UNACCOUNTED_PAYMENTS: UnaccountedPayment[] = [
  {
    id: 'unacc-1',
    source: 'M-Pesa Till',
    referenceCode: 'SAB8912401',
    senderName: 'Peter Kamau (Spouse/Relative)',
    senderPhone: '0722 987 654',
    amount: 65000,
    receivedDate: '2026-09-21T09:30:00.000Z',
    rawNarration: 'Buy Goods Till #892102 from 0722987654 (Ref: Peter Kamau)',
    accountReferenceRaw: '',
    status: 'Pending Assignment',
    matchConfidence: 85,
    suggestedTenantName: 'Jane Wanjiku',
    suggestedUnitNumber: 'A101',
    notes: 'Phone number matches Emergency Contact for Jane Wanjiku (Unit A101). Amount exactly matches monthly rent KSh 65,000.'
  },
  {
    id: 'unacc-2',
    source: 'Bank Transfer',
    referenceCode: 'EFT-8812903',
    senderName: 'Apex Tech Solutions Ltd',
    senderPhone: '',
    amount: 95000,
    receivedDate: '2026-09-20T14:15:00.000Z',
    rawNarration: 'EFT Corporate Housing Allowance REF 9901 - B201',
    accountReferenceRaw: 'B201',
    bankName: 'Equity Bank',
    status: 'Pending Assignment',
    matchConfidence: 90,
    suggestedTenantName: 'David Omondi',
    suggestedUnitNumber: 'B201',
    notes: 'Narration contains unit reference B201. Amount KSh 95,000 matches David Omondi rent.'
  },
  {
    id: 'unacc-3',
    source: 'M-Pesa Paybill',
    referenceCode: 'SAB7712399',
    senderName: 'Mary Atieno',
    senderPhone: '0746 549 710',
    amount: 48000,
    receivedDate: '2026-09-22T08:00:00.000Z',
    rawNarration: 'Paybill 247247 Acc: "RENT HOUSE"',
    accountReferenceRaw: 'RENT HOUSE',
    status: 'Pending Assignment',
    matchConfidence: 50,
    suggestedTenantName: '',
    suggestedUnitNumber: 'A102',
    notes: 'Tenant typed generic "RENT HOUSE" instead of unit number. Amount matches Unit A102 rent (KSh 48,000).'
  }
];
