import React, { useState } from 'react';
import { MaintenanceRequest, Tenant, Unit, Property } from '../types';
import { Wrench, Sparkles, CheckCircle, Clock, AlertOctagon, UserCheck, Plus, ShieldAlert } from 'lucide-react';

interface MaintenanceViewProps {
  maintenance: MaintenanceRequest[];
  tenants?: Tenant[];
  units?: Unit[];
  properties?: Property[];
  onUpdateStatus: (id: string, status: string, tech?: string) => void;
  onCreateTicket?: (ticket: any) => void;
}

export const MaintenanceView: React.FC<MaintenanceViewProps> = ({
  maintenance,
  tenants = [],
  units = [],
  properties = [],
  onUpdateStatus,
}) => {
  const [techAssignments, setTechAssignments] = useState<{ [id: string]: string }>({});

  const handleStatusChange = (id: string, newStatus: string) => {
    const tech = techAssignments[id] || 'In-House Maintenance';
    onUpdateStatus(id, newStatus, tech);
  };

  const getUrgencyBadge = (urgency: string) => {
    switch (urgency) {
      case 'Emergency':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/30';
      case 'High':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      case 'Medium':
        return 'bg-sky-500/20 text-sky-300 border-sky-500/30';
      default:
        return 'bg-slate-500/20 text-slate-300 border-slate-500/30';
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Wrench className="w-6 h-6 text-rose-600" /> Automated Maintenance Triage
          </h2>
          <p className="text-xs sm:text-sm text-slate-500">
            Tenant issue tracking powered by Gemini AI triage, urgency analysis, and DIY troubleshooting guidance.
          </p>
        </div>
      </div>

      {/* Tickets List */}
      <div className="space-y-4">
        {maintenance.map((m) => {
          // Dynamically resolve tenant, unit, and property to ensure property information matches tenant move-in
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

          return (
            <div
              key={m.id}
              className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4 hover:border-blue-500 transition shadow-sm text-slate-900"
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
                        Issue Title:
                      </span>
                      <span>{m.title || `${m.category || 'Maintenance'} Request`}</span>
                    </div>
                    <div className="text-xs text-slate-700 leading-relaxed pt-1 border-t border-slate-200/60">
                      <strong className="text-slate-900 font-bold">Issue Description: </strong>
                      <span>{m.description}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={m.status}
                    onChange={(e) => handleStatusChange(m.id, e.target.value)}
                    className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-blue-500 font-bold shadow-sm"
                  >
                    <option value="Open">Status: Open</option>
                    <option value="In Progress">Status: In Progress</option>
                    <option value="Completed">Status: Completed</option>
                  </select>
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

              {/* Bottom Contractor & Contact Bar */}
              <div className="flex flex-wrap items-center justify-between text-xs pt-2 border-t border-slate-200 gap-3">
                <div className="text-slate-500">
                  Submitted by: <strong className="text-slate-800">{displayTenantName}</strong> &bull; <span className="font-semibold text-slate-700">{displayDate}</span>
                </div>

                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-emerald-600" />
                  <span className="text-slate-500 font-medium">Assigned Technician:</span>
                  <span className="font-bold text-emerald-800">
                    {m.assignedTechnician || 'John Plumbers Ltd'}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
