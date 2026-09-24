import React, { useState } from 'react';
import { MaintenanceRequest, Tenant, Unit, Property } from '../types';
import { Wrench, Sparkles, CheckCircle2, Clock, AlertOctagon, UserCheck, ShieldAlert, Check, DollarSign, Receipt, Filter } from 'lucide-react';

interface MaintenanceViewProps {
  maintenance: MaintenanceRequest[];
  tenants?: Tenant[];
  units?: Unit[];
  properties?: Property[];
  onUpdateStatus: (id: string, status: string, tech?: string, extra?: { cost?: number; isBilled?: boolean; billedToInvoiceId?: string }) => void;
  onCreateTicket?: (ticket: any) => void;
}

export const MaintenanceView: React.FC<MaintenanceViewProps> = ({
  maintenance,
  tenants = [],
  units = [],
  properties = [],
  onUpdateStatus,
}) => {
  const [activeTab, setActiveTab] = useState<'active' | 'completed'>('active');
  const [techAssignments, setTechAssignments] = useState<{ [id: string]: string }>({});
  
  // Resolving completion modal state
  const [completingTicket, setCompletingTicket] = useState<MaintenanceRequest | null>(null);
  const [completionCost, setCompletionCost] = useState<string>('');
  const [completionTech, setCompletionTech] = useState<string>('');
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const activeTickets = maintenance.filter((m) => m.status !== 'Completed');
  const completedTickets = maintenance.filter((m) => m.status === 'Completed');

  const parseAiCost = (aiCostStr?: string): number => {
    if (!aiCostStr) return 0;
    // Extract first numeric number from e.g. "KSh 1,500 - 2,500" or "KSh 2500"
    const cleaned = aiCostStr.replace(/,/g, '');
    const match = cleaned.match(/\d+/);
    return match ? parseInt(match[0], 10) : 0;
  };

  const handleInitiateStatusChange = (m: MaintenanceRequest, newStatus: string) => {
    const tech = techAssignments[m.id] || m.assignedTechnician || 'In-House Maintenance';
    if (newStatus === 'Completed') {
      const suggestedCost = m.cost !== undefined ? String(m.cost) : (parseAiCost(m.aiEstimatedCost) ? String(parseAiCost(m.aiEstimatedCost)) : '1500');
      setCompletingTicket(m);
      setCompletionCost(suggestedCost);
      setCompletionTech(tech);
    } else {
      onUpdateStatus(m.id, newStatus, tech);
      setStatusNotice(`Ticket status updated to ${newStatus}.`);
      setTimeout(() => setStatusNotice(null), 3000);
    }
  };

  const handleConfirmCompletion = () => {
    if (!completingTicket) return;
    const parsedCost = parseFloat(completionCost) || 0;
    const tech = completionTech.trim() || 'In-House Maintenance';

    onUpdateStatus(completingTicket.id, 'Completed', tech, {
      cost: parsedCost,
      isBilled: false,
    });

    setStatusNotice(
      `✅ Issue resolved and removed from active list! Cost of KSh ${parsedCost.toLocaleString()} queued to be billed on the tenant's next month-end invoice.`
    );
    setCompletingTicket(null);
    setCompletionCost('');
    setCompletionTech('');
    setTimeout(() => setStatusNotice(null), 5000);
  };

  const displayList = activeTab === 'active' ? activeTickets : completedTickets;

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Wrench className="w-6 h-6 text-rose-600" /> Maintenance Management & Billing
          </h2>
          <p className="text-xs sm:text-sm text-slate-500">
            Tenant issue tracking powered by Gemini AI triage. Resolved issues are removed from the active list and queued for month-end invoice billing.
          </p>
        </div>

        {/* Tab Toggle */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('active')}
            className={`px-3.5 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
              activeTab === 'active'
                ? 'bg-white text-slate-900 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-amber-500" /> Active Requests ({activeTickets.length})
          </button>
          <button
            onClick={() => setActiveTab('completed')}
            className={`px-3.5 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
              activeTab === 'completed'
                ? 'bg-white text-emerald-800 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Resolved & Billing Queue ({completedTickets.length})
          </button>
        </div>
      </div>

      {/* Status Notice Banner */}
      {statusNotice && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 p-3.5 rounded-xl text-xs font-medium flex items-center gap-2 animate-in fade-in">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{statusNotice}</span>
        </div>
      )}

      {/* Tickets List */}
      <div className="space-y-4">
        {displayList.length === 0 ? (
          <div className="bg-slate-50 border border-dashed border-slate-300 rounded-2xl p-8 text-center space-y-2">
            <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto shadow-xs border border-slate-200">
              {activeTab === 'active' ? (
                <CheckCircle2 className="w-6 h-6 text-emerald-500" />
              ) : (
                <Receipt className="w-6 h-6 text-blue-500" />
              )}
            </div>
            <h4 className="text-sm font-bold text-slate-800">
              {activeTab === 'active' ? 'All Clear! No Active Maintenance Requests' : 'No Resolved Tickets in Billing Queue'}
            </h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {activeTab === 'active'
                ? 'When tenants submit issues, they will appear here. Resolving an issue removes it and prepares it for monthly billing.'
                : 'Resolved maintenance issues will show up here along with their month-end invoice billing status.'}
            </p>
          </div>
        ) : (
          displayList.map((m, mIdx) => {
            // Dynamically resolve tenant, unit, and property
            const matchedTenant = tenants.find(
              (t) => (m.tenantId && t.id === m.tenantId) ||
                     (m.tenantEmail && t.email?.toLowerCase() === m.tenantEmail.toLowerCase()) ||
                     (m.tenantName && t.fullName?.toLowerCase() === m.tenantName.toLowerCase())
            );
            const matchedUnit = units.find((u) => u.id === (matchedTenant?.unitId || m.unitId));
            const matchedProp = properties.find((p) => p.id === (matchedUnit?.propertyId || matchedTenant?.propertyId || m.propertyId));

            const displayUnitNumber = matchedUnit?.unitNumber || matchedTenant?.unitNumber || m.unitNumber || 'Unit';
            const displayPropertyName = matchedProp?.name || matchedUnit?.propertyName || matchedTenant?.propertyName || m.propertyName || 'Property';
            const displayTenantName = matchedTenant?.fullName || m.tenantName || 'Resident';

            // Safe Date Formatting
            const rawDate = m.submittedAt;
            const isValidDate = rawDate && !isNaN(new Date(rawDate).getTime());
            const displayDate = isValidDate ? new Date(rawDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Recently Submitted';

            const isResolved = m.status === 'Completed';

            return (
              <div
                key={`maint-${m.id}-${mIdx}`}
                className={`bg-white border ${
                  isResolved ? 'border-emerald-200' : 'border-slate-200'
                } rounded-xl p-4 sm:p-5 space-y-4 hover:border-blue-500 transition shadow-sm text-slate-900`}
              >
                {/* Top Bar */}
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                        m.urgency === 'Emergency'
                          ? 'bg-rose-100 text-rose-800 border-rose-200'
                          : m.urgency === 'High'
                          ? 'bg-amber-100 text-amber-800 border-amber-200'
                          : 'bg-blue-100 text-blue-800 border-blue-200'
                      } flex items-center gap-1`}>
                        <ShieldAlert className="w-3 h-3" /> {m.urgency} Urgency
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-100 text-slate-700 border border-slate-200">
                        {m.category}
                      </span>
                      <span className="text-[11px] text-slate-600 font-mono font-bold bg-slate-50 px-2.5 py-0.5 rounded-md border border-slate-200">
                        Unit {displayUnitNumber} ({displayPropertyName})
                      </span>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/90 space-y-1.5 my-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                        <span className="text-blue-700 font-extrabold uppercase text-[10px] bg-blue-100 px-2 py-0.5 rounded border border-blue-200 shrink-0">
                          Issue:
                        </span>
                        <span>{m.title || `${m.category || 'Maintenance'} Request`}</span>
                      </div>
                      <div className="text-xs text-slate-700 leading-relaxed pt-1 border-t border-slate-200/60">
                        <strong className="text-slate-900 font-bold">Details: </strong>
                        <span>{m.description}</span>
                      </div>
                    </div>
                  </div>

                  {/* Status Controller */}
                  <div className="flex flex-col items-end gap-2">
                    <select
                      value={m.status}
                      onChange={(e) => handleInitiateStatusChange(m, e.target.value)}
                      className={`border rounded-lg px-3 py-1.5 text-xs font-bold shadow-sm focus:outline-none ${
                        isResolved
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                          : 'bg-white border-slate-300 text-slate-900 focus:border-blue-500'
                      }`}
                    >
                      <option value="Open">Status: Open</option>
                      <option value="In Progress">Status: In Progress</option>
                      <option value="Completed">Status: Completed & Queue Bill</option>
                    </select>

                    {/* Month-End Billing Badge for Completed Items */}
                    {isResolved && (
                      <div className="flex items-center gap-1">
                        {m.isBilled ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200 flex items-center gap-1">
                            <Receipt className="w-3 h-3" /> Billed in Invoice {m.billedToInvoiceId ? `#${m.billedToInvoiceId}` : ''}
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> Scheduled for Month-End Invoice
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* AI Triage Card */}
                {(m.aiTriageSummary || m.aiSuggestedDiy) && (
                  <div className="bg-blue-50/80 border border-blue-200 rounded-lg p-3.5 text-xs space-y-2">
                    <div className="flex items-center justify-between text-blue-900 font-bold">
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-blue-600" /> AI Maintenance Assessment
                      </span>
                      <span className="text-blue-700 font-mono text-[11px] font-extrabold">{m.aiEstimatedCost}</span>
                    </div>

                    <p className="text-slate-700 font-medium">{m.aiTriageSummary}</p>

                    {m.aiSuggestedDiy && (
                      <div className="bg-white p-2.5 rounded-lg text-[11px] text-slate-700 border border-blue-200 shadow-xs">
                        <strong className="text-blue-700">Tenant DIY Advice:</strong> {m.aiSuggestedDiy}
                      </div>
                    )}
                  </div>
                )}

                {/* Resolution & Billing Info Bar */}
                {isResolved && (
                  <div className="bg-emerald-50/80 border border-emerald-200 rounded-lg p-3 text-xs flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-emerald-600" />
                      <span className="text-emerald-900 font-semibold">Repair / Resolution Cost to Bill Tenant:</span>
                      <strong className="text-emerald-700 font-mono text-sm">
                        KSh {(m.cost !== undefined ? m.cost : (parseAiCost(m.aiEstimatedCost) || 0)).toLocaleString()}
                      </strong>
                    </div>
                    <span className="text-[11px] text-emerald-700">
                      {m.isBilled ? 'Added to tenant invoice' : 'Will be automatically charged on next monthly rent invoice'}
                    </span>
                  </div>
                )}

                {/* Bottom Contractor & Contact Bar */}
                <div className="flex flex-wrap items-center justify-between text-xs pt-2 border-t border-slate-200 gap-3">
                  <div className="text-slate-500">
                    Submitted by: <strong className="text-slate-800">{displayTenantName}</strong> &bull; <span className="font-semibold text-slate-700">{displayDate}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-emerald-600" />
                    <span className="text-slate-500 font-medium">Assigned Technician:</span>
                    <span className="font-bold text-emerald-800">
                      {m.assignedTechnician || 'In-House Maintenance'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Completion & Month-End Billing Modal */}
      {completingTicket && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-emerald-200 rounded-2xl max-w-md w-full p-6 space-y-4 text-xs shadow-2xl text-slate-900">
            <div className="flex items-center gap-3 border-b border-emerald-100 pb-3">
              <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-xl">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Complete & Queue for Billing</h3>
                <p className="text-xs text-slate-500">
                  Resolves issue, removes it from active list, and bills the tenant on their month-end invoice.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1">
              <div className="text-slate-800 font-bold">
                {completingTicket.title || `${completingTicket.category} Issue`}
              </div>
              <div className="text-[11px] text-slate-600">
                Unit {completingTicket.unitNumber || 'Apartment'} &bull; Tenant: {completingTicket.tenantName || 'Resident'}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Repair Amount to Bill Tenant on Month-End Invoice (KSh)
                </label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={completionCost}
                  onChange={(e) => setCompletionCost(e.target.value)}
                  placeholder="e.g. 1500"
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono text-sm focus:outline-none focus:border-emerald-500 shadow-sm"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  This cost will be added under <em>Maintenance & Repair Charges</em> in the tenant&apos;s upcoming rent invoice.
                </p>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Resolved by Technician / Contractor
                </label>
                <input
                  type="text"
                  value={completionTech}
                  onChange={(e) => setCompletionTech(e.target.value)}
                  placeholder="e.g. John Plumbers Ltd"
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-emerald-500 shadow-sm"
                />
              </div>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl text-emerald-900 text-[11px] space-y-1">
              <div className="font-bold flex items-center gap-1 text-emerald-800">
                <Receipt className="w-3.5 h-3.5 text-emerald-600" /> Automated Invoice Billing Workflow:
              </div>
              <p className="text-emerald-700 leading-relaxed">
                This maintenance problem will be cleared from your active issues list. When monthly invoices are generated, the tenant will be billed KSh {Number(completionCost || 0).toLocaleString()} alongside their normal rent.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCompletingTicket(null)}
                className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmCompletion}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 transition shadow-sm flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" /> Resolve & Queue Billing
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
