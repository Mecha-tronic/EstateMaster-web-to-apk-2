import React from 'react';
import {
  Building2,
  Users,
  FileText,
  DollarSign,
  Wrench,
  Mail,
  TrendingUp,
  PlusCircle,
  Clock,
  ArrowUpRight,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { Property, Unit, Tenant, Invoice, Quote, MaintenanceRequest, EmailLog, Landlord } from '../types';
import { formatKSH } from '../lib/formatters';
import { LogOut, ShieldCheck } from 'lucide-react';

interface LandlordDashboardProps {
  properties: Property[];
  units: Unit[];
  tenants: Tenant[];
  invoices: Invoice[];
  quotes: Quote[];
  maintenance: MaintenanceRequest[];
  emails: EmailLog[];
  signedInLandlord?: Landlord | null;
  onSignOut?: () => void;
  onNavigate: (tab: string) => void;
  onOpenNewInvoice: () => void;
  onOpenNewQuote: () => void;
}

export const LandlordDashboard: React.FC<LandlordDashboardProps> = ({
  properties,
  units,
  tenants,
  invoices,
  quotes,
  maintenance,
  emails,
  signedInLandlord,
  onSignOut,
  onNavigate,
  onOpenNewInvoice,
  onOpenNewQuote,
}) => {
  const totalUnitsCount = units.length;
  const occupiedUnits = units.filter((u) => u.status === 'Occupied').length;
  const occupancyRate = totalUnitsCount > 0 ? Math.round((occupiedUnits / totalUnitsCount) * 100) : 0;

  const totalCollected = invoices
    .filter((inv) => inv.status === 'Paid')
    .reduce((sum, inv) => sum + inv.totalAmount, 0);

  const totalOutstanding = invoices
    .filter((inv) => inv.status === 'Unpaid' || inv.status === 'Overdue')
    .reduce((sum, inv) => sum + (inv.totalAmount - (inv.amountPaid || 0)), 0);

  const openMaintenance = maintenance.filter((m) => m.status === 'Open' || m.status === 'In Progress').length;
  const recentEmails = emails.slice(-4).reverse();

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 text-white p-5 sm:p-6 rounded-2xl border border-slate-800 shadow-md relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-300 text-xs font-semibold">
                <TrendingUp className="w-3.5 h-3.5" /> Real Estate Landlord Overview
              </div>
              {signedInLandlord && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-semibold">
                  <ShieldCheck className="w-3.5 h-3.5" /> Logged In: {signedInLandlord.name} ({signedInLandlord.companyName})
                </div>
              )}
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Property Portfolio & Operations
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 mt-1">
              Automated tenant registration, monthly email invoices, and maintenance triage.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onSignOut && (
              <button
                onClick={onSignOut}
                className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition flex items-center gap-1.5 shadow-xs"
                title="Sign out of landlord account"
              >
                <LogOut className="w-3.5 h-3.5 text-rose-400" />
                Sign Out
              </button>
            )}
            <button
              onClick={() => onNavigate('register')}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition flex items-center gap-1.5"
            >
              <PlusCircle className="w-4 h-4" />
              New Tenant Registration
            </button>
            <button
              onClick={onOpenNewInvoice}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm transition flex items-center gap-1.5"
            >
              <FileText className="w-4 h-4" />
              Issue Monthly Invoice
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Collected */}
        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Revenue Collected</span>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-slate-900">
            {formatKSH(totalCollected)}
          </div>
          <p className="text-[11px] text-emerald-600 mt-1 flex items-center gap-1 font-medium">
            <CheckCircle2 className="w-3 h-3" /> Paid Invoices
          </p>
        </div>

        {/* Total Outstanding */}
        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Outstanding Rent</span>
            <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-slate-900">
            {formatKSH(totalOutstanding)}
          </div>
          <p className="text-[11px] text-amber-600 mt-1 flex items-center gap-1 font-medium">
            <AlertCircle className="w-3 h-3" /> Due or Overdue
          </p>
        </div>

        {/* Occupancy Rate */}
        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Occupancy Rate</span>
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-slate-900">{occupancyRate}%</div>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">
            {occupiedUnits} / {totalUnitsCount} Units Occupied
          </p>
        </div>

        {/* Maintenance Requests */}
        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Maintenance Tickets</span>
            <div className="p-2 rounded-lg bg-red-50 text-red-600">
              <Wrench className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-slate-900">{openMaintenance}</div>
          <p className="text-[11px] text-red-600 mt-1 font-medium">Active requests needing action</p>
        </div>
      </div>

      {/* Main Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Properties & Tenants Overview */}
        <div className="lg:col-span-2 space-y-6">
          {/* Properties Summary */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-600" /> Managed Properties ({properties.length})
              </h3>
              <button
                onClick={() => onNavigate('properties')}
                className="text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1"
              >
                View All <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {properties.map((prop) => (
                <div
                  key={prop.id}
                  onClick={() => onNavigate('properties')}
                  className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl hover:border-blue-500 transition cursor-pointer flex gap-3 items-center"
                >
                  <img
                    src={prop.imageUrl}
                    alt={prop.name}
                    className="w-16 h-16 rounded-lg object-cover bg-slate-200"
                  />
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-slate-900 text-sm truncate">{prop.name}</h4>
                    <p className="text-xs text-slate-500 truncate">{prop.address}, {prop.city}</p>
                    <div className="mt-1.5 flex items-center gap-2 text-[11px] text-blue-600 font-medium">
                      <span>{prop.totalUnits} Units</span>
                      <span>&bull;</span>
                      <span className="capitalize">{prop.type}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Active Tenants List Preview */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-600" /> Active Tenants ({tenants.length})
              </h3>
              <button
                onClick={() => onNavigate('tenants')}
                className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold flex items-center gap-1"
              >
                Manage Leases <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-2.5">
              {tenants.map((tenant) => (
                <div
                  key={tenant.id}
                  className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center border border-emerald-200">
                      {tenant.fullName.charAt(0)}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">{tenant.fullName}</p>
                      <p className="text-slate-500">{tenant.propertyName} - Unit {tenant.unitNumber}</p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="font-bold text-emerald-600">{formatKSH(tenant.monthlyRent)}/mo</p>
                    <p className="text-[10px] text-slate-500">{tenant.email}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Automated Email Log & Quick Actions */}
        <div className="space-y-6">
          {/* Quick Automation Tools */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-sm">
            <h3 className="font-bold text-slate-900 text-base mb-3 flex items-center gap-2">
              ⚡ Quick Actions
            </h3>
            <div className="grid grid-cols-1 gap-2.5">
              <button
                onClick={() => onNavigate('register')}
                className="w-full text-left p-3 rounded-xl bg-slate-50 hover:bg-emerald-50/60 border border-slate-200 hover:border-emerald-300 text-slate-800 text-xs font-medium transition flex items-center justify-between"
              >
                <div className="flex items-center gap-2.5">
                  <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700">📝</span>
                  <div>
                    <p className="font-bold text-slate-900">Register New Tenant</p>
                    <p className="text-[11px] text-slate-500">Generates quote & first invoice instantly</p>
                  </div>
                </div>
                <ArrowUpRight className="w-4 h-4 text-slate-400" />
              </button>

              <button
                onClick={() => onNavigate('properties')}
                className="w-full text-left p-3 rounded-xl bg-slate-50 hover:bg-blue-50/60 border border-slate-200 hover:border-blue-300 text-slate-800 text-xs font-medium transition flex items-center justify-between"
              >
                <div className="flex items-center gap-2.5">
                  <span className="p-1.5 rounded-lg bg-blue-100 text-blue-700">🏢</span>
                  <div>
                    <p className="font-bold text-slate-900">Add Property / Apartment Unit</p>
                    <p className="text-[11px] text-slate-500">Register apartments & set monthly rent</p>
                  </div>
                </div>
                <ArrowUpRight className="w-4 h-4 text-slate-400" />
              </button>

              <button
                onClick={onOpenNewInvoice}
                className="w-full text-left p-3 rounded-xl bg-slate-50 hover:bg-indigo-50/60 border border-slate-200 hover:border-indigo-300 text-slate-800 text-xs font-medium transition flex items-center justify-between"
              >
                <div className="flex items-center gap-2.5">
                  <span className="p-1.5 rounded-lg bg-indigo-100 text-indigo-700">📄</span>
                  <div>
                    <p className="font-bold text-slate-900">Issue Monthly Invoice</p>
                    <p className="text-[11px] text-slate-500">Breakdown & dispatch to tenant email</p>
                  </div>
                </div>
                <ArrowUpRight className="w-4 h-4 text-slate-400" />
              </button>

              <button
                onClick={onOpenNewQuote}
                className="w-full text-left p-3 rounded-xl bg-slate-50 hover:bg-sky-50/60 border border-slate-200 hover:border-sky-300 text-slate-800 text-xs font-medium transition flex items-center justify-between"
              >
                <div className="flex items-center gap-2.5">
                  <span className="p-1.5 rounded-lg bg-sky-100 text-sky-700">🏷️</span>
                  <div>
                    <p className="font-bold text-slate-900">Generate Rental Quote</p>
                    <p className="text-[11px] text-slate-500">Pricing, terms & move-in estimate</p>
                  </div>
                </div>
                <ArrowUpRight className="w-4 h-4 text-slate-400" />
              </button>

              <button
                onClick={() => onNavigate('payments')}
                className="w-full text-left p-3 rounded-xl bg-slate-50 hover:bg-amber-50/60 border border-slate-200 hover:border-amber-300 text-slate-800 text-xs font-medium transition flex items-center justify-between"
              >
                <div className="flex items-center gap-2.5">
                  <span className="p-1.5 rounded-lg bg-amber-100 text-amber-700">💳</span>
                  <div>
                    <p className="font-bold text-slate-900">Payment Ledger & Receipts</p>
                    <p className="text-[11px] text-slate-500">Record M-Pesa or bank payments</p>
                  </div>
                </div>
                <ArrowUpRight className="w-4 h-4 text-slate-400" />
              </button>

              <button
                onClick={() => onNavigate('maintenance')}
                className="w-full text-left p-3 rounded-xl bg-slate-50 hover:bg-rose-50/60 border border-slate-200 hover:border-rose-300 text-slate-800 text-xs font-medium transition flex items-center justify-between"
              >
                <div className="flex items-center gap-2.5">
                  <span className="p-1.5 rounded-lg bg-rose-100 text-rose-700">🔧</span>
                  <div>
                    <p className="font-bold text-slate-900">Maintenance Tickets</p>
                    <p className="text-[11px] text-slate-500">Review repairs & technician assignments</p>
                  </div>
                </div>
                <ArrowUpRight className="w-4 h-4 text-slate-400" />
              </button>

              <button
                onClick={() => onNavigate('landlord-accounts')}
                className="w-full text-left p-3 rounded-xl bg-slate-50 hover:bg-purple-50/60 border border-slate-200 hover:border-purple-300 text-slate-800 text-xs font-medium transition flex items-center justify-between"
              >
                <div className="flex items-center gap-2.5">
                  <span className="p-1.5 rounded-lg bg-purple-100 text-purple-700">🏦</span>
                  <div>
                    <p className="font-bold text-slate-900">Bank & M-Pesa Accounts</p>
                    <p className="text-[11px] text-slate-500">Configure rent collection details</p>
                  </div>
                </div>
                <ArrowUpRight className="w-4 h-4 text-slate-400" />
              </button>
            </div>
          </div>

          {/* Email Dispatcher Activity Stream */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Mail className="w-4 h-4 text-blue-600" /> Dispatched Tenant Emails
              </h3>
              <span className="text-[10px] bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-full font-bold border border-blue-200">
                Auto Sent
              </span>
            </div>

            <div className="space-y-3">
              {recentEmails.map((email) => (
                <div
                  key={email.id}
                  className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between text-slate-600">
                    <span className="font-bold text-blue-600">{email.recipientName}</span>
                    <span className="text-[10px] text-slate-400">
                      {new Date(email.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="font-semibold text-slate-800 line-clamp-1">{email.subject}</p>
                  <p className="text-[10px] text-slate-500 truncate">To: {email.recipientEmail}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
