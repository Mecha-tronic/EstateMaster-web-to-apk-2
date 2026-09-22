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
  status: 'Up-To-Date' | 'Partial Arrears' | 'Heavy Arrears';
  skippedMonthsCount: number;
  partialMonthsCount: number;
  monthlyBreakdown: {
    invoiceId: string;
    invoiceNumber: string;
    periodMonth: string;
    dueDate?: string;
    totalAmount: number;
    amountPaid: number;
    arrearsRemaining: number;
    status: 'Paid' | 'Partial' | 'Unpaid' | 'Overdue';
  }[];
}

export function calculateTenantArrears(
  tenant: Tenant,
  invoices: Invoice[],
  payments: Payment[]
): TenantArrearsSummary {
  // Filter invoices for tenant
  const tenantInvoices = invoices.filter(
    (inv) =>
      inv.tenantId === tenant.id ||
      (tenant.email && inv.tenantEmail && inv.tenantEmail.toLowerCase() === tenant.email.toLowerCase()) ||
      (tenant.fullName && inv.tenantName && inv.tenantName.toLowerCase().trim() === tenant.fullName.toLowerCase().trim())
  );

  // Filter payments for tenant
  const tenantPayments = payments.filter(
    (p) =>
      p.tenantId === tenant.id ||
      (tenant.fullName && p.tenantName && p.tenantName.toLowerCase().trim() === tenant.fullName.toLowerCase().trim()) ||
      (p.invoiceId && tenantInvoices.some((inv) => inv.id === p.invoiceId || inv.invoiceNumber === p.invoiceId))
  );

  let totalInvoiced = 0;
  let totalPaid = 0;
  let skippedMonthsCount = 0;
  let partialMonthsCount = 0;

  const monthlyBreakdown = tenantInvoices.map((inv) => {
    const invTotal = Number(inv.totalAmount) || 0;
    // Check payments matching this specific invoice
    const invPayments = tenantPayments
      .filter((p) => (p.invoiceId === inv.id || p.invoiceId === inv.invoiceNumber) && (p.status === 'Completed' || !p.status))
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const invPaid = Math.max(Number(inv.amountPaid) || 0, invPayments);
    const remaining = Math.max(0, invTotal - invPaid);

    totalInvoiced += invTotal;
    totalPaid += invPaid;

    if (invPaid === 0 && invTotal > 0) {
      skippedMonthsCount++;
    } else if (invPaid > 0 && invPaid < invTotal) {
      partialMonthsCount++;
    }

    let status: 'Paid' | 'Partial' | 'Unpaid' | 'Overdue' = inv.status as any;
    if (invPaid >= invTotal && invTotal > 0) {
      status = 'Paid';
    } else if (invPaid > 0 && invPaid < invTotal) {
      status = 'Partial';
    } else if (!status) {
      status = 'Unpaid';
    }

    return {
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      periodMonth: inv.periodMonth || inv.issueDate || 'Monthly Invoice',
      dueDate: inv.dueDate,
      totalAmount: invTotal,
      amountPaid: invPaid,
      arrearsRemaining: remaining,
      status,
    };
  });

  const sumAllPayments = tenantPayments
    .filter((p) => p.status === 'Completed' || !p.status)
    .reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
  const effectiveTotalPaid = Math.max(totalPaid, sumAllPayments);

  // Calculate total arrears (totalInvoiced - effectiveTotalPaid)
  const totalArrears = Math.max(0, totalInvoiced - effectiveTotalPaid);

  let status: 'Up-To-Date' | 'Partial Arrears' | 'Heavy Arrears' = 'Up-To-Date';
  if (totalArrears > 0) {
    if (skippedMonthsCount > 1 || totalArrears >= (tenant.monthlyRent || 0) * 2) {
      status = 'Heavy Arrears';
    } else {
      status = 'Partial Arrears';
    }
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
    status,
    skippedMonthsCount,
    partialMonthsCount,
    monthlyBreakdown,
  };
}
