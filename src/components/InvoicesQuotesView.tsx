import React, { useState } from 'react';
import { Invoice, Quote, Tenant, Unit, Landlord, Property } from '../types';
import { formatKSH } from '../lib/formatters';
import {
  FileText,
  Tag,
  Plus,
  Send,
  Eye,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Printer,
  Download,
  RefreshCw,
  X,
  Mail,
  Users,
  Search,
  User,
  Building,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { generateAiQuote } from '../lib/api';

interface InvoicesQuotesViewProps {
  invoices: Invoice[];
  quotes: Quote[];
  tenants: Tenant[];
  units: Unit[];
  properties?: Property[];
  landlords?: Landlord[];
  signedInLandlord?: Landlord | null;
  onCreateInvoice: (data: any) => void;
  onCreateQuote: (data: any) => void;
  showCreateInvoiceModal: boolean;
  setShowCreateInvoiceModal: (val: boolean) => void;
  showCreateQuoteModal: boolean;
  setShowCreateQuoteModal: (val: boolean) => void;
}

export const InvoicesQuotesView: React.FC<InvoicesQuotesViewProps> = ({
  invoices,
  quotes,
  tenants,
  units,
  properties = [],
  landlords = [],
  signedInLandlord,
  onCreateInvoice,
  onCreateQuote,
  showCreateInvoiceModal,
  setShowCreateInvoiceModal,
  showCreateQuoteModal,
  setShowCreateQuoteModal,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'grouped' | 'invoices' | 'quotes'>('grouped');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDocument, setSelectedDocument] = useState<{ type: 'invoice' | 'quote'; data: any } | null>(null);

  // Grouping by single tenant logic
  const tenantMap = new Map<string, { id: string; name: string; email: string; phone: string; unitNumber: string; propertyName: string }>();

  tenants.forEach((t) => {
    tenantMap.set(t.fullName.toLowerCase(), {
      id: t.id,
      name: t.fullName,
      email: t.email,
      phone: t.phone || '',
      unitNumber: t.unitNumber,
      propertyName: t.propertyName
    });
  });

  invoices.forEach((inv) => {
    const key = inv.tenantName.toLowerCase();
    if (!tenantMap.has(key)) {
      tenantMap.set(key, {
        id: inv.tenantId || `tenant-${key}`,
        name: inv.tenantName,
        email: inv.tenantEmail || '',
        phone: '',
        unitNumber: inv.unitNumber || '',
        propertyName: inv.propertyName || ''
      });
    }
  });

  quotes.forEach((qte) => {
    const key = qte.tenantName.toLowerCase();
    if (!tenantMap.has(key)) {
      tenantMap.set(key, {
        id: `tenant-${key}`,
        name: qte.tenantName,
        email: qte.tenantEmail || '',
        phone: qte.tenantPhone || '',
        unitNumber: qte.unitNumber || '',
        propertyName: qte.propertyName || ''
      });
    }
  });

  const tenantGroups = Array.from(tenantMap.values()).filter((t) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return t.name.toLowerCase().includes(q) || t.unitNumber.toLowerCase().includes(q) || t.email.toLowerCase().includes(q);
  });

  // New Invoice State
  const [invTenantId, setInvTenantId] = useState(tenants[0]?.id || '');
  const [invPeriod, setInvPeriod] = useState('August 2026');
  const [invWaterFee, setInvWaterFee] = useState('25');
  const [invTrashFee, setInvTrashFee] = useState('15');
  const [invMaintFee, setInvMaintFee] = useState('0');
  const [invDiscount, setInvDiscount] = useState('0');
  const [invNotes, setInvNotes] = useState('');

  // New Quote State
  const [qteTenantName, setQteTenantName] = useState('');
  const [qteTenantEmail, setQteTenantEmail] = useState('');
  const [qteTenantPhone, setQteTenantPhone] = useState('');
  const [qteUnitId, setQteUnitId] = useState(units[0]?.id || '');
  const [qteRent, setQteRent] = useState('');
  const [qteDeposit, setQteDeposit] = useState('');
  const [qteLeaseMonths, setQteLeaseMonths] = useState('12');
  const [qteNotes, setQteNotes] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);

  const handleGenerateInvoiceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreateInvoice({
      tenantId: invTenantId,
      periodMonth: invPeriod,
      waterFee: parseFloat(invWaterFee) || 0,
      trashFee: parseFloat(invTrashFee) || 0,
      maintenanceFee: parseFloat(invMaintFee) || 0,
      discount: parseFloat(invDiscount) || 0,
      notes: invNotes
    });
    setShowCreateInvoiceModal(false);
  };

  const handleGenerateQuoteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreateQuote({
      tenantName: qteTenantName,
      tenantEmail: qteTenantEmail,
      tenantPhone: qteTenantPhone,
      unitId: qteUnitId,
      monthlyRentQuote: parseFloat(qteRent),
      depositQuote: parseFloat(qteDeposit),
      leaseTermMonths: parseInt(qteLeaseMonths),
      notes: qteNotes
    });
    setShowCreateQuoteModal(false);
  };

  const handleAiAutoQuote = async () => {
    setIsAiLoading(true);
    try {
      const selectedU = units.find((u) => u.id === qteUnitId) || units[0];
      const aiResult = await generateAiQuote({
        tenantName: qteTenantName || 'Applicant',
        tenantEmail: qteTenantEmail,
        unitId: qteUnitId,
        leaseTermMonths: parseInt(qteLeaseMonths),
        moveInDate: '2026-09-01'
      });

      if (aiResult.monthlyRentQuote) setQteRent(aiResult.monthlyRentQuote.toString());
      if (aiResult.depositQuote) setQteDeposit(aiResult.depositQuote.toString());
      if (aiResult.notes) setQteNotes(aiResult.notes);
    } catch (err) {
      console.error(err);
    } finally {
      setIsAiLoading(false);
    }
  };

  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  const handleDownloadPdf = async () => {
    if (!selectedDocument) return;
    const element = document.getElementById('printable-document');
    if (!element) return;

    setIsDownloadingPdf(true);
    try {
      // Dynamic import of html2pdf.js
      const html2pdfModule = await import('html2pdf.js');
      const html2pdf = html2pdfModule.default || html2pdfModule;

      const docNumber = selectedDocument.data.invoiceNumber || selectedDocument.data.quoteNumber || 'DOC';
      const docType = selectedDocument.type === 'invoice' ? 'Invoice' : 'Rental-Quote';
      const filename = `${docType}-${docNumber}.pdf`;

      const opt = {
        margin: [8, 8, 8, 8],
        filename: filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      await html2pdf().set(opt).from(element).save();
    } catch (err) {
      console.error('PDF generation error, falling back to window.print:', err);
      window.print();
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handlePrintDocument = () => {
    window.print();
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-6 h-6 text-blue-600" /> Invoices & Rental Quotes
          </h2>
          <p className="text-xs sm:text-sm text-slate-500">
            Generate monthly rental statements, send formal lease quotes, and automatically dispatch PDF notices to tenant emails.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreateQuoteModal(true)}
            className="px-3.5 py-2 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium shadow-sm transition flex items-center gap-1.5"
          >
            <Tag className="w-4 h-4 text-blue-600" /> Create Rental Quote
          </button>
          <button
            onClick={() => setShowCreateInvoiceModal(true)}
            className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Issue Monthly Invoice
          </button>
        </div>
      </div>

      {/* Sub Tabs Toggle */}
      <div className="flex border-b border-slate-200 text-xs font-semibold overflow-x-auto">
        <button
          onClick={() => setActiveSubTab('grouped')}
          className={`pb-3 px-4 border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
            activeSubTab === 'grouped'
              ? 'border-blue-600 text-blue-600 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users className="w-4 h-4" /> Single Tenant Statements ({tenantGroups.length})
        </button>
        <button
          onClick={() => setActiveSubTab('invoices')}
          className={`pb-3 px-4 border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
            activeSubTab === 'invoices'
              ? 'border-blue-600 text-blue-600 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileText className="w-4 h-4" /> All Monthly Invoices ({invoices.length})
        </button>
        <button
          onClick={() => setActiveSubTab('quotes')}
          className={`pb-3 px-4 border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
            activeSubTab === 'quotes'
              ? 'border-blue-600 text-blue-600 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Tag className="w-4 h-4" /> All Rental Quotes ({quotes.length})
        </button>
      </div>

      {/* SINGLE TENANT GROUPED TAB */}
      {activeSubTab === 'grouped' && (
        <div className="space-y-6">
          {/* Search Bar */}
          <div className="relative max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search statements by tenant name, unit number, or email..."
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 shadow-xs focus:outline-none focus:border-blue-500"
            />
          </div>

          {tenantGroups.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-2 text-slate-500 text-xs">
              <Users className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="font-bold text-slate-700">No tenants found matching your search.</p>
              <p>Try searching for a different name or unit number.</p>
            </div>
          ) : (
            tenantGroups.map((group) => {
              const groupInvoices = invoices.filter(
                (inv) =>
                  inv.tenantName.toLowerCase() === group.name.toLowerCase() ||
                  (inv.tenantId && inv.tenantId === group.id)
              );

              const groupQuotes = quotes.filter(
                (qte) =>
                  qte.tenantName.toLowerCase() === group.name.toLowerCase() ||
                  (qte.applicantEmail && qte.applicantEmail.toLowerCase() === group.email.toLowerCase())
              );

              const totalBilled = groupInvoices.reduce((sum, i) => sum + i.totalAmount, 0);
              const totalPaid = groupInvoices.reduce(
                (sum, i) => sum + (i.status === 'Paid' ? i.totalAmount : i.amountPaid || 0),
                0
              );
              const balanceDue = totalBilled - totalPaid;

              return (
                <div
                  key={group.id}
                  className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:border-blue-300 transition"
                >
                  {/* Tenant Card Header */}
                  <div className="bg-slate-50 border-b border-slate-200 p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-start sm:items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 font-extrabold flex items-center justify-center shrink-0 text-sm border border-blue-200">
                        {group.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-extrabold text-slate-900 text-base">{group.name}</h3>
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                            Unit {group.unitNumber || 'N/A'}
                          </span>
                          {group.propertyName && (
                            <span className="text-xs text-slate-500 font-medium flex items-center gap-1">
                              <Building className="w-3 h-3 text-slate-400" /> {group.propertyName}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {group.email} {group.phone ? `• ${group.phone}` : ''}
                        </p>
                      </div>
                    </div>

                    {/* Financial Summary Badges */}
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <div className="bg-white border border-slate-200 rounded-xl p-2.5 text-center min-w-[100px] shadow-2xs">
                        <p className="text-[10px] text-slate-500 font-medium">Total Billed</p>
                        <p className="font-extrabold text-slate-900">{formatKSH(totalBilled)}</p>
                      </div>
                      <div className="bg-white border border-emerald-200 rounded-xl p-2.5 text-center min-w-[100px] shadow-2xs">
                        <p className="text-[10px] text-emerald-600 font-medium">Total Paid</p>
                        <p className="font-extrabold text-emerald-700">{formatKSH(totalPaid)}</p>
                      </div>
                      <div className={`bg-white border rounded-xl p-2.5 text-center min-w-[100px] shadow-2xs ${balanceDue > 0 ? 'border-amber-300 bg-amber-50/50' : 'border-slate-200'}`}>
                        <p className="text-[10px] text-slate-500 font-medium">Balance Due</p>
                        <p className={`font-extrabold ${balanceDue > 0 ? 'text-amber-700' : 'text-slate-700'}`}>
                          {formatKSH(balanceDue)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Tenant's Invoices & Quotes Content */}
                  <div className="p-4 sm:p-5 space-y-5">
                    {/* Invoices Section */}
                    <div>
                      <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
                        <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-2">
                          <FileText className="w-4 h-4 text-blue-600" /> Monthly Invoices ({groupInvoices.length})
                        </h4>
                        <button
                          onClick={() => {
                            setInvTenantId(group.id);
                            setShowCreateInvoiceModal(true);
                          }}
                          className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" /> Issue New Invoice
                        </button>
                      </div>

                      {groupInvoices.length === 0 ? (
                        <p className="text-xs text-slate-400 italic py-2">No invoices recorded for this tenant.</p>
                      ) : (
                        <div className="space-y-2.5">
                          {groupInvoices.map((inv) => {
                            const isPaid = inv.status === 'Paid';
                            return (
                              <div
                                key={inv.id}
                                className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                              >
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono font-bold text-blue-700">{inv.invoiceNumber}</span>
                                    <span
                                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase flex items-center gap-1 ${
                                        isPaid
                                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                          : 'bg-amber-100 text-amber-800 border border-amber-200'
                                      }`}
                                    >
                                      {isPaid ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                                      {inv.status}
                                    </span>
                                    {inv.emailedToTenant && (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-blue-50 text-blue-700 border border-blue-200 font-semibold flex items-center gap-1">
                                        <Mail className="w-3 h-3" /> Emailed
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-slate-500 mt-1">
                                    Period: {inv.periodMonth} | Issued: {inv.issueDate} | Due: {inv.dueDate}
                                  </p>
                                </div>

                                <div className="flex items-center justify-between sm:justify-end gap-3">
                                  <div className="text-left sm:text-right">
                                    <span className="text-[10px] text-slate-500 block">Total Amount</span>
                                    <span className="font-extrabold text-slate-900 text-sm">
                                      {formatKSH(inv.totalAmount)}
                                    </span>
                                  </div>
                                  <button
                                    onClick={() => setSelectedDocument({ type: 'invoice', data: inv })}
                                    className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 text-xs font-semibold transition flex items-center gap-1 shadow-2xs"
                                  >
                                    <Eye className="w-3.5 h-3.5" /> View Statement
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Quotes Section */}
                    <div>
                      <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
                        <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-2">
                          <Tag className="w-4 h-4 text-sky-600" /> Rental Quotes ({groupQuotes.length})
                        </h4>
                        <button
                          onClick={() => {
                            setQteTenantName(group.name);
                            setQteTenantEmail(group.email);
                            setQteTenantPhone(group.phone);
                            setShowCreateQuoteModal(true);
                          }}
                          className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" /> Generate Quote
                        </button>
                      </div>

                      {groupQuotes.length === 0 ? (
                        <p className="text-xs text-slate-400 italic py-2">No quotes generated for this tenant.</p>
                      ) : (
                        <div className="space-y-2.5">
                          {groupQuotes.map((qte) => (
                            <div
                              key={qte.id}
                              className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                            >
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-bold text-blue-700">{qte.quoteNumber}</span>
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-100 text-blue-800 border border-blue-200">
                                    {qte.status}
                                  </span>
                                  {qte.emailedToTenant && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-blue-50 text-blue-700 border border-blue-200 font-semibold flex items-center gap-1">
                                      <Mail className="w-3 h-3" /> Emailed
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-500 mt-1">
                                  Term: {qte.leaseTermMonths} Months | Valid Until: {qte.validUntil}
                                </p>
                              </div>

                              <div className="flex items-center justify-between sm:justify-end gap-3">
                                <div className="text-left sm:text-right">
                                  <span className="text-[10px] text-slate-500 block">Move-in Cost</span>
                                  <span className="font-extrabold text-emerald-600 text-sm">
                                    {formatKSH(qte.totalMoveInCost)}
                                  </span>
                                </div>
                                <button
                                  onClick={() => setSelectedDocument({ type: 'quote', data: qte })}
                                  className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 text-xs font-semibold transition flex items-center gap-1 shadow-2xs"
                                >
                                  <Eye className="w-3.5 h-3.5" /> View Quote
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* INVOICES LIST TAB */}
      {activeSubTab === 'invoices' && (
        <div className="space-y-3">
          {invoices.map((inv) => {
            const isPaid = inv.status === 'Paid';
            return (
              <div
                key={inv.id}
                className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-blue-500 transition shadow-sm text-slate-900"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-blue-700 text-sm">{inv.invoiceNumber}</span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase flex items-center gap-1 ${
                        isPaid
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-amber-100 text-amber-800 border border-amber-200'
                      }`}
                    >
                      {isPaid ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                      {inv.status}
                    </span>
                    {inv.emailedToTenant && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1 font-semibold">
                        <Mail className="w-3 h-3" /> Emailed
                      </span>
                    )}
                  </div>

                  {(() => {
                    const matchingTenant = tenants.find((t) => t.id === inv.tenantId || t.fullName.toLowerCase() === inv.tenantName.toLowerCase());
                    const matchingUnit = units.find((u) => u.id === inv.unitId || (matchingTenant && u.id === matchingTenant.unitId));
                    const uNum = inv.unitNumber && inv.unitNumber !== 'Unit' ? inv.unitNumber : (matchingTenant?.unitNumber || matchingUnit?.unitNumber || 'Unit');
                    const pName = inv.propertyName && inv.propertyName !== 'Property' ? inv.propertyName : (matchingTenant?.propertyName || matchingUnit?.propertyName || 'Property');
                    return (
                      <p className="text-xs font-bold text-slate-900">
                        {inv.tenantName} &bull; Unit {uNum} ({pName})
                      </p>
                    );
                  })()}
                  <p className="text-[11px] text-slate-500">
                    Period: {inv.periodMonth} | Issued: {inv.issueDate} | Due Date: {inv.dueDate}
                  </p>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-0 border-slate-200 pt-2 sm:pt-0">
                  <div className="text-left sm:text-right">
                    <p className="text-[10px] text-slate-500 font-medium">Total Invoice Amount</p>
                    <p className="text-lg font-extrabold text-slate-900">{formatKSH(inv.totalAmount)}</p>
                  </div>

                  <button
                    onClick={() => setSelectedDocument({ type: 'invoice', data: inv })}
                    className="px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition flex items-center gap-1.5"
                  >
                    <Eye className="w-3.5 h-3.5" /> View Statement
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* QUOTES LIST TAB */}
      {activeSubTab === 'quotes' && (
        <div className="space-y-3">
          {quotes.map((qte) => (
            <div
              key={qte.id}
              className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-blue-500 transition shadow-sm text-slate-900"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-blue-700 text-sm">{qte.quoteNumber}</span>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-100 text-blue-800 border border-blue-200">
                    {qte.status}
                  </span>
                  {qte.emailedToTenant && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1 font-semibold">
                      <Mail className="w-3 h-3" /> Emailed
                    </span>
                  )}
                </div>

                <p className="text-xs font-bold text-slate-900">
                  Applicant: {qte.tenantName} ({qte.tenantEmail})
                </p>
                {(() => {
                  const matchingTenant = tenants.find((t) => t.fullName.toLowerCase() === qte.tenantName.toLowerCase() || t.email.toLowerCase() === qte.tenantEmail.toLowerCase());
                  const matchingUnit = units.find((u) => u.id === qte.unitId || (matchingTenant && u.id === matchingTenant.unitId));
                  const uNum = qte.unitNumber && qte.unitNumber !== 'Unit' ? qte.unitNumber : (matchingTenant?.unitNumber || matchingUnit?.unitNumber || 'Unit');
                  const pName = qte.propertyName && qte.propertyName !== 'Property' ? qte.propertyName : (matchingTenant?.propertyName || matchingUnit?.propertyName || 'Property');
                  return (
                    <p className="text-[11px] text-slate-500">
                      Property: {pName} - Unit {uNum} | Term: {qte.leaseTermMonths} Months | Valid Until: {qte.validUntil}
                    </p>
                  );
                })()}
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-0 border-slate-200 pt-2 sm:pt-0">
                <div className="text-left sm:text-right">
                  <p className="text-[10px] text-slate-500 font-medium">Quoted Move-in Cost</p>
                  <p className="text-lg font-extrabold text-emerald-600">{formatKSH(qte.totalMoveInCost)}</p>
                  <p className="text-[10px] text-slate-500">{formatKSH(qte.monthlyRentQuote)}/mo rent</p>
                </div>

                <button
                  onClick={() => setSelectedDocument({ type: 'quote', data: qte })}
                  className="px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition flex items-center gap-1.5"
                >
                  <Eye className="w-3.5 h-3.5" /> View Quote
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CREATE INVOICE MODAL */}
      {showCreateInvoiceModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-5 space-y-4 text-xs shadow-xl text-slate-900">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" /> Issue Monthly Invoice to Tenant
              </h3>
              <button onClick={() => setShowCreateInvoiceModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleGenerateInvoiceSubmit} className="space-y-3">
              <div>
                <label className="block text-slate-700 font-medium mb-1">Select Tenant</label>
                <select
                  value={invTenantId}
                  onChange={(e) => setInvTenantId(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-blue-500 shadow-sm"
                >
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.fullName} - Unit {t.unitNumber} ({formatKSH(t.monthlyRent)}/mo)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Invoice Month / Period</label>
                <input
                  type="text"
                  required
                  value={invPeriod}
                  onChange={(e) => setInvPeriod(e.target.value)}
                  placeholder="e.g. September 2026"
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 shadow-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Water Charge (KSh)</label>
                  <input
                    type="number"
                    value={invWaterFee}
                    onChange={(e) => setInvWaterFee(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Trash/Sanitation (KSh)</label>
                  <input
                    type="number"
                    value={invTrashFee}
                    onChange={(e) => setInvTrashFee(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 shadow-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Maintenance Fee (KSh)</label>
                  <input
                    type="number"
                    value={invMaintFee}
                    onChange={(e) => setInvMaintFee(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Discount (KSh)</label>
                  <input
                    type="number"
                    value={invDiscount}
                    onChange={(e) => setInvDiscount(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 shadow-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Invoice Notes / Payment Instructions</label>
                <textarea
                  value={invNotes}
                  onChange={(e) => setInvNotes(e.target.value)}
                  placeholder="e.g. Please send payment to M-Pesa Till 781920 or Bank A/C by 5th."
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 h-16 shadow-sm"
                />
              </div>

              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs flex items-center justify-between text-slate-700">
                <span>Auto-Dispatch:</span>
                <span className="text-emerald-700 font-bold flex items-center gap-1">
                  <Send className="w-3.5 h-3.5 text-emerald-600" /> Dispatches Statement to Tenant's Email
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateInvoiceModal(false)}
                  className="px-4 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 font-medium hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition shadow-sm"
                >
                  Issue & Dispatch Invoice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE QUOTE MODAL */}
      {showCreateQuoteModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-5 space-y-4 text-xs shadow-xl text-slate-900">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Tag className="w-5 h-5 text-blue-600" /> Create Rental Quote Offer
              </h3>
              <button onClick={() => setShowCreateQuoteModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleGenerateQuoteSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Applicant Full Name</label>
                  <input
                    type="text"
                    required
                    value={qteTenantName}
                    onChange={(e) => setQteTenantName(e.target.value)}
                    placeholder="e.g. Mary Atieno"
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Personal Email</label>
                  <input
                    type="email"
                    required
                    value={qteTenantEmail}
                    onChange={(e) => setQteTenantEmail(e.target.value)}
                    placeholder="mary@example.com"
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 shadow-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={qteTenantPhone}
                    onChange={(e) => setQteTenantPhone(e.target.value)}
                    placeholder="+254 7..."
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Select Apartment Unit</label>
                  <select
                    value={qteUnitId}
                    onChange={(e) => setQteUnitId(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 shadow-sm"
                  >
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        Unit {u.unitNumber} - {formatKSH(u.monthlyRent)}/mo ({u.propertyName})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* AI Auto Pricing Trigger */}
              <div className="bg-blue-50 p-3 rounded-lg border border-blue-200 flex items-center justify-between">
                <div>
                  <p className="font-bold text-blue-900 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-blue-600" /> Gemini AI Pricing Copilot
                  </p>
                  <p className="text-[10px] text-slate-600">Auto-calculate optimal rent & deposit rate</p>
                </div>
                <button
                  type="button"
                  onClick={handleAiAutoQuote}
                  disabled={isAiLoading}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-[11px] transition shadow-sm"
                >
                  {isAiLoading ? 'Calculating...' : 'Run AI Estimator'}
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Quoted Rent (KSh)</label>
                  <input
                    type="number"
                    required
                    value={qteRent}
                    onChange={(e) => setQteRent(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Security Deposit (KSh)</label>
                  <input
                    type="number"
                    required
                    value={qteDeposit}
                    onChange={(e) => setQteDeposit(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Lease Months</label>
                  <input
                    type="number"
                    value={qteLeaseMonths}
                    onChange={(e) => setQteLeaseMonths(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 shadow-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Quotation Special Terms & Perks</label>
                <textarea
                  value={qteNotes}
                  onChange={(e) => setQteNotes(e.target.value)}
                  placeholder="e.g. Includes 1 free parking spot and high speed fiber installation."
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 h-16 shadow-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateQuoteModal(false)}
                  className="px-4 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 font-medium hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition shadow-sm"
                >
                  Send Rental Quote Offer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PRINTABLE DOCUMENT PREVIEW MODAL */}
      {selectedDocument && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 p-2 sm:p-4 flex items-center justify-center overflow-y-auto">
          <div className="bg-white text-slate-900 rounded-2xl max-w-2xl w-full my-auto shadow-2xl relative font-sans text-xs max-h-[92vh] flex flex-col overflow-hidden border border-slate-200">
            {/* Modal Control Header (Fixed at top of modal, never overlaps document body) */}
            <div className="bg-slate-900 text-white p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3 shrink-0 z-30 border-b border-slate-800">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-bold text-white text-sm sm:text-base truncate">Official Document Preview</span>
                <span className="bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase shrink-0">
                  {selectedDocument.type}
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleDownloadPdf}
                  disabled={isDownloadingPdf}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-extrabold flex items-center gap-1.5 text-xs shadow-md transition disabled:opacity-50 cursor-pointer"
                  title="Download clean PDF document to your device"
                >
                  {isDownloadingPdf ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Generating PDF...
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" /> Download PDF
                    </>
                  )}
                </button>

                <button
                  onClick={handlePrintDocument}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold flex items-center gap-1.5 text-xs transition cursor-pointer"
                  title="Print or save using browser print dialog"
                >
                  <Printer className="w-3.5 h-3.5" /> Print
                </button>

                <button
                  onClick={() => setSelectedDocument(null)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                  title="Close Preview"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Scrollable Document Container */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-slate-50/50">
              <div id="printable-document" className="space-y-5 p-4 sm:p-6 bg-white border border-slate-200 rounded-xl shadow-sm">
                {(() => {
                  const docTenant = tenants.find(
                    (t) => t.fullName?.toLowerCase() === selectedDocument.data.tenantName?.toLowerCase() || t.id === selectedDocument.data.tenantId
                  );
                  const docUnit = units.find(
                    (u) => u.id === (docTenant?.unitId || selectedDocument.data.unitId) || u.unitNumber === selectedDocument.data.unitNumber
                  );
                  const docPropObj = properties.find(
                    (p) => p.id === (docUnit?.propertyId || docTenant?.propertyId) || p.name === selectedDocument.data.propertyName
                  );
                  const docPropName = docPropObj?.name || docTenant?.propertyName || selectedDocument.data.propertyName || 'Property Estate';

                  const docLandlord = signedInLandlord || landlords.find(
                    (l) => l.id === (selectedDocument?.data?.landlordId || docPropObj?.landlordId || docTenant?.landlordId)
                  ) || landlords[0];

                  const landlordCompanyName = docLandlord?.companyName || docLandlord?.name || 'Estate Management';
                  const landlordEmail = docLandlord?.email || 'landlord@estatemaster.com';
                  const landlordPhone = docLandlord?.phone || docLandlord?.mpesaPhoneNumber || '+254 700 000 000';

                  const propertyStreetAddress = docPropObj?.address
                    ? `${docPropObj.address}${docPropObj.city ? `, ${docPropObj.city}` : ''}`
                    : docPropObj?.location
                    ? `${docPropObj.location}${docPropObj.city ? `, ${docPropObj.city}` : ''}`
                    : `${docPropName}, Nairobi, Kenya`;

                  return (
                    <>
                      {/* Landlord Company / Estate Header */}
                      <div className="flex flex-wrap justify-between items-start border-b pb-4 border-slate-200 gap-2">
                        <div>
                          <h1 className="text-lg sm:text-xl font-black text-indigo-950 uppercase tracking-wide">
                            {landlordCompanyName}
                          </h1>
                          <p className="text-slate-600 font-medium text-[11px]">{propertyStreetAddress}</p>
                          <p className="text-slate-500 text-[11px]">Email: <span className="font-semibold text-slate-800">{landlordEmail}</span> &bull; Tel: {landlordPhone}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-xl sm:text-2xl font-black text-slate-800 tracking-wider">
                            {selectedDocument.type === 'invoice' ? 'INVOICE' : 'RENTAL QUOTE'}
                          </span>
                          <p className="font-mono text-indigo-600 font-bold mt-1">
                            #{selectedDocument.data.invoiceNumber || selectedDocument.data.quoteNumber}
                          </p>
                        </div>
                      </div>

                      {/* Recipient & Property Street Address Info */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs">
                        <div className="space-y-1">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tenant & Occupied Premises</p>
                          <p className="font-bold text-slate-900 text-sm">{selectedDocument.data.tenantName || docTenant?.fullName || 'Tenant'}</p>
                          <p className="text-slate-600 font-medium">{selectedDocument.data.tenantEmail || docTenant?.email || 'tenant@example.com'}</p>
                          <div className="pt-1 space-y-0.5 text-slate-700">
                            <p><strong className="text-slate-900">Building / Property:</strong> {docPropName}</p>
                            <p><strong className="text-slate-900">Unit Occupied:</strong> Unit {selectedDocument.data.unitNumber || docTenant?.unitNumber || 'N/A'}</p>
                            <p><strong className="text-slate-900">Street Address:</strong> {propertyStreetAddress}</p>
                          </div>
                        </div>

                        <div className="text-left sm:text-right space-y-1 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-200">
                          <div>
                            <span className="text-slate-400">Issue Date: </span>
                            <span className="font-semibold text-slate-800">
                              {selectedDocument.data.issueDate || selectedDocument.data.createdAt?.split('T')[0] || '2026-08-01'}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400">Due / Valid Until: </span>
                            <span className="font-semibold text-slate-800">
                              {selectedDocument.data.dueDate || selectedDocument.data.validUntil || '2026-08-10'}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400">Status: </span>
                            <span className="font-extrabold uppercase text-indigo-600">{selectedDocument.data.status}</span>
                          </div>
                        </div>
                      </div>
                    </>
                  );
                })()}

                {/* Line Items Table */}
                {selectedDocument.type === 'invoice' ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[320px]">
                      <thead>
                        <tr className="border-b border-slate-300 text-slate-500 text-[11px] uppercase">
                          <th className="py-2">Description</th>
                          <th className="py-2 text-right">Amount (KSh)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-slate-700">
                        <tr>
                          <td className="py-2.5 font-medium">Monthly Base Rent ({selectedDocument.data.periodMonth})</td>
                          <td className="py-2.5 text-right font-mono">{formatKSH(selectedDocument.data.rentAmount)}</td>
                        </tr>
                        {selectedDocument.data.waterFee > 0 && (
                          <tr>
                            <td className="py-2">Water & Drainage Utility</td>
                            <td className="py-2 text-right font-mono">{formatKSH(selectedDocument.data.waterFee)}</td>
                          </tr>
                        )}
                        {selectedDocument.data.trashFee > 0 && (
                          <tr>
                            <td className="py-2">Trash & Waste Collection</td>
                            <td className="py-2 text-right font-mono">{formatKSH(selectedDocument.data.trashFee)}</td>
                          </tr>
                        )}
                        {selectedDocument.data.maintenanceFee > 0 && (
                          <tr>
                            <td className="py-2">Service Charge / Maintenance</td>
                            <td className="py-2 text-right font-mono">{formatKSH(selectedDocument.data.maintenanceFee)}</td>
                          </tr>
                        )}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-800 font-bold text-slate-900 text-sm">
                          <td className="py-3">TOTAL AMOUNT DUE</td>
                          <td className="py-3 text-right font-mono text-indigo-600">{formatKSH(selectedDocument.data.totalAmount)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[320px]">
                      <thead>
                        <tr className="border-b border-slate-300 text-slate-500 text-[11px] uppercase">
                          <th className="py-2">Quoted Item</th>
                          <th className="py-2 text-right">Amount (KSh)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-slate-700">
                        <tr>
                          <td className="py-2.5 font-medium">Monthly Rent Rate ({selectedDocument.data.leaseTermMonths} Months Lease)</td>
                          <td className="py-2.5 text-right font-mono">{formatKSH(selectedDocument.data.monthlyRentQuote)}</td>
                        </tr>
                        <tr>
                          <td className="py-2">Security Deposit (Refundable)</td>
                          <td className="py-2 text-right font-mono">{formatKSH(selectedDocument.data.depositQuote)}</td>
                        </tr>
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-800 font-bold text-slate-900 text-sm">
                          <td className="py-3">ESTIMATED MOVE-IN TOTAL</td>
                          <td className="py-3 text-right font-mono text-emerald-600">{formatKSH(selectedDocument.data.totalMoveInCost)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}

                {/* Payment Instructions Note */}
                {(() => {
                  const docLandlord = signedInLandlord || landlords.find(l => l.id === selectedDocument?.data?.landlordId) || landlords[0];
                  const unitRef = selectedDocument.data.unitNumber ? `Unit ${selectedDocument.data.unitNumber}` : 'Unit A101';
                  
                  return (
                    <div className="bg-indigo-50/80 border border-indigo-100 rounded-xl p-3.5 text-xs text-indigo-950 space-y-2">
                      <p className="font-bold text-indigo-900 flex items-center gap-1.5 text-xs">
                        💳 Official Registered Rent & Utility Payment Channels:
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px] pt-1">
                        <div className="bg-white p-2.5 rounded-lg border border-indigo-200/70 space-y-1">
                          <p className="font-bold text-emerald-800 text-xs">📱 M-Pesa Mobile Payment:</p>
                          <p><span className="text-slate-500">Paybill Business No:</span> <strong className="font-mono text-slate-900">{docLandlord?.mpesaPaybill || '247247'}</strong></p>
                          <p><span className="text-slate-500">M-Pesa Account No:</span> <strong className="font-mono text-emerald-700">{unitRef}</strong></p>
                          {docLandlord?.mpesaTillNumber && (
                            <p><span className="text-slate-500">Buy Goods Till No:</span> <strong className="font-mono text-slate-900">{docLandlord.mpesaTillNumber}</strong></p>
                          )}
                        </div>
                        <div className="bg-white p-2.5 rounded-lg border border-indigo-200/70 space-y-1">
                          <p className="font-bold text-blue-800 text-xs">🏦 Bank Transfer Details:</p>
                          <p><span className="text-slate-500">Bank Name:</span> <strong>{docLandlord?.bankName || 'Equity Bank Kenya'}</strong></p>
                          <p><span className="text-slate-500">Account Name:</span> <strong>{docLandlord?.accountName || docLandlord?.companyName || 'EstateMaster Rent'}</strong></p>
                          <p><span className="text-slate-500">Account No:</span> <strong className="font-mono text-blue-700">{docLandlord?.accountNumber || '0110293847561'}</strong></p>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
