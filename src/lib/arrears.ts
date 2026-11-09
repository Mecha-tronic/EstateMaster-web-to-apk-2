import { Invoice, Payment, Tenant } from '../types';

export interface TenantArrearsSummary {
  tenantId: string;
  tenantName: string;
  unitNumber: string;
  propertyName: string;
  monthlyRent: number;
  totalInvoiced: number;
  totalPaid: number;
  totalArrears: number;
  totalOverpaid: number;
  netBalance: number; // positive = owed arrears, negative = credit/overpayment
  status: 'Up-To-Date' | 'Partial Arrears' | 'Heavy Arrears' | 'Overpaid / In Credit';
  skippedMonthsCount: number;
  partialMonthsCount: number;
  overpaidInvoicesCount: number;
  monthlyBreakdown: {
    invoiceId: string;
    invoiceNumber: string;
    periodMonth: string;
    dueDate?: string;
    totalAmount: number;
    amountPaid: number;
    arrearsRemaining: number;
    overpaidAmount: number;
    status: 'Paid' | 'Partial' | 'Unpaid' | 'Overdue' | 'Overpaid' | 'Carried Forward';
    /** Arrears from older invoices that this invoice already includes in its total. */
    previousArrears: number;
    /** Set on an OLDER invoice whose unpaid balance was rolled into a newer one (never collected twice). */
    carriedForwardToInvoiceId?: string;
    /** This invoice's own period charges (total minus the arrears it carries). */
    ownCharges: number;
  }[];
}

export function calculateTenantArrears(
  tenant: Tenant,
  invoices: Invoice[],
  payments: Payment[]
): TenantArrearsSummary {
  // Records belong to a tenant by id only (names and e-mails are not unique and must never merge two tenants' ledgers).
  const tenantInvoices = invoices.filter((inv) => inv.tenantId === tenant.id);
  const tenantPayments = payments.filter(
    (p) => p.tenantId === tenant.id || Boolean(p.invoiceId && tenantInvoices.some((inv) => inv.id === p.invoiceId))
  );

  let totalInvoiced = 0; // each period's OWN charges (carried arrears are not charged twice)
  let totalPaid = 0;
  let totalArrears = 0;
  let totalOverpaid = 0;
  let skippedMonthsCount = 0;
  let partialMonthsCount = 0;
  let overpaidInvoicesCount = 0;

  const monthlyBreakdown = tenantInvoices.map((inv) => {
    const invTotal = Number(inv.totalAmount) || 0;
    const previousArrears = Math.min(Math.max(0, Number(inv.previousArrears) || 0), invTotal);
    // A newer invoice's total already contains the arrears it collects, so they must not be counted again.
    const ownCharges = invTotal - previousArrears;
    const rolledForward = Boolean(inv.carriedForwardToInvoiceId);

    const invPayments = tenantPayments
      .filter((p) => (p.invoiceId === inv.id || p.invoiceId === inv.invoiceNumber) && (p.status === 'Completed' || !p.status))
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const invPaid = Math.max(Number(inv.amountPaid) || 0, invPayments);

    // A rolled-forward invoice is collected through the newer invoice only: it owes nothing itself.
    const remaining = rolledForward ? 0 : Math.max(0, invTotal - invPaid);
    const overpaidAmount = Math.max(0, invPaid - (rolledForward ? ownCharges : invTotal));

    totalInvoiced += ownCharges;
    totalPaid += invPaid;
    totalArrears += remaining;
    totalOverpaid += overpaidAmount;
    if (overpaidAmount > 0) overpaidInvoicesCount++;
    if (!rolledForward) {
      if (invPaid === 0 && invTotal > 0) skippedMonthsCount++;
      else if (invPaid > 0 && invPaid < invTotal) partialMonthsCount++;
    }

    let status: 'Paid' | 'Partial' | 'Unpaid' | 'Overdue' | 'Overpaid' | 'Carried Forward' = (inv.status as any) || 'Unpaid';
    if (rolledForward) status = 'Carried Forward';
    else if (overpaidAmount > 0) status = 'Overpaid';
    else if (invPaid >= invTotal && invTotal > 0) status = 'Paid';
    else if (invPaid > 0 && invPaid < invTotal) status = 'Partial';

    return {
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      periodMonth: inv.periodMonth || inv.issueDate || 'Monthly Invoice',
      dueDate: inv.dueDate,
      totalAmount: invTotal,
      amountPaid: invPaid,
      arrearsRemaining: remaining,
      overpaidAmount,
      status,
      previousArrears,
      carriedForwardToInvoiceId: inv.carriedForwardToInvoiceId,
      ownCharges
    };
  });

  // Net balance: positive = arrears owed, negative = account credit / overpayment.
  const netBalance = totalArrears - totalOverpaid;

  let status: 'Up-To-Date' | 'Partial Arrears' | 'Heavy Arrears' | 'Overpaid / In Credit' = 'Up-To-Date';
  if (totalArrears > 0) {
    if (skippedMonthsCount > 1 || totalArrears >= (tenant.monthlyRent || 0) * 2) {
      status = 'Heavy Arrears';
    } else {
      status = 'Partial Arrears';
    }
  } else if (totalOverpaid > 0) {
    status = 'Overpaid / In Credit';
  }

  return {
    tenantId: tenant.id,
    tenantName: tenant.fullName,
    unitNumber: tenant.unitNumber || 'N/A',
    propertyName: tenant.propertyName || 'N/A',
    monthlyRent: tenant.monthlyRent || 0,
    totalInvoiced,
    totalPaid,
    totalArrears,
    totalOverpaid,
    netBalance,
    status,
    skippedMonthsCount,
    partialMonthsCount,
    overpaidInvoicesCount,
    monthlyBreakdown,
  };
}
