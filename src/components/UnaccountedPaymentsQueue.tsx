import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { UnaccountedPayment, Tenant, Invoice } from '../types';
import { formatKSH } from '../lib/formatters';
import {
  AlertTriangle,
  CheckCircle2,
  Search,
  Plus,
  ArrowRight,
  ShieldCheck,
  Building,
  Smartphone,
  Landmark,
  UserCheck,
  Sparkles,
  HelpCircle,
  Clock,
  Filter,
  Check
} from 'lucide-react';

interface UnaccountedPaymentsQueueProps {
  unaccountedPayments: UnaccountedPayment[];
  tenants: Tenant[];
  invoices: Invoice[];
  onAssignPayment: (unaccountedId: string, tenantId: string, invoiceId?: string, notes?: string) => Promise<void>;
  onAddUnaccountedPayment: (data: Partial<UnaccountedPayment>) => Promise<void>;
}

export const UnaccountedPaymentsQueue: React.FC<UnaccountedPaymentsQueueProps> = ({
  unaccountedPayments,
  tenants,
  invoices,
  onAssignPayment,
  onAddUnaccountedPayment
}) => {
  const [filterSource, setFilterSource] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<'pending' | 'reconciled' | 'all'>('pending');
  const [searchQuery, setSearchQuery] = useState('');

  // Assign Modal
  const [selectedPayment, setSelectedPayment] = useState<UnaccountedPayment | null>(null);
  const [assignTenantId, setAssignTenantId] = useState<string>('');
  const [assignInvoiceId, setAssignInvoiceId] = useState<string>('');
  const [assignNotes, setAssignNotes] = useState<string>('');
  const [isAssigning, setIsAssigning] = useState(false);
  const [assignSuccessMsg, setAssignSuccessMsg] = useState<string | null>(null);

  // Manual Log Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newSource, setNewSource] = useState<UnaccountedPayment['source']>('M-Pesa Till');
  const [newRefCode, setNewRefCode] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newSenderName, setNewSenderName] = useState('');
  const [newSenderPhone, setNewSenderPhone] = useState('');
  const [newNarration, setNewNarration] = useState('');
  const [newBankName, setNewBankName] = useState('Equity Bank');
  const [isAdding, setIsAdding] = useState(false);

  // Filtered payments
  const filteredList = unaccountedPayments.filter((p) => {
    if (filterStatus === 'pending' && p.status !== 'Pending Assignment') return false;
    if (filterStatus === 'reconciled' && p.status !== 'Reconciled') return false;

    if (filterSource !== 'all') {
      if (filterSource === 'mpesa' && !p.source.toLowerCase().includes('mpesa')) return false;
      if (filterSource === 'bank' && !p.source.toLowerCase().includes('bank') && !p.source.toLowerCase().includes('pesalink')) return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchRef = p.referenceCode.toLowerCase().includes(q);
      const matchName = (p.senderName || '').toLowerCase().includes(q);
      const matchNarr = (p.rawNarration || '').toLowerCase().includes(q);
      const matchPhone = (p.senderPhone || '').toLowerCase().includes(q);
      const matchSug = (p.suggestedTenantName || '').toLowerCase().includes(q);
      if (!matchRef && !matchName && !matchNarr && !matchPhone && !matchSug) return false;
    }

    return true;
  });

  const pendingCount = unaccountedPayments.filter((p) => p.status === 'Pending Assignment').length;
  const totalPendingAmount = unaccountedPayments
    .filter((p) => p.status === 'Pending Assignment')
    .reduce((sum, p) => sum + p.amount, 0);

  const handleOpenAssignModal = (payment: UnaccountedPayment) => {
    setSelectedPayment(payment);
    // Preselect suggested tenant if available
    const suggested = tenants.find(
      (t) =>
        t.id === payment.suggestedTenantId ||
        (payment.suggestedTenantName && t.fullName.toLowerCase() === payment.suggestedTenantName.toLowerCase()) ||
        (payment.suggestedUnitNumber && t.unitNumber?.toLowerCase() === payment.suggestedUnitNumber.toLowerCase())
    );
    const initialTenantId = suggested ? suggested.id : tenants[0]?.id || '';
    setAssignTenantId(initialTenantId);

    // Find unpaid invoice
    const unpaid = invoices.find((i) => i.tenantId === initialTenantId && i.status !== 'Paid');
    setAssignInvoiceId(unpaid ? unpaid.id : '');
    setAssignNotes('');
    setAssignSuccessMsg(null);
  };

  const handleTenantChange = (tenantId: string) => {
    setAssignTenantId(tenantId);
    const unpaid = invoices.find((i) => i.tenantId === tenantId && i.status !== 'Paid');
    setAssignInvoiceId(unpaid ? unpaid.id : '');
  };

  const handleConfirmAssign = async () => {
    if (!selectedPayment || !assignTenantId) return;
    setIsAssigning(true);
    try {
      await onAssignPayment(selectedPayment.id, assignTenantId, assignInvoiceId || undefined, assignNotes);
      setAssignSuccessMsg('Payment successfully linked, invoice settled, and receipt dispatched!');
      setTimeout(() => {
        setSelectedPayment(null);
        setIsAssigning(false);
        setAssignSuccessMsg(null);
      }, 1500);
    } catch (err: any) {
      alert(`Assignment failed: ${err.message}`);
      setIsAssigning(false);
    }
  };

  const handleQuickAcceptSuggestion = async (payment: UnaccountedPayment) => {
    const suggestedTenant = tenants.find(
      (t) =>
        t.id === payment.suggestedTenantId ||
        (payment.suggestedTenantName && t.fullName.toLowerCase() === payment.suggestedTenantName.toLowerCase()) ||
        (payment.suggestedUnitNumber && t.unitNumber?.toLowerCase() === payment.suggestedUnitNumber.toLowerCase())
    );

    if (!suggestedTenant) {
      handleOpenAssignModal(payment);
      return;
    }

    const unpaidInvoice = invoices.find(
      (i) =>
        (i.tenantId === suggestedTenant.id || i.tenantName.toLowerCase() === suggestedTenant.fullName.toLowerCase()) &&
        i.status !== 'Paid'
    );

    try {
      await onAssignPayment(
        payment.id,
        suggestedTenant.id,
        unpaidInvoice?.id,
        `Quick 1-Click Auto Reconciled: ${payment.notes || ''}`
      );
    } catch (err: any) {
      alert(`Auto-reconciliation error: ${err.message}`);
    }
  };

  const handleCreateManualUnaccounted = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRefCode || !newAmount) return;

    setIsAdding(true);
    try {
      await onAddUnaccountedPayment({
        source: newSource,
        referenceCode: newRefCode.trim().toUpperCase(),
        amount: parseFloat(newAmount),
        senderName: newSenderName.trim() || 'Unidentified Payer',
        senderPhone: newSenderPhone.trim(),
        rawNarration: newNarration.trim(),
        bankName: newSource.includes('Bank') ? newBankName : undefined,
        notes: `Manually added to unassigned queue on ${new Date().toLocaleDateString()}`
      });
      setShowAddModal(false);
      setNewRefCode('');
      setNewAmount('');
      setNewSenderName('');
      setNewSenderPhone('');
      setNewNarration('');
    } catch (err: any) {
      alert(`Failed to add payment: ${err.message}`);
    } finally {
      setIsAdding(false);
    }
  };

  const selectedTenantObj = tenants.find((t) => t.id === assignTenantId);
  const tenantUnpaidInvoices = invoices.filter((i) => i.tenantId === assignTenantId && i.status !== 'Paid');

  return (
    <div className="space-y-6">
      {/* Header Info Banner */}
      <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-300/60 rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-amber-500 text-white rounded-lg shadow-xs">
                <HelpCircle className="w-4 h-4" />
              </span>
              <h3 className="text-base sm:text-lg font-bold text-slate-900">
                Unaccounted & Orphan Payments Holding Queue
              </h3>
            </div>
            <p className="text-xs text-slate-600 max-w-2xl leading-relaxed">
              Payments received via M-Pesa Till (Buy Goods), Paybills with missing unit numbers, or bank transfers with ambiguous narrations. Safely inspect, pair, and settle tenant bills with 1-click.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowAddModal(true)}
              className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Log Received Payment SMS
            </button>
          </div>
        </div>

        {/* Quick KPI stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-amber-200/50">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Pending Verification</span>
            <span className="text-xl font-extrabold text-amber-700">{pendingCount} payments</span>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Unassigned Value</span>
            <span className="text-xl font-extrabold text-amber-800">{formatKSH(totalPendingAmount)}</span>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Supported Channels</span>
            <span className="text-xs font-bold text-slate-700">M-Pesa Till, Paybill, Bank EFT/Pesalink</span>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Reconciliation Status</span>
            <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Deduplication Guard Active
            </span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Tabs */}
          <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-bold">
            <button
              onClick={() => setFilterStatus('pending')}
              className={`px-3 py-1.5 rounded-lg transition ${
                filterStatus === 'pending'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pending ({pendingCount})
            </button>
            <button
              onClick={() => setFilterStatus('reconciled')}
              className={`px-3 py-1.5 rounded-lg transition ${
                filterStatus === 'reconciled'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Reconciled ({unaccountedPayments.filter((p) => p.status === 'Reconciled').length})
            </button>
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-3 py-1.5 rounded-lg transition ${
                filterStatus === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({unaccountedPayments.length})
            </button>
          </div>

          {/* Channel Filters */}
          <select
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value)}
            className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 shadow-xs focus:outline-none focus:border-amber-500"
          >
            <option value="all">All Payment Sources</option>
            <option value="mpesa">M-Pesa (Till / Paybill)</option>
            <option value="bank">Bank Transfers & Pesalink</option>
          </select>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by code, payer, or notes..."
            className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 shadow-xs focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      {/* List of Unaccounted Transactions */}
      {filteredList.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-3">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
          <h4 className="text-sm font-bold text-slate-800">No Unaccounted Payments in this View</h4>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            All received rent payments have been reconciled and linked to their respective tenant invoices.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredList.map((item) => {
            const isReconciled = item.status === 'Reconciled';
            const hasSuggestion = Boolean(item.suggestedTenantName || item.suggestedUnitNumber);

            return (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`bg-white border rounded-2xl p-4 sm:p-5 transition shadow-xs ${
                  isReconciled
                    ? 'border-slate-200 bg-slate-50/50 opacity-80'
                    : 'border-amber-200/90 hover:border-amber-400 hover:shadow-md'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Left: Transaction Meta */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-black text-sm text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                        {item.referenceCode}
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1 ${
                          item.source.includes('Bank')
                            ? 'bg-blue-50 text-blue-800 border-blue-200'
                            : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        }`}
                      >
                        {item.source.includes('Bank') ? (
                          <Landmark className="w-3 h-3" />
                        ) : (
                          <Smartphone className="w-3 h-3" />
                        )}
                        {item.source} {item.bankName ? `(${item.bankName})` : ''}
                      </span>

                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isReconciled
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {item.status}
                      </span>

                      <span className="text-[11px] text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(item.receivedDate).toLocaleDateString()} at{' '}
                        {new Date(item.receivedDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs">
                      <div>
                        <span className="text-slate-500">Sender / Remitter:</span>{' '}
                        <strong className="text-slate-900">{item.senderName || 'Anonymous'}</strong>
                        {item.senderPhone && (
                          <span className="text-slate-500 text-[11px] ml-1.5">({item.senderPhone})</span>
                        )}
                      </div>

                      {item.rawNarration && (
                        <div className="truncate">
                          <span className="text-slate-500">Raw Description:</span>{' '}
                          <span className="font-mono text-slate-700 bg-slate-50 px-1 py-0.5 rounded text-[11px]">
                            {item.rawNarration}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* AI / Rule-Based Match Recommendation */}
                    {hasSuggestion && !isReconciled && (
                      <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-2.5 text-xs flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                          <div className="text-amber-900">
                            <span className="font-bold">Suggested Match:</span>{' '}
                            {item.suggestedTenantName && (
                              <strong className="underline">{item.suggestedTenantName}</strong>
                            )}
                            {item.suggestedUnitNumber && (
                              <span className="font-bold ml-1 text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded">
                                Unit {item.suggestedUnitNumber}
                              </span>
                            )}
                            {item.notes && <span className="text-[11px] text-amber-800 block">{item.notes}</span>}
                          </div>
                        </div>

                        <div className="shrink-0 flex items-center gap-2">
                          <span className="text-[10px] font-bold text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-full">
                            {item.matchConfidence || 85}% Match
                          </span>
                          <button
                            onClick={() => handleQuickAcceptSuggestion(item)}
                            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs flex items-center gap-1 shadow-xs cursor-pointer transition"
                          >
                            <Check className="w-3.5 h-3.5" /> Accept & Settle
                          </button>
                        </div>
                      </div>
                    )}

                    {isReconciled && item.reconciledTenantName && (
                      <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl p-2 flex items-center gap-2">
                        <UserCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>
                          Reconciled to <strong>{item.reconciledTenantName}</strong> on{' '}
                          {item.reconciledAt ? new Date(item.reconciledAt).toLocaleDateString() : 'Settled'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Right: Amount and Actions */}
                  <div className="flex sm:flex-col items-end justify-between sm:justify-center gap-3 shrink-0 sm:border-l sm:border-slate-100 sm:pl-5">
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Amount Paid</span>
                      <span className="text-xl sm:text-2xl font-black text-slate-900">
                        {formatKSH(item.amount)}
                      </span>
                    </div>

                    {!isReconciled && (
                      <button
                        onClick={() => handleOpenAssignModal(item)}
                        className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm hover:scale-105 transition cursor-pointer"
                      >
                        <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Assign to Tenant</span>
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ASSIGN PAYMENT MODAL */}
      <AnimatePresence>
        {selectedPayment && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 border border-slate-200"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                    <UserCheck className="w-5 h-5 text-emerald-600" /> Assign Payment to Tenant
                  </h3>
                  <p className="text-xs text-slate-500">
                    Match this received transaction to a registered tenant and settle their invoice.
                  </p>
                </div>
                <button
                  onClick={() => setSelectedPayment(null)}
                  className="text-slate-400 hover:text-slate-600 text-lg font-bold"
                >
                  ✕
                </button>
              </div>

              {/* Transaction Summary Card */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Reference:</span>
                  <span className="font-mono font-bold text-slate-900">{selectedPayment.referenceCode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Amount:</span>
                  <span className="font-bold text-emerald-600 text-sm">{formatKSH(selectedPayment.amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Sender Name / Phone:</span>
                  <span className="font-medium text-slate-800">
                    {selectedPayment.senderName || 'N/A'} {selectedPayment.senderPhone ? `(${selectedPayment.senderPhone})` : ''}
                  </span>
                </div>
                {selectedPayment.rawNarration && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Narration:</span>
                    <span className="font-medium text-slate-700 font-mono text-[11px]">{selectedPayment.rawNarration}</span>
                  </div>
                )}
              </div>

              {assignSuccessMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{assignSuccessMsg}</span>
                </div>
              )}

              {/* Selection Form */}
              <div className="space-y-4 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Select Tenant</label>
                  <select
                    value={assignTenantId}
                    onChange={(e) => handleTenantChange(e.target.value)}
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-medium text-slate-900 focus:border-emerald-500 focus:outline-none"
                  >
                    {tenants.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.fullName} — Unit {t.unitNumber || 'N/A'} ({t.propertyName || 'Property'}) [Rent: {formatKSH(t.monthlyRent || 0)}]
                      </option>
                    ))}
                  </select>
                </div>

                {selectedTenantObj && (
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Target Invoice to Settle</label>
                    {tenantUnpaidInvoices.length === 0 ? (
                      <div className="p-3 bg-blue-50 border border-blue-200 text-blue-900 rounded-xl text-xs">
                        Tenant has no unpaid invoices. This payment will be credited to their account ledger and reflected in their statement.
                      </div>
                    ) : (
                      <select
                        value={assignInvoiceId}
                        onChange={(e) => setAssignInvoiceId(e.target.value)}
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-medium text-slate-900 focus:border-emerald-500 focus:outline-none"
                      >
                        {tenantUnpaidInvoices.map((inv) => (
                          <option key={inv.id} value={inv.id}>
                            Invoice #{inv.invoiceNumber} ({inv.periodMonth || 'Current Period'}) — Outstanding:{' '}
                            {formatKSH(inv.totalAmount - (inv.amountPaid || 0))}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Reconciliation Audit Notes (Optional)</label>
                  <input
                    type="text"
                    value={assignNotes}
                    onChange={(e) => setAssignNotes(e.target.value)}
                    placeholder="e.g. Verified payment sent by tenant's spouse Peter"
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={() => setSelectedPayment(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmAssign}
                  disabled={isAssigning || !assignTenantId}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {isAssigning ? 'Processing Reconciliation...' : 'Confirm Assignment & Settle'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* LOG UNACCOUNTED PAYMENT SMS MODAL */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 border border-slate-200"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                    <Plus className="w-5 h-5 text-amber-600" /> Log Received Payment SMS
                  </h3>
                  <p className="text-xs text-slate-500">
                    Received an M-Pesa or Bank alert on your phone with an unrecognized sender? Log it here for automatic matching.
                  </p>
                </div>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="text-slate-400 hover:text-slate-600 text-lg font-bold"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateManualUnaccounted} className="space-y-3.5 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Channel Source</label>
                    <select
                      value={newSource}
                      onChange={(e) => setNewSource(e.target.value as any)}
                      className="w-full p-2 bg-white border border-slate-200 rounded-xl"
                    >
                      <option value="M-Pesa Till">M-Pesa Till (Buy Goods)</option>
                      <option value="M-Pesa Paybill">M-Pesa Paybill</option>
                      <option value="Bank Transfer">Bank Transfer (EFT / Pesalink)</option>
                      <option value="Direct Deposit">Bank Counter Cash / Deposit</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Receipt Code / Ref *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. SAB9812401"
                      value={newRefCode}
                      onChange={(e) => setNewRefCode(e.target.value.toUpperCase())}
                      className="w-full p-2 bg-white border border-slate-200 rounded-xl font-mono uppercase"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Amount (KSh) *</label>
                    <input
                      type="number"
                      required
                      placeholder="e.g. 65000"
                      value={newAmount}
                      onChange={(e) => setNewAmount(e.target.value)}
                      className="w-full p-2 bg-white border border-slate-200 rounded-xl font-bold"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Sender Phone</label>
                    <input
                      type="text"
                      placeholder="e.g. 0722 123 456"
                      value={newSenderPhone}
                      onChange={(e) => setNewSenderPhone(e.target.value)}
                      className="w-full p-2 bg-white border border-slate-200 rounded-xl"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Sender Registered Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Peter Kamau"
                      value={newSenderName}
                      onChange={(e) => setNewSenderName(e.target.value)}
                      className="w-full p-2 bg-white border border-slate-200 rounded-xl"
                    />
                  </div>

                  {newSource.includes('Bank') && (
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Bank Name</label>
                      <select
                        value={newBankName}
                        onChange={(e) => setNewBankName(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-200 rounded-xl"
                      >
                        <option value="Equity Bank">Equity Bank</option>
                        <option value="KCB Bank">KCB Bank</option>
                        <option value="Co-operative Bank">Co-operative Bank</option>
                        <option value="NCBA Bank">NCBA Bank</option>
                        <option value="Stanbic Bank">Stanbic Bank</option>
                        <option value="ABSA Bank">ABSA Bank</option>
                      </select>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Full SMS / Narration (Optional)</label>
                  <textarea
                    rows={2}
                    placeholder="Paste the raw SMS or transaction description here..."
                    value={newNarration}
                    onChange={(e) => setNewNarration(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-200 rounded-xl font-mono text-[11px]"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isAdding}
                    className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    {isAdding ? 'Saving...' : 'Add to Queue'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
