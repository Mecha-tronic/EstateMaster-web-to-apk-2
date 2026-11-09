import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Payment, Invoice, Tenant, Property, Landlord, UnaccountedPayment, BankStatementRecord } from '../types';

/** What can still be collected on an invoice (an invoice rolled into a later one owes nothing itself). */
const invoiceDue = (inv: Pick<Invoice, 'totalAmount' | 'amountPaid' | 'carriedForwardToInvoiceId'>): number =>
  inv.carriedForwardToInvoiceId ? 0 : Math.max(0, (Number(inv.totalAmount) || 0) - (Number(inv.amountPaid) || 0));
import { formatKSH } from '../lib/formatters';
import { calculateTenantArrears } from '../lib/arrears';
import { exportLandlordPaymentLedgerToExcel, calculateBuildingLedgers } from '../lib/excelExport';
import { registerBackHandler } from '../lib/backNavigation';
import {
  triggerMpesaStkPush,
  queryMpesaStkStatus,
  fetchMpesaConfigStatus,
  fetchUnaccountedPayments,
  assignUnaccountedPayment,
  ignoreUnaccountedPayment,
  batchReconcileBankRecords,
  reversePayment,
  getApiBaseUrl
} from '../lib/api';
import { UnaccountedPaymentsQueue } from './UnaccountedPaymentsQueue';
import { BankStatementReconciler } from './BankStatementReconciler';
import { BankVerificationPanel } from './BankVerificationPanel';
import { BankConnectionsStatus } from './BankConnectionsStatus';
import { PaymentReceiptAuditCard } from './PaymentReceiptAuditCard';
import { KENYA_BANKS } from '../lib/kenyaBanks';
import {
  DollarSign,
  CheckCircle2,
  Clock,
  Plus,
  CreditCard,
  Receipt,
  Smartphone,
  RefreshCw,
  Users,
  Search,
  Building,
  AlertTriangle,
  TrendingDown,
  Landmark,
  Check,
  ShieldCheck,
  Zap,
  FileSpreadsheet,
  Download,
  Building2,
  Table,
  HelpCircle,
  Sparkles,
  FileText,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface PaymentTrackerViewProps {
  payments: Payment[];
  invoices: Invoice[];
  tenants?: Tenant[];
  properties?: Property[];
  signedInLandlord?: Landlord | null;
  onRecordPayment: (data: any) => void;
  onPaymentProcessed?: () => void;
}

export const PaymentTrackerView: React.FC<PaymentTrackerViewProps> = ({
  payments,
  invoices,
  tenants = [],
  properties = [],
  signedInLandlord,
  onRecordPayment,
  onPaymentProcessed
}) => {
  const [activeTab, setActiveTab] = useState<'grouped' | 'all' | 'unaccounted' | 'bank_reconcile' | 'bank_status'>('grouped');
  const [searchQuery, setSearchQuery] = useState('');
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [payInvoiceId, setPayInvoiceId] = useState(invoices[0]?.id || '');
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<'M-Pesa' | 'Bank Transfer' | 'Credit Card' | 'Cash' | 'Check'>('M-Pesa');
  const [payRef, setPayRef] = useState('');
  const [payNotes, setPayNotes] = useState('');

  // Unaccounted Payments State
  const [unaccountedPayments, setUnaccountedPayments] = useState<UnaccountedPayment[]>([]);

  // M-Pesa Express STK Push State
  const [mpesaPhone, setMpesaPhone] = useState('');
  const [isStkPushing, setIsStkPushing] = useState(false);
  const [stkMessage, setStkMessage] = useState<string | null>(null);

  // Bank / M-Pesa live verification (same server engine the tenant uses)
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [verifyInvoiceId, setVerifyInvoiceId] = useState('');

  // Proof-of-payment rows and payment reversal
  const [expandedReceipts, setExpandedReceipts] = useState<Record<string, boolean>>({});
  const [reversing, setReversing] = useState<Payment | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [reversePassword, setReversePassword] = useState('');
  const [reverseBusy, setReverseBusy] = useState(false);
  const [reverseError, setReverseError] = useState<string | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);

  // Daraja Gateway Connection Info
  const [darajaStatus, setDarajaStatus] = useState<any>(null);

  // Excel Ledger Export State
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportBuildingFilter, setExportBuildingFilter] = useState<string>('all');
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccessMsg, setExportSuccessMsg] = useState<string | null>(null);

  // Android Hardware Back Button Modal Dismissal
  useEffect(() => {
    if (!showRecordModal && !showVerifyModal && !showExportModal) return;
    return registerBackHandler(() => {
      if (showRecordModal) {
        setShowRecordModal(false);
        return true;
      }
      if (showVerifyModal) {
        setShowVerifyModal(false);
        return true;
      }
      if (showExportModal) {
        setShowExportModal(false);
        return true;
      }
      return false;
    });
  }, [showRecordModal, showVerifyModal, showExportModal]);

  // Expanded monthly breakdowns for tenant cards
  const [expandedBreakdowns, setExpandedBreakdowns] = useState<Record<string, boolean>>({});
  const toggleBreakdown = (tenantId: string) => {
    setExpandedBreakdowns((prev) => ({ ...prev, [tenantId]: !prev[tenantId] }));
  };

  const loadUnaccounted = async () => {
    try {
      const list = await fetchUnaccountedPayments();
      setUnaccountedPayments(list);
    } catch (err) {
      console.error('Failed to load unaccounted payments:', err);
    }
  };

  useEffect(() => {
    fetchMpesaConfigStatus().then(setDarajaStatus).catch(console.error);
    loadUnaccounted();
  }, []);

  const unpaidInvoices = invoices.filter((i) => invoiceDue(i) > 0);

  // Collect unique registered tenants for single tenant ledgers
  const tenantMap = new Map<string, { id: string; name: string; unitNumber: string; propertyName: string }>();

  if (tenants && tenants.length > 0) {
    // Strictly list ONLY registered tenants
    // Keyed by tenant id: two tenants who share a name must never share a ledger.
    tenants.forEach((t) => {
      const key = t.id;
      if (!tenantMap.has(key)) {
        tenantMap.set(key, {
          id: t.id,
          name: t.fullName,
          unitNumber: t.unitNumber || '',
          propertyName: t.propertyName || ''
        });
      }
    });
  } else {
    payments.forEach((p) => {
      const key = p.tenantName.toLowerCase().trim();
      if (!tenantMap.has(key)) {
        tenantMap.set(key, {
          id: p.tenantId || `tenant-${key}`,
          name: p.tenantName,
          unitNumber: p.unitNumber || '',
          propertyName: p.propertyName || ''
        });
      }
    });

    invoices.forEach((inv) => {
      const key = inv.tenantName.toLowerCase().trim();
      if (!tenantMap.has(key)) {
        tenantMap.set(key, {
          id: inv.tenantId || `tenant-${key}`,
          name: inv.tenantName,
          unitNumber: inv.unitNumber || '',
          propertyName: inv.propertyName || ''
        });
      }
    });
  }

  const tenantGroups = Array.from(tenantMap.values()).filter((t) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return t.name.toLowerCase().includes(q) || t.unitNumber.toLowerCase().includes(q);
  });

  /** Landlord-entered payment (cash, cheque, or a deposit you have seen on your own statement). Not bank-verified. */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setRecordError(null);
    const amount = parseFloat(payAmount);
    const inv = invoices.find((i) => i.id === payInvoiceId);
    if (!inv) { setRecordError('Choose an invoice.'); return; }
    if (!(amount > 0)) { setRecordError('Enter the amount received.'); return; }
    if (amount > invoiceDue(inv)) { setRecordError(`The amount cannot be more than the balance of ${formatKSH(invoiceDue(inv))}.`); return; }
    if (payMethod !== 'Cash' && payRef.trim().length < 4) { setRecordError('Enter the transaction reference exactly as it appears on the statement or SMS.'); return; }
    onRecordPayment({
      invoiceId: payInvoiceId,
      amount,
      paymentMethod: payMethod,
      referenceCode: payRef.trim(),
      notes: payNotes,
    });
    setShowRecordModal(false);
    setPayAmount('');
    setPayRef('');
    setPayNotes('');
  };

  /** Asks Safaricom to prompt the tenant, then waits for the server to confirm (the browser never posts the payment). */
  const handleTriggerStkPush = async () => {
    if (!payInvoiceId || !payAmount) return;
    setIsStkPushing(true);
    setStkMessage(null);
    try {
      const res = await triggerMpesaStkPush({ phone: mpesaPhone, amount: parseFloat(payAmount), invoiceId: payInvoiceId });
      const id: string | undefined = res?.CheckoutRequestID;
      if (!id) throw new Error(res?.error || res?.message || 'M-Pesa could not start this request.');
      setStkMessage('Prompt sent. Waiting for the tenant to enter their M-Pesa PIN...');
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const q = await queryMpesaStkStatus(id);
        if (q.status === 'COMPLETED') {
          setStkMessage(`Confirmed by Safaricom${q.receiptCode ? ` (receipt ${q.receiptCode})` : ''}. The invoice has been updated.`);
          if (onPaymentProcessed) onPaymentProcessed();
          setTimeout(() => { setShowRecordModal(false); setStkMessage(null); }, 2500);
          return;
        }
        if (q.status === 'FAILED') { setStkMessage(`Not completed: ${q.resultDesc || 'the tenant cancelled or the request failed.'}`); return; }
      }
      setStkMessage('Still waiting. If the tenant has paid, it will appear automatically once Safaricom confirms.');
      if (onPaymentProcessed) onPaymentProcessed();
    } catch (err: any) {
      setStkMessage(`Could not send the M-Pesa prompt: ${err.message}`);
    } finally {
      setIsStkPushing(false);
    }
  };

  const handleAssignUnaccountedPayment = async (
    unaccountedId: string,
    tenantId: string,
    invoiceId?: string,
    notes?: string
  ) => {
    await assignUnaccountedPayment(unaccountedId, tenantId, invoiceId, notes);
    await loadUnaccounted();
    if (onPaymentProcessed) onPaymentProcessed();
  };

  const handleIgnoreUnaccountedPayment = async (unaccountedId: string, reason: string) => {
    await ignoreUnaccountedPayment(unaccountedId, reason);
    await loadUnaccounted();
  };

  const handleBatchReconcileRecords = async (records: BankStatementRecord[]) => {
    const res = await batchReconcileBankRecords(records);
    await loadUnaccounted();
    if (onPaymentProcessed) onPaymentProcessed();
    return res;
  };

  const toggleReceipt = (id: string) => setExpandedReceipts((prev) => ({ ...prev, [id]: !prev[id] }));

  const openReverse = (p: Payment) => {
    setReversing(p);
    setReverseReason('');
    setReversePassword('');
    setReverseError(null);
  };

  const confirmReverse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reversing) return;
    setReverseBusy(true);
    setReverseError(null);
    try {
      await reversePayment(reversing.id, reverseReason.trim(), reversePassword);
      setReversing(null);
      setReversePassword('');
      if (onPaymentProcessed) onPaymentProcessed();
    } catch (err: any) {
      setReverseError(err?.message || 'The payment could not be reversed.');
    } finally {
      setReverseBusy(false);
    }
  };

  const statusPill = (p: Payment) =>
    p.status === 'Completed' ? (
      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200 inline-flex items-center gap-1">
        <CheckCircle2 className="w-3 h-3" /> {p.status}
      </span>
    ) : p.status === 'Failed' ? (
      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-rose-100 text-rose-800 border border-rose-200 inline-flex items-center gap-1">
        <AlertTriangle className="w-3 h-3" /> Reversed
      </span>
    ) : (
      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-100 text-amber-800 border border-amber-200 inline-flex items-center gap-1">
        <Clock className="w-3 h-3" /> {p.status}
      </span>
    );

  const proofCell = (p: Payment, pad: string) => (
    <td className={`${pad} text-center whitespace-nowrap`}>
      <button type="button" onClick={() => toggleReceipt(p.id)} className="text-[11px] font-bold text-blue-700 hover:underline cursor-pointer" aria-expanded={!!expandedReceipts[p.id]}>
        {expandedReceipts[p.id] ? 'Hide proof' : 'Proof'}
      </button>
      {p.status === 'Completed' && (
        <button type="button" onClick={() => openReverse(p)} className="ml-3 text-[11px] font-bold text-rose-700 hover:underline cursor-pointer">Reverse</button>
      )}
    </td>
  );

  const proofRow = (p: Payment, cols: number) =>
    expandedReceipts[p.id] ? (
      <tr>
        <td colSpan={cols} className="p-3 bg-slate-50 border-t border-slate-100">
          <PaymentReceiptAuditCard payment={p} />
        </td>
      </tr>
    ) : null;

  const unaccountedPendingCount = unaccountedPayments.filter((p) => p.status === 'Pending Assignment').length;

  const portfolioArrearsList = tenantGroups.map((g) => {
    const matchedTenant = tenants.find((t) => t.id === g.id);
    const tenantObj = (matchedTenant || { id: g.id, fullName: g.name, email: '' }) as Tenant;
    return {
      group: g,
      arrears: calculateTenantArrears(tenantObj, invoices, payments)
    };
  });

  const totalPortfolioArrears = portfolioArrearsList.reduce((sum, item) => sum + item.arrears.totalArrears, 0);
  const totalPortfolioBilled = portfolioArrearsList.reduce((sum, item) => sum + item.arrears.totalInvoiced, 0);
  const totalPortfolioPaid = portfolioArrearsList.reduce((sum, item) => sum + item.arrears.totalPaid, 0);
  const totalPortfolioOverpaid = portfolioArrearsList.reduce((sum, item) => sum + item.arrears.totalOverpaid, 0);
  const totalOverpaidTenantsCount = portfolioArrearsList.filter((item) => item.arrears.totalOverpaid > 0).length;

  // Multi-building Excel Calculation Summary
  const buildingCalcData = calculateBuildingLedgers(properties, tenants, invoices, payments);

  const handleDownloadExcel = async (filterId: string = exportBuildingFilter) => {
    setIsExporting(true);
    try {
      const res = await exportLandlordPaymentLedgerToExcel({
        properties: properties.length > 0 ? properties : [],
        tenants,
        invoices,
        payments,
        landlordName: signedInLandlord?.name || 'Landlord',
        companyName: signedInLandlord?.companyName || 'EstateMaster Properties',
        buildingFilterId: filterId,
      });
      setExportSuccessMsg(`Excel ledger generated successfully (${res.filename})! Ready to open or share.`);
      setTimeout(() => setExportSuccessMsg(null), 5000);
      setShowExportModal(false);
    } catch (err: any) {
      console.error('Failed to export Excel ledger:', err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="p-4 sm:p-7 space-y-7 max-w-7xl mx-auto font-sans"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 flex items-center gap-2.5">
              <DollarSign className="w-7 h-7 text-emerald-600" /> Rent Collection & Arrears Ledger
            </h2>
            {darajaStatus && (
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                darajaStatus.configured 
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300' 
                  : 'bg-blue-50 text-blue-800 border-blue-200'
              }`}>
                <Zap className="w-3 h-3 text-emerald-600 fill-emerald-600" />
                {darajaStatus.configured ? `Daraja API (${darajaStatus.environment?.toUpperCase()})` : 'Smart Gateway Active'}
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            Live rent collection from bank and M-Pesa notifications, tenant arrears balances, and receipts with a verified audit trail.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            id="download-excel-ledger-header-btn"
            onClick={() => setShowExportModal(true)}
            className="px-4 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs sm:text-sm font-bold border border-emerald-300 transition flex items-center gap-2 cursor-pointer shadow-xs hover:scale-105 active:scale-95"
            title="Download all payment records and rent calculations to an Excel spreadsheet (.xlsx)"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Download Excel Ledger</span>
          </button>
          <button
            onClick={() => setShowVerifyModal(true)}
            className="px-4 py-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-800 text-xs sm:text-sm font-bold border border-blue-200 transition flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <ShieldCheck className="w-4 h-4 text-blue-600" /> Verify Bank / M-Pesa Payment
          </button>
          <button
            onClick={() => setShowRecordModal(true)}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold shadow-md shadow-emerald-600/20 transition flex items-center gap-2 cursor-pointer hover:scale-105"
          >
            <Plus className="w-4 h-4" /> Record / Trigger Payment
          </button>
        </div>
      </div>

      {exportSuccessMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-xl text-xs font-semibold flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{exportSuccessMsg}</span>
        </div>
      )}

      {/* Portfolio Arrears & Rent Collection KPI Banner */}
      <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-md space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1">
            <span className="text-[11px] text-slate-400 font-extrabold uppercase tracking-wider block">Total Outstanding Arrears</span>
            <p className={`text-2xl font-black ${totalPortfolioArrears > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {formatKSH(totalPortfolioArrears)}
            </p>
            <p className="text-[11px] text-slate-400">Arrears balance due across active accounts</p>
          </div>

          <div className="space-y-1 sm:border-l border-slate-800 sm:pl-4">
            <span className="text-[11px] text-slate-400 font-extrabold uppercase tracking-wider block">Total Rent Billed</span>
            <p className="text-xl font-bold text-white">{formatKSH(totalPortfolioBilled)}</p>
            <p className="text-[11px] text-slate-400">Total invoice billing generated to date</p>
          </div>

          <div className="space-y-1 lg:border-l border-slate-800 lg:pl-4">
            <span className="text-[11px] text-slate-400 font-extrabold uppercase tracking-wider block">Total Collected to Date</span>
            <p className="text-xl font-bold text-emerald-400">{formatKSH(totalPortfolioPaid)}</p>
            <p className="text-[11px] text-slate-400">Settled rent & utility payments received</p>
          </div>

          <div className="space-y-1 sm:border-l border-slate-800 sm:pl-4">
            <span className="text-[11px] text-emerald-400 font-extrabold uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" /> Overpayments & Credits
            </span>
            <p className="text-xl font-black text-emerald-400">
              +{formatKSH(totalPortfolioOverpaid)}
            </p>
            <p className="text-[11px] text-slate-400">
              {totalOverpaidTenantsCount > 0
                ? `Held across ${totalOverpaidTenantsCount} tenant account${totalOverpaidTenantsCount === 1 ? '' : 's'}`
                : 'No overpayments or prepaid credits held'}
            </p>
          </div>
        </div>

        {/* Excel Export Quick Bar */}
        <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-400">
            <Building2 className="w-4 h-4 text-emerald-400" />
            <span>
              {buildingCalcData.buildingSummaries.length} Building{buildingCalcData.buildingSummaries.length === 1 ? '' : 's'} in Portfolio • {portfolioArrearsList.length} Active Tenant Accounts
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleDownloadExcel('all')}
              disabled={isExporting}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition shadow-xs cursor-pointer hover:scale-105 active:scale-95 disabled:opacity-50"
              title="Download full Excel workbook with separate sheets for all buildings"
            >
              <Download className="w-3.5 h-3.5" />
              {isExporting ? 'Generating Excel...' : 'Quick Download All Buildings (.xlsx)'}
            </button>
            <button
              onClick={() => setShowExportModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              Custom Excel Options
            </button>
          </div>
        </div>
      </div>

      {/* Sub Tabs Toggle */}
      <div className="flex border-b border-slate-200 text-xs font-semibold overflow-x-auto gap-1">
        <button
          onClick={() => setActiveTab('grouped')}
          className={`pb-3 px-4 border-b-2 transition flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === 'grouped'
              ? 'border-emerald-600 text-emerald-700 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users className="w-4 h-4" /> Single Tenant Ledgers ({tenantGroups.length})
        </button>

        <button
          onClick={() => setActiveTab('all')}
          className={`pb-3 px-4 border-b-2 transition flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === 'all'
              ? 'border-emerald-600 text-emerald-700 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Receipt className="w-4 h-4" /> All Transactions ({payments.length})
        </button>

        <button
          onClick={() => setActiveTab('unaccounted')}
          className={`pb-3 px-4 border-b-2 transition flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === 'unaccounted'
              ? 'border-amber-600 text-amber-800 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <HelpCircle className="w-4 h-4 text-amber-600" />
          <span>Unaccounted Queue</span>
          {unaccountedPendingCount > 0 ? (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500 text-white animate-pulse">
              {unaccountedPendingCount} pending
            </span>
          ) : (
            <span className="text-[10px] text-slate-400">({unaccountedPayments.length})</span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('bank_reconcile')}
          className={`pb-3 px-4 border-b-2 transition flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === 'bank_reconcile'
              ? 'border-blue-600 text-blue-800 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4 text-blue-600" />
          <span>Bank Statement Auto-Reconcile</span>
          <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-blue-100 text-blue-800 border border-blue-200 uppercase">
            CSV
          </span>
        </button>

        <button
          onClick={() => setActiveTab('bank_status')}
          className={`pb-3 px-4 border-b-2 transition flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === 'bank_status'
              ? 'border-indigo-600 text-indigo-800 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Landmark className="w-4 h-4 text-indigo-600" />
          <span>Bank Connections</span>
        </button>
      </div>

      {/* SINGLE TENANT PAYMENT LEDGER TAB */}
      {activeTab === 'grouped' && (
        <div className="space-y-6">
          {/* Search Bar */}
          <div className="relative max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search ledgers by tenant name or unit number..."
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 shadow-xs focus:outline-none focus:border-emerald-500"
            />
          </div>

          {tenantGroups.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-2 text-slate-500 text-xs">
              <Users className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="font-bold text-slate-700">No payment ledgers found matching your search.</p>
            </div>
          ) : (
            tenantGroups.map((group, gIdx) => {
              const matchedTenant = tenants.find((t) => t.id === group.id);
              const tenantObj = (matchedTenant || { id: group.id, fullName: group.name, email: '' }) as Tenant;
              const arrearsData = calculateTenantArrears(tenantObj, invoices, payments);

              const groupPayments = payments.filter((p) => (p.tenantId ? p.tenantId === group.id : tenants.length === 0 && p.tenantName.toLowerCase() === group.name.toLowerCase()));

              return (
                <div
                  key={`paygroup-${group.id || group.name}-${gIdx}`}
                  className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:border-emerald-300 transition"
                >
                  {/* Tenant Card Header */}
                  <div className="bg-slate-50 border-b border-slate-200 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 font-extrabold flex items-center justify-center shrink-0 text-sm border border-emerald-200">
                        {group.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-extrabold text-slate-900 text-base">{group.name}</h3>
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            Unit {group.unitNumber || 'N/A'}
                          </span>
                          {group.propertyName && (
                            <span className="text-xs text-slate-500 font-medium flex items-center gap-1">
                              <Building className="w-3 h-3 text-slate-400" /> {group.propertyName}
                            </span>
                          )}
                          {arrearsData.totalOverpaid > 0 ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-600 text-white border border-emerald-700 flex items-center gap-1 shadow-2xs">
                              <Sparkles className="w-3 h-3" /> Overpaid (+{formatKSH(arrearsData.totalOverpaid)})
                            </span>
                          ) : (
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              arrearsData.status === 'Up-To-Date' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                              arrearsData.status === 'Partial Arrears' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                              'bg-rose-100 text-rose-800 border border-rose-200'
                            }`}>
                              {arrearsData.status}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {groupPayments.length} Transaction{groupPayments.length === 1 ? '' : 's'} | Total Billed: {formatKSH(arrearsData.totalInvoiced)}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      {arrearsData.totalOverpaid > 0 && (
                        <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-2.5 text-center sm:text-right shadow-2xs">
                          <p className="text-[10px] text-emerald-800 font-bold uppercase flex items-center justify-center sm:justify-end gap-1">
                            <Sparkles className="w-3 h-3 text-emerald-600" /> Overpaid Credit
                          </p>
                          <p className="text-base font-black text-emerald-700">+{formatKSH(arrearsData.totalOverpaid)}</p>
                        </div>
                      )}

                      <div className={`border rounded-xl p-2.5 text-center sm:text-right shadow-2xs ${
                        arrearsData.totalArrears > 0 ? 'bg-amber-50 border-amber-300' : 'bg-emerald-50 border-emerald-200'
                      }`}>
                        <p className="text-[10px] text-slate-500 font-bold uppercase">Current Arrears</p>
                        <p className={`text-base font-black ${arrearsData.totalArrears > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                          {formatKSH(arrearsData.totalArrears)}
                        </p>
                      </div>

                      <div className="bg-white border border-slate-200 rounded-xl p-2.5 text-center sm:text-right shadow-2xs">
                        <p className="text-[10px] text-slate-500 font-bold uppercase">Total Collected</p>
                        <p className="text-base font-bold text-emerald-700">{formatKSH(arrearsData.totalPaid)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Overpayment & Advance Credit Notice Section */}
                  {arrearsData.totalOverpaid > 0 && (
                    <div className="mx-4 sm:mx-5 mt-4 p-4 bg-gradient-to-r from-emerald-50 via-teal-50 to-white border border-emerald-300 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-emerald-600 text-white shadow-2xs shrink-0">
                          <Sparkles className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="font-extrabold text-slate-900 flex items-center gap-2">
                            <span>Overpayment Balance Credit:</span>
                            <span className="text-emerald-700 text-sm font-black">+{formatKSH(arrearsData.totalOverpaid)}</span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-200 text-emerald-900 uppercase">
                              Advance Held
                            </span>
                          </p>
                          <p className="text-[11px] text-slate-600 mt-0.5">
                            This tenant has settled {formatKSH(arrearsData.totalPaid)} against total billing of {formatKSH(arrearsData.totalInvoiced)}.
                            The overpayment of <strong className="text-emerald-700 font-extrabold">+{formatKSH(arrearsData.totalOverpaid)}</strong> is held in credit to discount future invoices or be refunded.
                          </p>
                        </div>
                      </div>
                      <div className="bg-white px-3.5 py-2 rounded-lg border border-emerald-200 text-center sm:text-right shrink-0">
                        <span className="text-[10px] text-slate-500 uppercase font-bold block">Next Bill Offset</span>
                        <span className="text-sm font-black text-emerald-700">+{formatKSH(arrearsData.totalOverpaid)}</span>
                      </div>
                    </div>
                  )}

                  {/* Payment Table for this Single Tenant */}
                  {groupPayments.length === 0 ? (
                    <div className="p-5 text-center text-xs text-slate-400 italic">
                      No payments recorded yet for this tenant.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px] border-b border-slate-200 font-bold">
                          <tr>
                            <th className="p-3">Method</th>
                            <th className="p-3">Reference Code</th>
                            <th className="p-3">Date Paid</th>
                            <th className="p-3 text-right">Amount (KSh)</th>
                            <th className="p-3 text-center">Status</th>
                            <th className="p-3 text-center">Proof</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-800 font-medium">
                          {groupPayments.map((p, pIdx) => (
                            <React.Fragment key={`gpay-${p.id || p.referenceCode}-${pIdx}`}>
                            <tr className={`hover:bg-slate-50/70 transition ${p.status === 'Failed' ? 'opacity-60' : ''}`}>
                              <td className="p-3 font-bold text-emerald-700 flex items-center gap-1.5">
                                <Receipt className="w-3.5 h-3.5 text-emerald-600" /> {p.paymentMethod}
                              </td>
                              <td className="p-3 font-mono text-slate-700">{p.referenceCode}</td>
                              <td className="p-3 text-slate-500">
                                {new Date(p.paymentDate).toLocaleDateString('en-KE')}
                              </td>
                              <td className="p-3 text-right font-extrabold text-emerald-600 text-sm">
                                {formatKSH(p.amount)}
                              </td>
                              <td className="p-3 text-center">{statusPill(p)}</td>
                              {proofCell(p, 'p-3')}
                            </tr>
                            {proofRow(p, 6)}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Monthly Invoices & Overpayments Breakdown Toggle */}
                  {arrearsData.monthlyBreakdown.length > 0 && (
                    <div className="border-t border-slate-200 bg-slate-50/70 p-3 sm:p-4">
                      <button
                        type="button"
                        onClick={() => toggleBreakdown(group.id || group.name)}
                        className="w-full flex items-center justify-between text-xs font-bold text-slate-700 hover:text-slate-900 cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-emerald-600" />
                          <span>Monthly Invoices &amp; Overpayment Ledger ({arrearsData.monthlyBreakdown.length} Invoices)</span>
                          {arrearsData.overpaidInvoicesCount > 0 && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                              {arrearsData.overpaidInvoicesCount} Overpaid Month{arrearsData.overpaidInvoicesCount === 1 ? '' : 's'}
                            </span>
                          )}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] text-slate-500 font-semibold">
                          {expandedBreakdowns[group.id || group.name] ? 'Hide Invoices' : 'View Breakdown'}
                          {expandedBreakdowns[group.id || group.name] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </span>
                      </button>

                      {expandedBreakdowns[group.id || group.name] && (
                        <div className="mt-3 overflow-x-auto">
                          <table className="w-full text-left text-xs bg-white rounded-lg border border-slate-200">
                            <thead className="bg-slate-100/70 text-slate-500 uppercase text-[10px] font-bold border-b border-slate-200">
                              <tr>
                                <th className="p-2.5">Invoice #</th>
                                <th className="p-2.5">Period / Month</th>
                                <th className="p-2.5 text-right">Billed (KSh)</th>
                                <th className="p-2.5 text-right">Paid (KSh)</th>
                                <th className="p-2.5 text-right">Overpaid Credit</th>
                                <th className="p-2.5 text-center">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                              {arrearsData.monthlyBreakdown.map((m, mIdx) => (
                                <tr key={`mb-${m.invoiceNumber}-${mIdx}`} className="hover:bg-slate-50/70">
                                  <td className="p-2.5 font-mono font-bold text-blue-700">{m.invoiceNumber}</td>
                                  <td className="p-2.5 text-slate-700">{m.periodMonth}</td>
                                  <td className="p-2.5 text-right font-bold text-slate-900">{formatKSH(m.totalAmount)}</td>
                                  <td className="p-2.5 text-right font-bold text-emerald-700">{formatKSH(m.amountPaid)}</td>
                                  <td className="p-2.5 text-right">
                                    {m.overpaidAmount > 0 ? (
                                      <span className="font-extrabold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 inline-flex items-center gap-1">
                                        <Sparkles className="w-3 h-3" /> +{formatKSH(m.overpaidAmount)}
                                      </span>
                                    ) : (
                                      <span className="text-slate-400 font-mono text-[11px]">-</span>
                                    )}
                                  </td>
                                  <td className="p-2.5 text-center">
                                    {m.status === 'Overpaid' ? (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-600 text-white">
                                        OVERPAID
                                      </span>
                                    ) : m.status === 'Paid' ? (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                        PAID
                                      </span>
                                    ) : m.status === 'Carried Forward' ? (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700" title="This invoice's unpaid balance was added to a later invoice, so it is collected only once.">
                                        CARRIED FORWARD
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                                        {m.status.toUpperCase()}
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Payment Ledger Table (ALL TRANSACTIONS TAB) */}
      {activeTab === 'all' && (
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <Receipt className="w-4 h-4 text-emerald-600" /> All Transaction History ({payments.length})
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px] border-b border-slate-200 font-bold">
              <tr>
                <th className="p-3.5">Tenant & Unit</th>
                <th className="p-3.5">Method</th>
                <th className="p-3.5">Reference Code</th>
                <th className="p-3.5">Date Paid</th>
                <th className="p-3.5 text-right">Amount (KSh)</th>
                <th className="p-3.5 text-center">Status</th>
                <th className="p-3.5 text-center">Proof</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-800 font-medium">
              {payments.map((p, pIdx) => (
                <React.Fragment key={`allpay-${p.id || p.referenceCode}-${pIdx}`}>
                <tr className={`hover:bg-slate-50 transition ${p.status === 'Failed' ? 'opacity-60' : ''}`}>
                  <td className="p-3.5">
                    <p className="font-bold text-slate-900">{p.tenantName}</p>
                    <p className="text-[10px] text-slate-500 font-medium">Unit {p.unitNumber}</p>
                  </td>
                  <td className="p-3.5 font-bold text-emerald-700">{p.paymentMethod}</td>
                  <td className="p-3.5 font-mono text-slate-700">{p.referenceCode}</td>
                  <td className="p-3.5 text-slate-500">
                    {new Date(p.paymentDate).toLocaleDateString('en-KE')}
                  </td>
                  <td className="p-3.5 text-right font-extrabold text-emerald-600 text-sm">
                    {formatKSH(p.amount)}
                  </td>
                  <td className="p-3.5 text-center">{statusPill(p)}</td>
                  {proofCell(p, 'p-3.5')}
                </tr>
                {proofRow(p, 7)}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* UNACCOUNTED & ORPHAN PAYMENTS HOLDING QUEUE TAB */}
      {activeTab === 'unaccounted' && (
        <UnaccountedPaymentsQueue
          unaccountedPayments={unaccountedPayments}
          tenants={tenants}
          invoices={invoices}
          onAssignPayment={handleAssignUnaccountedPayment}
          onIgnorePayment={handleIgnoreUnaccountedPayment}
        />
      )}

      {/* BANK STATEMENT & TILL CSV AUTO-RECONCILER TAB */}
      {activeTab === 'bank_reconcile' && (
        <BankStatementReconciler
          tenants={tenants}
          invoices={invoices}
          onBatchReconcile={handleBatchReconcileRecords}
        />
      )}

      {/* LIVE BANK CONNECTIONS */}
      {activeTab === 'bank_status' && (
        <div className="space-y-4">
          <BankConnectionsStatus />
          <div className="bg-white border border-slate-200 rounded-2xl p-4 text-xs space-y-2" data-testid="webhook-urls">
            <h4 className="font-extrabold text-slate-900 text-sm">Notification (webhook) addresses to register with each bank</h4>
            <p className="text-slate-600">Give these HTTPS addresses to your bank relationship manager or enter them in the bank&apos;s developer portal. Each bank signs its notifications; unsigned or tampered calls are rejected and logged.</p>
            {(['equity', 'kcb', 'coop', 'pesalink'] as const).map((b) => (
              <div key={b} className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                <span className="font-bold uppercase text-[10px] text-slate-500 w-16">{b}</span>
                <code className="font-mono text-[11px] text-slate-800 break-all flex-1">{`${getApiBaseUrl() || (typeof window !== 'undefined' ? window.location.origin : '')}/api/banks/${b}/callback`}</code>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Record / STK Push Payment Modal */}
      {showRecordModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-5 space-y-4 text-xs shadow-xl text-slate-900">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-emerald-600" /> Record / Request Payment
            </h3>

            {stkMessage && (
              <div role="status" aria-live="polite" className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-medium text-xs">
                {stkMessage}
              </div>
            )}
            {recordError && (
              <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-medium text-xs">
                {recordError}
              </div>
            )}
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
              Entries made here are marked <strong>recorded by landlord</strong> (not bank-verified). For a bank deposit, use <strong>Verify Bank / M-Pesa Payment</strong> instead so the bank confirms it.
            </p>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-slate-700 font-medium mb-1">Select Invoice</label>
                <select
                  value={payInvoiceId}
                  onChange={(e) => {
                    setPayInvoiceId(e.target.value);
                    const inv = invoices.find((i) => i.id === e.target.value);
                    if (inv) setPayAmount(invoiceDue(inv).toString());
                  }}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 shadow-sm"
                >
                  {unpaidInvoices.length > 0 ? (
                    unpaidInvoices.map((inv, invIdx) => (
                      <option key={`unpaid-${inv.id}-${invIdx}`} value={inv.id}>
                        {inv.invoiceNumber} - {inv.tenantName} ({formatKSH(invoiceDue(inv))} due)
                      </option>
                    ))
                  ) : (
                    <option value="">No outstanding invoices</option>
                  )}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Amount (KSh)</label>
                  <input
                    type="number"
                    required
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Payment Method</label>
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value as any)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 shadow-sm"
                  >
                    <option value="M-Pesa">M-Pesa Express</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Credit Card">Credit Card</option>
                    <option value="Cash">Cash</option>
                    <option value="Check">Check</option>
                  </select>
                </div>
              </div>

              {(() => {
                const targetInv = invoices.find((i) => i.id === payInvoiceId);
                if (!targetInv) return null;
                const remDue = invoiceDue(targetInv);
                if ((parseFloat(payAmount) || 0) <= remDue) return null;
                return (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-[11px] text-rose-800" role="alert">
                    The amount is more than the balance of <strong>{formatKSH(remDue)}</strong> on this invoice. Record the balance here; anything extra should be recorded against the next invoice.
                  </div>
                );
              })()}

              {payMethod === 'M-Pesa' && (
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 space-y-2">
                  <label className="block font-bold text-emerald-900">M-Pesa Phone Number (+254)</label>
                  <input
                    type="text"
                    value={mpesaPhone}
                    onChange={(e) => setMpesaPhone(e.target.value)}
                    placeholder="0712 345 678"
                    className="w-full bg-white border border-emerald-300 rounded-lg p-2 text-slate-900 font-mono shadow-xs"
                  />
                  <button
                    type="button"
                    disabled={isStkPushing || !payAmount || mpesaPhone.trim().length < 9}
                    onClick={handleTriggerStkPush}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition shadow-xs flex items-center justify-center gap-1.5"
                  >
                    {isStkPushing ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Sending M-Pesa STK Push...
                      </>
                    ) : (
                      <>
                        <Smartphone className="w-3.5 h-3.5" /> Trigger Instant M-Pesa Prompt
                      </>
                    )}
                  </button>
                  <p className="text-[10px] text-emerald-700 text-center">Sends M-Pesa payment prompt to tenant's phone</p>
                </div>
              )}

              {payMethod === 'Bank Transfer' && (
                <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-200 space-y-2">
                  <label className="block text-slate-700 font-bold text-[11px] flex items-center gap-1.5">
                    <Landmark className="w-3.5 h-3.5 text-blue-600" /> Settling Bank / Channel (e.g. Equity, Co-op, KCB):
                  </label>
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        setPayNotes((prev) => prev ? `${prev} via ${e.target.value}` : `Settled via ${e.target.value}`);
                      }
                    }}
                    className="w-full bg-white border border-blue-200 rounded-lg p-2 text-slate-900 font-semibold shadow-xs"
                  >
                    <option value="">-- Choose Originating / Destination Bank --</option>
                    {KENYA_BANKS.map((b) => (
                      <option key={b.id} value={b.name}>
                        {b.name} (PesaLink / EFT)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {payMethod !== 'Cash' && (
                <div>
                  <label className="block text-slate-700 font-medium mb-1">{payMethod === 'M-Pesa' ? 'M-Pesa confirmation code (if already paid)' : 'Transaction ref / receipt code'}</label>
                  <input
                    type="text"
                    required
                    value={payRef}
                    onChange={(e) => setPayRef(e.target.value)}
                    placeholder={payMethod === 'M-Pesa' ? 'e.g. QJK9483HD7' : 'e.g. EQ98102910 or PesaLink ref'}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 shadow-sm"
                  />
                </div>
              )}

              <div>
                <label className="block text-slate-700 font-medium mb-1">Payment Notes</label>
                <input
                  type="text"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder="e.g. Full settlement for August rent"
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 shadow-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowRecordModal(false); setRecordError(null); }}
                  className="px-4 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 font-medium hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition shadow-sm"
                >
                  Record Payment (landlord entry)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VERIFY BANK / M-PESA PAYMENT (live, server-confirmed) */}
      {showVerifyModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-start sm:items-center justify-center p-3 z-50 overflow-y-auto animate-fadeIn" role="dialog" aria-modal="true" aria-label="Verify a bank or M-Pesa payment">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4 border border-slate-100 my-auto max-h-[94vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-800 flex items-center justify-center"><ShieldCheck className="w-5 h-5 text-blue-700" /></div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">Verify a bank / M-Pesa payment</h3>
                  <p className="text-[11px] text-slate-500">Checks the bank&apos;s own record and posts the payment once, with an audit trail</p>
                </div>
              </div>
              <button onClick={() => setShowVerifyModal(false)} className="text-slate-400 hover:text-slate-700 text-sm font-bold p-1 rounded-md cursor-pointer" aria-label="Close">✕</button>
            </div>

            <div className="text-xs">
              <label className="block text-slate-700 font-bold mb-1" htmlFor="verify-invoice">Invoice the payment is for</label>
              <select
                id="verify-invoice"
                value={verifyInvoiceId}
                onChange={(e) => setVerifyInvoiceId(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 shadow-xs"
              >
                <option value="">Choose an invoice...</option>
                {unpaidInvoices.map((inv, invIdx) => (
                  <option key={`inv-opt-${inv.id}-${invIdx}`} value={inv.id}>
                    #{inv.invoiceNumber} - {inv.tenantName} ({inv.unitNumber}) - due {formatKSH(invoiceDue(inv))}
                  </option>
                ))}
              </select>
            </div>

            {(() => {
              const inv = unpaidInvoices.find((i) => i.id === verifyInvoiceId);
              return inv ? (
                <BankVerificationPanel key={inv.id} invoice={inv} onVerified={() => { if (onPaymentProcessed) onPaymentProcessed(); }} />
              ) : (
                <p className="text-[11px] text-slate-500">Choose an invoice to start. Deposits that arrive through a connected bank are posted automatically and do not need this step.</p>
              );
            })()}

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button type="button" onClick={() => setShowVerifyModal(false)} className="px-4 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 transition text-xs cursor-pointer">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* REVERSE A PAYMENT */}
      {reversing && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50" role="dialog" aria-modal="true" aria-label="Reverse payment">
          <form onSubmit={confirmReverse} className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-3 border border-rose-100 text-xs">
            <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-rose-600" /> Reverse payment</h3>
            <p className="text-slate-600">
              This removes <strong>{formatKSH(reversing.amount)}</strong> ({reversing.referenceCode}) from {reversing.tenantName}&apos;s account and restores the invoice balance.
              The reference stays used, so the same transaction can never be recorded again. The reversal is written to the audit log.
            </p>
            <div>
              <label className="block font-bold text-slate-700 mb-1" htmlFor="rev-reason">Reason (at least 5 characters)</label>
              <input id="rev-reason" required minLength={5} maxLength={200} value={reverseReason} onChange={(e) => setReverseReason(e.target.value)} className="w-full border border-slate-300 rounded-lg p-2.5" placeholder="e.g. Cheque bounced / recorded against wrong tenant" />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1" htmlFor="rev-pass">Your password</label>
              <input id="rev-pass" required type="password" autoComplete="current-password" value={reversePassword} onChange={(e) => setReversePassword(e.target.value)} className="w-full border border-slate-300 rounded-lg p-2.5" />
            </div>
            {reverseError && <p role="alert" className="text-rose-700 font-semibold">{reverseError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setReversing(null)} className="px-4 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer">Cancel</button>
              <button type="submit" disabled={reverseBusy || reverseReason.trim().length < 5 || !reversePassword} className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold disabled:opacity-50 cursor-pointer">
                {reverseBusy ? 'Reversing...' : 'Reverse payment'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* EXCEL EXPORT MODAL */}
      {showExportModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center border border-emerald-200 shadow-xs">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-700" />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900">Download Excel Payment Ledger</h3>
                  <p className="text-xs text-slate-500">
                    Export all calculations of rent billed, payments made to date, and arrears balances.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowExportModal(false)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold p-1 rounded-md transition"
              >
                ✕
              </button>
            </div>

            {/* Scope Selection */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">
                Select Buildings to Include
              </label>
              <select
                value={exportBuildingFilter}
                onChange={(e) => setExportBuildingFilter(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-xs text-slate-900 font-semibold focus:bg-white focus:ring-2 focus:ring-emerald-500"
              >
                <option value="all">
                  📁 All Buildings Portfolio (Separate Worksheets per Building + Master Summary)
                </option>
                {buildingCalcData.buildingSummaries.map((bs) => (
                  <option key={`exp-bld-${bs.property.id}`} value={bs.property.id}>
                    🏢 {bs.property.name} ({bs.tenantsCount} Tenants • Billed: {formatKSH(bs.totalBilled)} • Arrears: {formatKSH(bs.totalArrears)})
                  </option>
                ))}
              </select>
            </div>

            {/* Calculations Preview Summary */}
            {(() => {
              const selectedSummary = exportBuildingFilter === 'all'
                ? {
                    name: 'All Buildings (Full Portfolio)',
                    billed: buildingCalcData.grandTotalBilled,
                    paid: buildingCalcData.grandTotalPaid,
                    arrears: buildingCalcData.grandTotalArrears,
                    rate: buildingCalcData.grandCollectionRate,
                    tenants: buildingCalcData.buildingSummaries.reduce((sum, b) => sum + b.tenantsCount, 0),
                    buildingsCount: buildingCalcData.buildingSummaries.length,
                  }
                : (() => {
                    const found = buildingCalcData.buildingSummaries.find(
                      (b) => b.property.id === exportBuildingFilter || b.property.name === exportBuildingFilter
                    );
                    return {
                      name: found?.property.name || 'Selected Building',
                      billed: found?.totalBilled || 0,
                      paid: found?.totalPaid || 0,
                      arrears: found?.totalArrears || 0,
                      rate: found?.collectionRate || 0,
                      tenants: found?.tenantsCount || 0,
                      buildingsCount: 1,
                    };
                  })();

              return (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Building2 className="w-4 h-4 text-emerald-600" />
                      {selectedSummary.name}
                    </span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                      {selectedSummary.tenants} Tenant Accounts
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2.5 pt-1">
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] uppercase font-bold text-slate-500 block">Total Billed</span>
                      <span className="text-sm font-extrabold text-slate-900 block">{formatKSH(selectedSummary.billed)}</span>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] uppercase font-bold text-slate-500 block">Payments Made</span>
                      <span className="text-sm font-extrabold text-emerald-700 block">{formatKSH(selectedSummary.paid)}</span>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] uppercase font-bold text-slate-500 block">Outstanding Arrears</span>
                      <span className={`text-sm font-extrabold block ${selectedSummary.arrears > 0 ? 'text-amber-600' : 'text-emerald-700'}`}>
                        {formatKSH(selectedSummary.arrears)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Excel Sheet Structure Breakdown */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Excel Sheet Structure Included in Download:
              </h4>
              <ul className="text-xs space-y-1.5 text-slate-600">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>Portfolio Summary Sheet:</strong> Overall KPI comparison of every building, unit counts, total rent billed, collections, arrears, and recovery rates.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>Separate Worksheets per Building:</strong> Dedicated sheet for each building with tenant unit numbers, names, contacts, monthly rent, rent billed up to date, payments received, and arrears balances.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>All Payments History Sheet:</strong> Comprehensive ledger of all individual payment receipts, M-Pesa transaction codes, dates, and verification statuses.
                  </span>
                </li>
              </ul>
            </div>

            <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-50 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                id="btn-confirm-download-excel"
                onClick={() => handleDownloadExcel(exportBuildingFilter)}
                disabled={isExporting}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition flex items-center gap-2 cursor-pointer disabled:opacity-50 hover:scale-105 active:scale-95"
              >
                {isExporting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Generating Excel File...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" /> Download Excel Workbook (.xlsx)
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};
