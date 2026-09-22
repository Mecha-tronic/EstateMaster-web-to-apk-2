import * as XLSX from 'xlsx';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Property, Tenant, Invoice, Payment } from '../types';
import { calculateTenantArrears } from './arrears';
import { isCapacitorPlatform } from './api';

export interface ExportExcelOptions {
  properties: Property[];
  tenants: Tenant[];
  invoices: Invoice[];
  payments: Payment[];
  landlordName?: string;
  companyName?: string;
  buildingFilterId?: string; // 'all' or specific property id
}

export interface BuildingCalculationSummary {
  property: Property;
  tenantsCount: number;
  totalBilled: number;
  totalPaid: number;
  totalArrears: number;
  collectionRate: number;
  tenantRecords: Array<{
    unitNumber: string;
    tenantName: string;
    phone: string;
    email: string;
    monthlyRent: number;
    leaseStatus: string;
    totalBilled: number;
    totalPaid: number;
    outstandingArrears: number;
    status: string;
    skippedMonths: number;
    lastPaymentDate: string;
    lastPaymentAmount: number;
    lastPaymentRef: string;
  }>;
}

/**
 * Computes all financial metrics (total billed, payments made, arrears) grouped by building
 */
export function calculateBuildingLedgers(
  properties: Property[],
  tenants: Tenant[],
  invoices: Invoice[],
  payments: Payment[]
): {
  buildingSummaries: BuildingCalculationSummary[];
  grandTotalBilled: number;
  grandTotalPaid: number;
  grandTotalArrears: number;
  grandCollectionRate: number;
} {
  // Ensure we have property representations even if none are explicitly declared
  const effectiveProperties: Property[] = [...properties];

  // Discover any buildings mentioned in tenants/invoices that aren't in properties list
  const knownPropertyNames = new Set(effectiveProperties.map((p) => p.name.trim().toLowerCase()));
  
  tenants.forEach((t) => {
    if (t.propertyName && !knownPropertyNames.has(t.propertyName.trim().toLowerCase())) {
      knownPropertyNames.add(t.propertyName.trim().toLowerCase());
      effectiveProperties.push({
        id: t.propertyId || `prop-${t.propertyName.replace(/\s+/g, '-').toLowerCase()}`,
        name: t.propertyName,
        type: 'Residential Apartments',
        totalUnits: 1
      });
    }
  });

  invoices.forEach((inv) => {
    if (inv.propertyName && !knownPropertyNames.has(inv.propertyName.trim().toLowerCase())) {
      knownPropertyNames.add(inv.propertyName.trim().toLowerCase());
      effectiveProperties.push({
        id: `prop-${inv.propertyName.replace(/\s+/g, '-').toLowerCase()}`,
        name: inv.propertyName,
        type: 'Residential Apartments',
        totalUnits: 1
      });
    }
  });

  if (effectiveProperties.length === 0) {
    effectiveProperties.push({
      id: 'default-building',
      name: 'Main Property Portfolio',
      type: 'Residential Apartments',
    });
  }

  let grandTotalBilled = 0;
  let grandTotalPaid = 0;
  let grandTotalArrears = 0;

  const buildingSummaries: BuildingCalculationSummary[] = effectiveProperties.map((prop) => {
    const propNameNorm = prop.name.trim().toLowerCase();

    // Match tenants belonging to this building
    const buildingTenants = tenants.filter((t) => {
      if (t.propertyId && prop.id && t.propertyId === prop.id) return true;
      if (t.propertyName && t.propertyName.trim().toLowerCase() === propNameNorm) return true;
      return false;
    });

    // Also match any invoices specifically tagged with this building
    const buildingInvoices = invoices.filter((inv) => {
      if (inv.propertyName && inv.propertyName.trim().toLowerCase() === propNameNorm) return true;
      // or match via tenant
      return buildingTenants.some((bt) => bt.id === inv.tenantId || (inv.tenantName && inv.tenantName.toLowerCase().trim() === bt.fullName.toLowerCase().trim()));
    });

    // Match payments
    const buildingPayments = payments.filter((p) => {
      if (p.propertyName && p.propertyName.trim().toLowerCase() === propNameNorm) return true;
      return buildingTenants.some((bt) => bt.id === p.tenantId || (p.tenantName && p.tenantName.toLowerCase().trim() === bt.fullName.toLowerCase().trim()));
    });

    // Build tenant records
    // Create unique list of tenants in this building (from explicit tenants + invoice tenants)
    const buildingTenantMap = new Map<string, Tenant>();
    buildingTenants.forEach((t) => buildingTenantMap.set(t.fullName.toLowerCase().trim(), t));

    buildingInvoices.forEach((inv) => {
      const key = inv.tenantName.toLowerCase().trim();
      if (!buildingTenantMap.has(key)) {
        buildingTenantMap.set(key, {
          id: inv.tenantId || `tenant-${key}`,
          fullName: inv.tenantName,
          email: inv.tenantEmail || '',
          phone: '',
          propertyName: prop.name,
          unitNumber: inv.unitNumber || '',
          monthlyRent: inv.rentAmount || inv.totalAmount || 0,
        });
      }
    });

    let bBilled = 0;
    let bPaid = 0;
    let bArrears = 0;

    const tenantRecords = Array.from(buildingTenantMap.values()).map((t) => {
      const arrearsSummary = calculateTenantArrears(t, buildingInvoices, buildingPayments);

      // Filter payments for this tenant to get last payment details
      const tenantPayments = buildingPayments
        .filter((p) => p.tenantId === t.id || (p.tenantName && p.tenantName.toLowerCase().trim() === t.fullName.toLowerCase().trim()))
        .sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime());

      const lastP = tenantPayments[0];

      bBilled += arrearsSummary.totalInvoiced;
      bPaid += arrearsSummary.totalPaid;
      bArrears += arrearsSummary.totalArrears;

      return {
        unitNumber: t.unitNumber || arrearsSummary.unitNumber || 'N/A',
        tenantName: t.fullName,
        phone: t.phone || 'N/A',
        email: t.email || 'N/A',
        monthlyRent: t.monthlyRent || arrearsSummary.monthlyRent || 0,
        leaseStatus: t.status || 'Active',
        totalBilled: arrearsSummary.totalInvoiced,
        totalPaid: arrearsSummary.totalPaid,
        outstandingArrears: arrearsSummary.totalArrears,
        status: arrearsSummary.status,
        skippedMonths: arrearsSummary.skippedMonthsCount,
        lastPaymentDate: lastP ? new Date(lastP.paymentDate).toLocaleDateString() : 'None',
        lastPaymentAmount: lastP ? lastP.amount : 0,
        lastPaymentRef: lastP ? lastP.referenceCode : 'N/A',
      };
    });

    // Sort tenants by unit number
    tenantRecords.sort((a, b) => a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true }));

    grandTotalBilled += bBilled;
    grandTotalPaid += bPaid;
    grandTotalArrears += bArrears;

    const collectionRate = bBilled > 0 ? Math.min(100, Math.round((bPaid / bBilled) * 100)) : (bPaid > 0 ? 100 : 0);

    return {
      property: prop,
      tenantsCount: tenantRecords.length,
      totalBilled: bBilled,
      totalPaid: bPaid,
      totalArrears: bArrears,
      collectionRate,
      tenantRecords,
    };
  });

  const grandCollectionRate = grandTotalBilled > 0
    ? Math.min(100, Math.round((grandTotalPaid / grandTotalBilled) * 100))
    : (grandTotalPaid > 0 ? 100 : 0);

  return {
    buildingSummaries,
    grandTotalBilled,
    grandTotalPaid,
    grandTotalArrears,
    grandCollectionRate,
  };
}

/**
 * Sanitizes Excel sheet name to comply with Microsoft Excel requirements
 * (max 31 chars, no invalid characters: \ / ? * : [ ])
 */
function sanitizeSheetName(name: string, fallbackIndex: number): string {
  const clean = name.replace(/[\\/?*:[\]]/g, '').trim();
  const truncated = clean.substring(0, 28);
  return truncated.length > 0 ? truncated : `Building ${fallbackIndex}`;
}

/**
 * Downloads a complete, multi-sheet Excel Workbook with rent collection calculations
 */
export async function exportLandlordPaymentLedgerToExcel(options: ExportExcelOptions): Promise<{ success: boolean; filename: string; uri?: string }> {
  const {
    properties,
    tenants,
    invoices,
    payments,
    landlordName = 'Landlord',
    companyName = 'EstateMaster Properties',
    buildingFilterId = 'all',
  } = options;

  const { buildingSummaries, grandTotalBilled, grandTotalPaid, grandTotalArrears, grandCollectionRate } =
    calculateBuildingLedgers(properties, tenants, invoices, payments);

  // Filter summaries if user chose a specific building
  const activeSummaries = buildingFilterId === 'all'
    ? buildingSummaries
    : buildingSummaries.filter((b) => b.property.id === buildingFilterId || b.property.name === buildingFilterId);

  const wb = XLSX.utils.book_new();
  const currentDateStr = new Date().toISOString().split('T')[0];
  const nowFormatted = new Date().toLocaleString();

  // ==========================================
  // SHEET 1: PORTFOLIO SUMMARY (OVERVIEW)
  // ==========================================
  const summarySheetRows: any[][] = [
    ['ESTATEMASTER - PORTFOLIO RENT COLLECTION & ARREARS LEDGER'],
    [`Company: ${companyName}`, `Landlord: ${landlordName}`, `Generated: ${nowFormatted}`],
    [''],
    ['PORTFOLIO FINANCIAL KPI SUMMARY'],
    ['Metric', 'Amount (KSh)', 'Notes'],
    ['Total Rent Billed to Date', grandTotalBilled, 'Cumulative rent & utility charges invoiced across all buildings'],
    ['Total Payments Collected to Date', grandTotalPaid, 'Total verified payments settled across all tenant accounts'],
    ['Total Outstanding Arrears', grandTotalArrears, 'Uncollected balances currently due to landlord'],
    ['Overall Collection Efficiency', `${grandCollectionRate}%`, 'Percentage of billed rent successfully received'],
    [''],
    ['BUILDINGS BREAKDOWN OVERVIEW'],
    [
      'Building / Property Name',
      'Property Type',
      'Location / City',
      'Tenants / Units',
      'Total Rent Billed (KSh)',
      'Total Payments Made (KSh)',
      'Outstanding Arrears (KSh)',
      'Collection Rate (%)',
      'Health Status',
    ],
  ];

  activeSummaries.forEach((bs) => {
    let health = 'Good (Up-To-Date)';
    if (bs.totalArrears > 0) {
      if (bs.collectionRate < 70) health = 'Critical Arrears';
      else health = 'Moderate Arrears';
    }

    summarySheetRows.push([
      bs.property.name,
      bs.property.type || 'Residential',
      bs.property.city || bs.property.location || 'Kenya',
      bs.tenantsCount,
      bs.totalBilled,
      bs.totalPaid,
      bs.totalArrears,
      `${bs.collectionRate}%`,
      health,
    ]);
  });

  // Add Grand Total Row
  summarySheetRows.push([
    'PORTFOLIO GRAND TOTAL',
    'All Properties',
    'Kenya',
    activeSummaries.reduce((sum, b) => sum + b.tenantsCount, 0),
    grandTotalBilled,
    grandTotalPaid,
    grandTotalArrears,
    `${grandCollectionRate}%`,
    grandTotalArrears === 0 ? 'All Cleared' : 'Active Balances',
  ]);

  const summaryWs = XLSX.utils.aoa_to_sheet(summarySheetRows);
  summaryWs['!cols'] = [
    { wch: 30 }, // Building Name
    { wch: 22 }, // Type
    { wch: 18 }, // Location
    { wch: 16 }, // Tenants / Units
    { wch: 24 }, // Total Billed
    { wch: 26 }, // Total Paid
    { wch: 25 }, // Outstanding Arrears
    { wch: 20 }, // Collection Rate
    { wch: 20 }, // Status
  ];
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Portfolio Summary');

  // ==========================================
  // SHEETS 2...N: SEPARATE SHEET PER BUILDING
  // ==========================================
  const usedSheetNames = new Set<string>(['Portfolio Summary', 'All Payments History', 'All Invoices Log']);

  activeSummaries.forEach((bs, index) => {
    let baseSheetName = sanitizeSheetName(bs.property.name, index + 1);
    let finalSheetName = baseSheetName;
    let counter = 1;
    while (usedSheetNames.has(finalSheetName)) {
      finalSheetName = `${baseSheetName.substring(0, 25)} (${counter})`;
      counter++;
    }
    usedSheetNames.add(finalSheetName);

    const buildingRows: any[][] = [
      [`BUILDING STATEMENT: ${bs.property.name.toUpperCase()}`],
      [`Type: ${bs.property.type || 'Apartments'}`, `Address/Location: ${bs.property.address || bs.property.location || 'Kenya'}`],
      [`Landlord: ${landlordName}`, `Date Generated: ${nowFormatted}`],
      [''],
      ['BUILDING PERFORMANCE SUMMARY'],
      ['Total Units / Tenants', bs.tenantsCount],
      ['Total Rent Billed to Date (KSh)', bs.totalBilled],
      ['Total Payments Made to Date (KSh)', bs.totalPaid],
      ['Outstanding Arrears Balance (KSh)', bs.totalArrears],
      ['Collection Rate', `${bs.collectionRate}%`],
      [''],
      ['TENANT-BY-TENANT PAYMENT & ARREARS BREAKDOWN'],
      [
        'Unit #',
        'Tenant Name',
        'Phone Number',
        'Email Address',
        'Monthly Rent (KSh)',
        'Lease Status',
        'Total Rent Billed (KSh)',
        'Total Payments Made (KSh)',
        'Outstanding Arrears (KSh)',
        'Account Status',
        'Skipped Months',
        'Last Payment Date',
        'Last Payment Amount (KSh)',
        'Last Payment Ref / M-Pesa',
      ],
    ];

    bs.tenantRecords.forEach((tr) => {
      buildingRows.push([
        tr.unitNumber,
        tr.tenantName,
        tr.phone,
        tr.email,
        tr.monthlyRent,
        tr.leaseStatus,
        tr.totalBilled,
        tr.totalPaid,
        tr.outstandingArrears,
        tr.status,
        tr.skippedMonths,
        tr.lastPaymentDate,
        tr.lastPaymentAmount,
        tr.lastPaymentRef,
      ]);
    });

    // Summary row for this building
    buildingRows.push([
      'TOTALS FOR ' + bs.property.name.toUpperCase(),
      `${bs.tenantRecords.length} Tenants`,
      '',
      '',
      bs.tenantRecords.reduce((sum, t) => sum + t.monthlyRent, 0),
      '',
      bs.totalBilled,
      bs.totalPaid,
      bs.totalArrears,
      bs.totalArrears > 0 ? 'Arrears Outstanding' : 'Fully Settled',
      '',
      '',
      '',
      '',
    ]);

    const buildingWs = XLSX.utils.aoa_to_sheet(buildingRows);
    buildingWs['!cols'] = [
      { wch: 10 }, // Unit #
      { wch: 25 }, // Tenant Name
      { wch: 18 }, // Phone
      { wch: 25 }, // Email
      { wch: 18 }, // Monthly Rent
      { wch: 14 }, // Lease Status
      { wch: 22 }, // Total Billed
      { wch: 24 }, // Total Paid
      { wch: 24 }, // Outstanding Arrears
      { wch: 18 }, // Account Status
      { wch: 16 }, // Skipped Months
      { wch: 18 }, // Last Payment Date
      { wch: 24 }, // Last Payment Amount
      { wch: 24 }, // Last Payment Ref
    ];
    XLSX.utils.book_append_sheet(wb, buildingWs, finalSheetName);
  });

  // ==========================================
  // SHEET: ALL PAYMENTS TRANSACTION AUDIT LOG
  // ==========================================
  const paymentRows: any[][] = [
    ['ESTATEMASTER - ALL PAYMENT TRANSACTIONS AUDIT LOG'],
    [`Company: ${companyName}`, `Generated: ${nowFormatted}`, `Total Payments: ${payments.length}`],
    [''],
    [
      'Serial / Receipt #',
      'Payment Date',
      'Building / Property',
      'Unit #',
      'Tenant Name',
      'Amount Paid (KSh)',
      'Payment Method',
      'Reference Code / M-Pesa',
      'Verification Status',
      'Notes',
    ],
  ];

  const sortedPayments = [...payments].sort(
    (a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime()
  );

  sortedPayments.forEach((p) => {
    paymentRows.push([
      p.serialNumber || p.id,
      p.paymentDate ? new Date(p.paymentDate).toLocaleDateString() : 'N/A',
      p.propertyName || 'N/A',
      p.unitNumber || 'N/A',
      p.tenantName,
      p.amount,
      p.paymentMethod,
      p.referenceCode,
      p.status,
      p.notes || '',
    ]);
  });

  paymentRows.push([
    'TOTAL PAYMENTS RECORDED',
    '',
    '',
    '',
    '',
    payments.reduce((sum, p) => sum + (p.amount || 0), 0),
    '',
    '',
    '',
    '',
  ]);

  const paymentsWs = XLSX.utils.aoa_to_sheet(paymentRows);
  paymentsWs['!cols'] = [
    { wch: 20 }, // Serial / Receipt #
    { wch: 16 }, // Date
    { wch: 24 }, // Property
    { wch: 10 }, // Unit
    { wch: 25 }, // Tenant
    { wch: 20 }, // Amount
    { wch: 16 }, // Method
    { wch: 24 }, // Reference Code
    { wch: 18 }, // Status
    { wch: 30 }, // Notes
  ];
  XLSX.utils.book_append_sheet(wb, paymentsWs, 'All Payments History');

  // Resolve export filename
  const filename = buildingFilterId === 'all'
    ? `EstateMaster_All_Buildings_Payment_Ledger_${currentDateStr}.xlsx`
    : `EstateMaster_${sanitizeSheetName(activeSummaries[0]?.property?.name || 'Building', 1)}_Ledger_${currentDateStr}.xlsx`;

  // Native Android / Capacitor APK handling
  if (isCapacitorPlatform()) {
    try {
      const base64Data = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });

      // Save to device Cache directory for instant sharing and opening
      const cacheResult = await Filesystem.writeFile({
        path: filename,
        data: base64Data,
        directory: Directory.Cache
      });

      // Also persist to Documents directory if possible
      try {
        await Filesystem.writeFile({
          path: filename,
          data: base64Data,
          directory: Directory.Documents
        });
      } catch (docErr) {
        console.warn('Could not write to Documents directory, cache copy preserved:', docErr);
      }

      // Trigger native Android share/open system sheet
      await Share.share({
        title: filename,
        text: `EstateMaster Kenya Excel Payment Ledger (${currentDateStr})`,
        url: cacheResult.uri,
        dialogTitle: 'Save or Open Excel Workbook'
      });

      return {
        success: true,
        filename,
        uri: cacheResult.uri
      };
    } catch (mobileErr: any) {
      console.warn('Capacitor native export failed, falling back to browser download method:', mobileErr);
    }
  }

  // Web Browser & Mobile WebView fallback
  try {
    const base64Out = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
    const dataUri = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64Out}`;
    const link = document.createElement('a');
    link.href = dataUri;
    link.download = filename;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      if (document.body.contains(link)) {
        document.body.removeChild(link);
      }
    }, 2000);
    return { success: true, filename };
  } catch (webErr) {
    XLSX.writeFile(wb, filename);
    return { success: true, filename };
  }
}

/**
 * Convenient wrapper for financial report Excel export (used in diagnostics and dashboards)
 */
export async function exportFinancialReportToExcel(
  properties: Property[],
  invoices: Invoice[],
  payments: Payment[],
  fileName?: string
): Promise<{ success: boolean; filePath?: string; filename?: string; error?: string }> {
  try {
    const res = await exportLandlordPaymentLedgerToExcel({
      properties,
      tenants: [],
      invoices,
      payments,
      buildingFilterId: 'all'
    });
    return {
      success: res.success,
      filePath: res.uri || res.filename,
      filename: res.filename
    };
  } catch (err: any) {
    console.error('exportFinancialReportToExcel error:', err);
    return {
      success: false,
      error: err.message || String(err)
    };
  }
}

