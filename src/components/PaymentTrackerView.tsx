import React, { useState } from 'react';
import { Payment, Invoice } from '../types';
import { formatKSH } from '../lib/formatters';
import { triggerMpesaStkPush } from '../lib/api';
import { DollarSign, CheckCircle2, Clock, Plus, CreditCard, Receipt, Smartphone, RefreshCw } from 'lucide-react';

interface PaymentTrackerViewProps {
  payments: Payment[];
  invoices: Invoice[];
  onRecordPayment: (data: any) => void;
  onPaymentProcessed?: () => void;
}

export const PaymentTrackerView: React.FC<PaymentTrackerViewProps> = ({
  payments,
  invoices,
  onRecordPayment,
  onPaymentProcessed
}) => {
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

      {/* Payment Ledger Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <Receipt className="w-4 h-4 text-emerald-600" /> Transaction History ({payments.length})
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
