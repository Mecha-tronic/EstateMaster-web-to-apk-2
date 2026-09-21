import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Payment, Invoice, Tenant, Property, Landlord } from '../types';
import { formatKSH } from '../lib/formatters';
import { calculateTenantArrears } from '../lib/arrears';
import { exportLandlordPaymentLedgerToExcel, calculateBuildingLedgers } from '../lib/excelExport';
import { triggerMpesaStkPush, verifyMpesaReceiptCode, fetchMpesaConfigStatus } from '../lib/api';
import { KENYA_BANKS } from '../lib/kenyaBanks';
import { DollarSign, CheckCircle2, Clock, Plus, CreditCard, Receipt, Smartphone, RefreshCw, Users, Search, Building, AlertTriangle, TrendingDown, Landmark, Check, ShieldCheck, Zap, FileSpreadsheet, Download, Building2, Table } from 'lucide-react';

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
  const [activeTab, setActiveTab] = useState<'grouped' | 'all'>('grouped');
  const [searchQuery, setSearchQuery] = useState('');
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [payInvoiceId, setPayInvoiceId] = useState(invoices[0]?.id || '');
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<'M-Pesa' | 'Bank Transfer' | 'Credit Card' | 'Cash' | 'Check'>('M-Pesa');
  const [payRef, setPayRef] = useState('');
  const [payNotes, setPayNotes] = useState('');

  // M-Pesa Express STK Push State
  const [mpesaPhone, setMpesaPhone] = useState('+254 712 345 678');
  const [isStkPushing, setIsStkPushing] = useState(false);
  const [stkMessage, setStkMessage] = useState<string | null>(null);

  // M-Pesa Direct Code Verification Modal State
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyInvoiceId, setVerifyInvoiceId] = useState(invoices[0]?.id || '');
  const [verifyAmount, setVerifyAmount] = useState('');
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [verifyFeedback, setVerifyFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Daraja Gateway Connection Info
  const [darajaStatus, setDarajaStatus] = useState<any>(null);

  // Excel Ledger Export State
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportBuildingFilter, setExportBuildingFilter] = useState<string>('all');
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccessMsg, setExportSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchMpesaConfigStatus().then(setDarajaStatus).catch(console.error);
  }, []);

  const unpaidInvoices = invoices.filter((i) => i.status !== 'Paid');

  // Collect unique registered tenants for single tenant ledgers
  const tenantMap = new Map<string, { id: string; name: string; unitNumber: string; propertyName: string }>();

  if (tenants && tenants.length > 0) {
    // Strictly list ONLY registered tenants
    tenants.forEach((t) => {
      const key = t.fullName.toLowerCase().trim();
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onRecordPayment({
      invoiceId: payInvoiceId,
      amount: parseFloat(payAmount),
      paymentMethod: payMethod,
      referenceCode: payRef,
      notes: payNotes,
    });
    setShowRecordModal(false);
    setPayAmount('');
    setPayRef('');
  };

  const handleTriggerStkPush = async () => {
    if (!payInvoiceId || !payAmount) return;
    setIsStkPushing(true);
    setStkMessage(null);

    try {
      const selectedInv = invoices.find((i) => i.id === payInvoiceId);
      const res = await triggerMpesaStkPush({
        phone: mpesaPhone,
        amount: parseFloat(payAmount),
        invoiceId: payInvoiceId,
        accountRef: selectedInv?.unitNumber || 'RENT'
      });

      setStkMessage(`✅ ${res.message || res.CustomerMessage || 'STK Push Dispatched'}`);
      if (onPaymentProcessed) onPaymentProcessed();
      setTimeout(() => {
        setShowRecordModal(false);
        setStkMessage(null);
      }, 2500);
    } catch (err: any) {
      setStkMessage(`❌ Error triggering M-Pesa STK Push: ${err.message}`);
    } finally {
      setIsStkPushing(false);
    }
  };

  const handleVerifyReceiptCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyCode.trim()) return;

    setIsVerifyingCode(true);
    setVerifyFeedback(null);

    try {
      const selectedInv = invoices.find((i) => i.id === verifyInvoiceId);
      const res = await verifyMpesaReceiptCode({
        receiptCode: verifyCode.trim().toUpperCase(),
        amount: verifyAmount ? parseFloat(verifyAmount) : undefined,
        invoiceId: verifyInvoiceId || undefined,
        tenantId: selectedInv?.tenantId,
      });

      setVerifyFeedback({
        type: 'success',
        message: res.message || `Code ${verifyCode.toUpperCase()} verified successfully!`
      });

      if (onPaymentProcessed) onPaymentProcessed();
      setTimeout(() => {
        setShowVerifyModal(false);
        setVerifyCode('');
        setVerifyAmount('');
        setVerifyFeedback(null);
      }, 2000);
    } catch (err: any) {
      setVerifyFeedback({
        type: 'error',
        message: err.message || 'M-Pesa confirmation code verification failed'
      });
    } finally {
      setIsVerifyingCode(false);
    }
  };

  const portfolioArrearsList = tenantGroups.map((g) => {
    const matchedTenant = tenants.find((t) => t.id === g.id || t.fullName.toLowerCase() === g.name.toLowerCase());
    const tenantObj = matchedTenant || { id: g.id, fullName: g.name, email: '' };
    return {
      group: g,
      arrears: calculateTenantArrears(tenantObj, invoices, payments)
    };
  });

  const totalPortfolioArrears = portfolioArrearsList.reduce((sum, item) => sum + item.arrears.totalArrears, 0);
  const totalPortfolioBilled = portfolioArrearsList.reduce((sum, item) => sum + item.arrears.totalInvoiced, 0);
  const totalPortfolioPaid = portfolioArrearsList.reduce((sum, item) => sum + item.arrears.totalPaid, 0);

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
            Real-time tracking of rent collection, partial payments, tenant arrears balances, and M-Pesa STK pushes.
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
            <ShieldCheck className="w-4 h-4 text-blue-600" /> Verify M-Pesa Code
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1">
            <span className="text-[11px] text-slate-400 font-extrabold uppercase tracking-wider block">Total Outstanding Arrears</span>
            <p className={`text-2xl font-black ${totalPortfolioArrears > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {formatKSH(totalPortfolioArrears)}
            </p>
            <p className="text-[11px] text-slate-400">Arrears balance due across all active tenant accounts</p>
          </div>

          <div className="space-y-1 sm:border-l border-slate-800 sm:pl-4">
            <span className="text-[11px] text-slate-400 font-extrabold uppercase tracking-wider block">Total Rent Billed</span>
            <p className="text-xl font-bold text-white">{formatKSH(totalPortfolioBilled)}</p>
            <p className="text-[11px] text-slate-400">Total invoice billing generated to date</p>
          </div>

          <div className="space-y-1 sm:border-l border-slate-800 sm:pl-4">
            <span className="text-[11px] text-slate-400 font-extrabold uppercase tracking-wider block">Total Collected to Date</span>
            <p className="text-xl font-bold text-emerald-400">{formatKSH(totalPortfolioPaid)}</p>
            <p className="text-[11px] text-slate-400">Settled rent & utility payments received</p>
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
      <div className="flex border-b border-slate-200 text-xs font-semibold overflow-x-auto">
        <button
          onClick={() => setActiveTab('grouped')}
          className={`pb-3 px-4 border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'grouped'
              ? 'border-emerald-600 text-emerald-700 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users className="w-4 h-4" /> Single Tenant Ledgers ({tenantGroups.length})
        </button>
        <button
          onClick={() => setActiveTab('all')}
          className={`pb-3 px-4 border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'all'
              ? 'border-emerald-600 text-emerald-700 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Receipt className="w-4 h-4" /> All Transactions History ({payments.length})
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
              const matchedTenant = tenants.find((t) => t.id === group.id || t.fullName.toLowerCase() === group.name.toLowerCase());
              const tenantObj = matchedTenant || { id: group.id, fullName: group.name, email: '' };
              const arrearsData = calculateTenantArrears(tenantObj, invoices, payments);

              const groupPayments = payments.filter(
                (p) =>
                  p.tenantName.toLowerCase() === group.name.toLowerCase() ||
                  (p.tenantId && p.tenantId === group.id)
              );

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
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            arrearsData.status === 'Up-To-Date' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                            arrearsData.status === 'Partial Arrears' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                            'bg-rose-100 text-rose-800 border border-rose-200'
                          }`}>
                            {arrearsData.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {groupPayments.length} Transaction{groupPayments.length === 1 ? '' : 's'} | Total Billed: {formatKSH(arrearsData.totalInvoiced)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
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
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-800 font-medium">
                          {groupPayments.map((p, pIdx) => (
                            <tr key={`gpay-${p.id || p.referenceCode}-${pIdx}`} className="hover:bg-slate-50/70 transition">
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
                              <td className="p-3 text-center">
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200 inline-flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" /> {p.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
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
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-800 font-medium">
              {payments.map((p, pIdx) => (
                <tr key={`allpay-${p.id || p.referenceCode}-${pIdx}`} className="hover:bg-slate-50 transition">
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
                  <td className="p-3.5 text-center">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200 inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> {p.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-medium text-xs">
                {stkMessage}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-slate-700 font-medium mb-1">Select Invoice</label>
                <select
                  value={payInvoiceId}
                  onChange={(e) => {
                    setPayInvoiceId(e.target.value);
                    const inv = invoices.find((i) => i.id === e.target.value);
                    if (inv) setPayAmount((inv.totalAmount - (inv.amountPaid || 0)).toString());
                  }}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 shadow-sm"
                >
                  {unpaidInvoices.length > 0 ? (
                    unpaidInvoices.map((inv, invIdx) => (
                      <option key={`unpaid-${inv.id}-${invIdx}`} value={inv.id}>
                        {inv.invoiceNumber} - {inv.tenantName} ({formatKSH(inv.totalAmount - (inv.amountPaid || 0))} due)
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

              {payMethod === 'M-Pesa' && (
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 space-y-2">
                  <label className="block font-bold text-emerald-900">M-Pesa Phone Number (+254)</label>
                  <input
                    type="text"
                    value={mpesaPhone}
                    onChange={(e) => setMpesaPhone(e.target.value)}
                    className="w-full bg-white border border-emerald-300 rounded-lg p-2 text-slate-900 font-mono shadow-xs"
                  />
                  <button
                    type="button"
                    disabled={isStkPushing || !payAmount}
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

              {payMethod !== 'M-Pesa' && (
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Transaction Ref / Receipt Code</label>
                  <input
                    type="text"
                    required
                    value={payRef}
                    onChange={(e) => setPayRef(e.target.value)}
                    placeholder="e.g. EFT-92810283 or PesaLink Ref"
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
                  onClick={() => setShowRecordModal(false)}
                  className="px-4 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 font-medium hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition shadow-sm"
                >
                  Record Manual Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VERIFY M-PESA CONFIRMATION CODE MODAL */}
      {showVerifyModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 border border-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-800 flex items-center justify-center font-bold">
                  <ShieldCheck className="w-5 h-5 text-blue-700" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">Verify M-Pesa Transaction Code</h3>
                  <p className="text-[11px] text-slate-500">Auto-reconciles invoice and generates proof of payment</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowVerifyModal(false);
                  setVerifyFeedback(null);
                }}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold p-1 rounded-md"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleVerifyReceiptCode} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  M-Pesa Confirmation Code <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.toUpperCase())}
                  placeholder="e.g. SAB9812471 or QHX892JK12"
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono font-bold text-sm tracking-wider uppercase focus:bg-white focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-[10px] text-slate-500 mt-1">10-character code received by tenant from MPESA SMS</p>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Select Associated Invoice</label>
                <select
                  value={verifyInvoiceId}
                  onChange={(e) => setVerifyInvoiceId(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 shadow-xs"
                >
                  <option value="">-- No specific invoice (General credit) --</option>
                  {invoices.map((inv, invIdx) => (
                    <option key={`inv-opt-${inv.id}-${invIdx}`} value={inv.id}>
                      #{inv.invoiceNumber} - {inv.tenantName} ({inv.unitNumber}) - Due: {formatKSH(inv.totalAmount - (inv.amountPaid || 0))}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Amount Paid (KSh)</label>
                <input
                  type="number"
                  value={verifyAmount}
                  onChange={(e) => setVerifyAmount(e.target.value)}
                  placeholder="e.g. 25000 (Defaults to remaining due if left blank)"
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 shadow-xs"
                />
              </div>

              {verifyFeedback && (
                <div
                  className={`p-3 rounded-xl text-xs font-semibold ${
                    verifyFeedback.type === 'success'
                      ? 'bg-emerald-50 text-emerald-900 border border-emerald-300'
                      : 'bg-rose-50 text-rose-900 border border-rose-300'
                  }`}
                >
                  {verifyFeedback.message}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowVerifyModal(false)}
                  className="px-4 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 transition cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={isVerifyingCode || !verifyCode.trim()}
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold transition shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  {isVerifyingCode ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Verifying Code...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" /> Verify & Reconcile Payment
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
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
