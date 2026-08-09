import React, { useState } from 'react';
import { Payment, Invoice, Tenant } from '../types';
import { formatKSH } from '../lib/formatters';
import { triggerMpesaStkPush } from '../lib/api';
import { DollarSign, CheckCircle2, Clock, Plus, CreditCard, Receipt, Smartphone, RefreshCw, Users, Search, Building } from 'lucide-react';

interface PaymentTrackerViewProps {
  payments: Payment[];
  invoices: Invoice[];
  tenants?: Tenant[];
  onRecordPayment: (data: any) => void;
  onPaymentProcessed?: () => void;
}

export const PaymentTrackerView: React.FC<PaymentTrackerViewProps> = ({
  payments,
  invoices,
  tenants = [],
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

      setStkMessage(`✅ ${res.message}`);
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

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-emerald-600" /> Rental Payment Ledger (KSh)
          </h2>
          <p className="text-xs sm:text-sm text-slate-500">
            Track all incoming rental payments, trigger M-Pesa Express STK pushes, and dispatch receipts.
          </p>
        </div>

        <button
          onClick={() => setShowRecordModal(true)}
          className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> Record / Trigger Payment
        </button>
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
            tenantGroups.map((group) => {
              const groupPayments = payments.filter(
                (p) =>
                  p.tenantName.toLowerCase() === group.name.toLowerCase() ||
                  (p.tenantId && p.tenantId === group.id)
              );

              const totalPaid = groupPayments.reduce((sum, p) => sum + p.amount, 0);

              return (
                <div
                  key={group.id}
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
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {groupPayments.length} Payment Transaction{groupPayments.length === 1 ? '' : 's'} Recorded
                        </p>
                      </div>
                    </div>

                    <div className="bg-white border border-emerald-200 rounded-xl p-2.5 text-center sm:text-right shadow-2xs">
                      <p className="text-[10px] text-emerald-600 font-medium">Total Rent Collected</p>
                      <p className="text-base font-extrabold text-emerald-700">{formatKSH(totalPaid)}</p>
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
                          {groupPayments.map((p) => (
                            <tr key={p.id} className="hover:bg-slate-50/70 transition">
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
              {payments.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50 transition">
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
                    unpaidInvoices.map((inv) => (
                      <option key={inv.id} value={inv.id}>
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

              {payMethod !== 'M-Pesa' && (
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Transaction Ref / Receipt Code</label>
                  <input
                    type="text"
                    required
                    value={payRef}
                    onChange={(e) => setPayRef(e.target.value)}
                    placeholder="e.g. RK92810283 or Bank Trans ID"
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
    </div>
  );
};
