import React from 'react';
import { motion } from 'motion/react';
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
  AlertCircle,
  LogOut,
  ShieldCheck,
  Zap,
  Layers,
  FileSpreadsheet,
  Download
} from 'lucide-react';
import { Property, Unit, Tenant, Invoice, Quote, MaintenanceRequest, EmailLog, Landlord, Payment } from '../types';
import { formatKSH } from '../lib/formatters';
import { exportLandlordPaymentLedgerToExcel } from '../lib/excelExport';

interface LandlordDashboardProps {
  properties: Property[];
  units: Unit[];
  tenants: Tenant[];
  invoices: Invoice[];
  quotes: Quote[];
  maintenance: MaintenanceRequest[];
  emails: EmailLog[];
  payments?: Payment[];
  signedInLandlord?: Landlord | null;
  onSignOut?: () => void;
  onNavigate: (tab: string) => void;
  onOpenNewInvoice: () => void;
  onOpenNewQuote: () => void;
  onSeedSampleData?: () => void;
}

export const LandlordDashboard: React.FC<LandlordDashboardProps> = ({
  properties,
  units,
  tenants,
  invoices,
  quotes,
  maintenance,
  emails,
  payments = [],
  signedInLandlord,
  onSignOut,
  onNavigate,
  onOpenNewInvoice,
  onOpenNewQuote,
  onSeedSampleData,
}) => {
  const [isExportingExcel, setIsExportingExcel] = React.useState(false);

  const handleQuickExcelExport = () => {
    setIsExportingExcel(true);
    try {
      exportLandlordPaymentLedgerToExcel({
        properties,
        tenants,
        invoices,
        payments,
        landlordName: signedInLandlord?.name || 'Landlord',
        companyName: signedInLandlord?.companyName || 'EstateMaster Properties',
        buildingFilterId: 'all',
      });
    } catch (e) {
      console.error('Failed to export Excel ledger from dashboard:', e);
    } finally {
      setIsExportingExcel(false);
    }
  };
  // Calculate total units and occupied units based on unit status and registered tenants
  const totalUnitsCount = units.length > 0 ? units.length : Math.max(tenants.length, 1);
  const occupiedUnitsCount = units.filter(
    (u) =>
      u.status === 'Occupied' ||
      tenants.some((t) => t.unitId === u.id || (t.unitNumber && t.unitNumber === u.unitNumber))
  ).length;

  // Ensure occupied count reflects registered tenants accurately
  const effectiveOccupied = Math.min(totalUnitsCount, Math.max(occupiedUnitsCount, tenants.length));
  const occupancyRate = totalUnitsCount > 0 ? Math.round((effectiveOccupied / totalUnitsCount) * 100) : 0;

  const totalCollected = invoices
    .filter((inv) => inv.status === 'Paid')
    .reduce((sum, inv) => sum + inv.totalAmount, 0);

  const totalOutstanding = invoices
    .filter((inv) => inv.status === 'Unpaid' || inv.status === 'Overdue')
    .reduce((sum, inv) => sum + (inv.totalAmount - (inv.amountPaid || 0)), 0);

  const openMaintenance = maintenance.filter((m) => m.status === 'Open' || m.status === 'In Progress').length;
  const recentEmails = emails.slice(-4).reverse();

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="p-4 sm:p-7 space-y-7 max-w-7xl mx-auto font-sans"
    >
      {/* Header Banner with Radiant Gradient & Glow */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 sm:p-8 rounded-3xl border border-indigo-500/20 shadow-xl relative overflow-hidden">
        <div className="absolute -right-10 -top-10 w-60 h-60 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -left-10 -bottom-10 w-60 h-60 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start sm:items-center gap-4">
            <img
              src="/icon.svg"
              alt="EstateMaster"
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl shadow-lg shadow-blue-950/40 object-contain shrink-0 border border-blue-400/20"
              referrerPolicy="no-referrer"
            />
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-300 text-xs font-bold uppercase tracking-wider">
                  <TrendingUp className="w-3.5 h-3.5" /> Real Estate Portfolio
                </div>
                {signedInLandlord && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-bold">
                    <ShieldCheck className="w-3.5 h-3.5" /> {signedInLandlord.name} ({signedInLandlord.companyName})
                  </div>
                )}
              </div>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight">
                Property Operations & Analytics
              </h2>
              <p className="text-sm sm:text-base text-slate-300 max-w-2xl">
                Automated M-Pesa billing, monthly PDF tenant invoices, automated arrears roll-over, and instant repairs dispatch.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleQuickExcelExport}
              disabled={isExportingExcel}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 text-xs sm:text-sm font-bold border border-emerald-500/40 transition-all flex items-center gap-2 shadow-sm cursor-pointer hover:scale-105 disabled:opacity-50"
              title="Download Excel spreadsheet of all payment records, rent billed & arrears across separate buildings"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              {isExportingExcel ? 'Exporting...' : 'Excel Payment Ledger'}
            </button>
            {onSignOut && (
              <button
                onClick={onSignOut}
                className="px-4 py-2.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 text-xs sm:text-sm font-bold border border-slate-700/80 transition-all flex items-center gap-2 shadow-sm cursor-pointer hover:scale-105"
                title="Sign out of landlord account"
              >
                <LogOut className="w-4 h-4 text-rose-400" />
                Sign Out
              </button>
            )}
            <button
              onClick={() => onNavigate('register')}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-bold shadow-md shadow-emerald-600/30 transition-all flex items-center gap-2 cursor-pointer hover:scale-105"
            >
              <PlusCircle className="w-4 h-4" />
              New Tenant Registration
            </button>
            <button
              onClick={onOpenNewInvoice}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-bold shadow-md shadow-blue-600/30 transition-all flex items-center gap-2 cursor-pointer hover:scale-105"
            >
              <FileText className="w-4 h-4" />
              Issue Monthly Invoice
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* Total Collected */}
        <motion.div 
          whileHover={{ y: -3 }}
          className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-sm hover:shadow-md transition-all relative overflow-hidden group"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Revenue Collected</span>
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 group-hover:scale-110 transition-transform">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-sans tracking-tight">
            {formatKSH(totalCollected)}
          </div>
          <p className="text-xs text-emerald-700 mt-2 flex items-center gap-1.5 font-bold">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Settled Payments
          </p>
        </motion.div>

        {/* Total Outstanding */}
        <motion.div 
          whileHover={{ y: -3 }}
          className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-sm hover:shadow-md transition-all relative overflow-hidden group"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Outstanding Arrears</span>
            <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600 group-hover:scale-110 transition-transform">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-sans tracking-tight">
            {formatKSH(totalOutstanding)}
          </div>
          <p className="text-xs text-amber-700 mt-2 flex items-center gap-1.5 font-bold">
            <AlertCircle className="w-4 h-4 text-amber-500" /> Pending Collection
          </p>
        </motion.div>

        {/* Occupancy Rate */}
        <motion.div 
          whileHover={{ y: -3 }}
          className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-sm hover:shadow-md transition-all relative overflow-hidden group"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Portfolio Occupancy</span>
            <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 group-hover:scale-110 transition-transform">
              <Building2 className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-sans tracking-tight">
            {occupancyRate}%
          </div>
          <p className="text-xs text-blue-700 mt-2 font-bold flex items-center gap-1">
            <Layers className="w-4 h-4 text-blue-500" /> {effectiveOccupied} of {totalUnitsCount} Units Occupied
          </p>
        </motion.div>

        {/* Maintenance Requests */}
        <motion.div 
          whileHover={{ y: -3 }}
          className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-sm hover:shadow-md transition-all relative overflow-hidden group"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Maintenance Tickets</span>
            <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600 group-hover:scale-110 transition-transform">
              <Wrench className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-sans tracking-tight">
            {openMaintenance}
          </div>
          <p className="text-xs text-rose-700 mt-2 font-bold flex items-center gap-1">
            <Zap className="w-4 h-4 text-rose-500" /> {openMaintenance > 0 ? 'Active repairs pending' : 'All repairs resolved'}
          </p>
        </motion.div>
      </div>

      {/* Main Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-7">
        {/* Left Column: Properties & Tenants Overview */}
        <div className="lg:col-span-2 space-y-6 sm:space-y-7">
          {/* Properties Summary */}
          <div className="bg-white border border-slate-200/80 rounded-3xl p-5 sm:p-6 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-extrabold text-slate-900 text-lg flex items-center gap-2.5">
                <Building2 className="w-5 h-5 text-blue-600" /> Managed Properties ({properties.length})
              </h3>
              <button
                onClick={() => onNavigate('properties')}
                className="text-xs sm:text-sm text-blue-600 hover:text-blue-700 font-bold flex items-center gap-1 cursor-pointer transition hover:translate-x-0.5"
              >
                View All Properties <ArrowUpRight className="w-4 h-4" />
              </button>
            </div>

            {properties.length === 0 ? (
              <div className="p-6 rounded-2xl bg-blue-50/70 border border-blue-200 text-center space-y-3">
                <p className="text-sm text-blue-950 font-bold">
                  You haven't added any properties to your estate portfolio yet.
                </p>
                <p className="text-xs text-blue-800">
                  EstateMaster provides isolated multi-tenant accounts. Click below to add your real property or populate sample estate data for testing:
                </p>
                <div className="flex flex-wrap justify-center gap-2.5 pt-2">
                  <button
                    onClick={() => onNavigate('properties')}
                    className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm shadow-xs transition cursor-pointer"
                  >
                    + Add New Property
                  </button>
                  <button
                    onClick={() => onNavigate('register')}
                    className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm shadow-xs transition cursor-pointer"
                  >
                    + Register Tenant
                  </button>
                  {onSeedSampleData && (
                    <button
                      onClick={onSeedSampleData}
                      className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs sm:text-sm shadow-xs transition cursor-pointer"
                    >
                      ⚡ Load Sample Demo Estate
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {properties.map((prop, pIdx) => (
                  <div
                    key={`dash-prop-${prop.id}-${pIdx}`}
                    onClick={() => onNavigate('properties')}
                    className="bg-slate-50/70 border border-slate-200/80 p-4 rounded-2xl hover:border-blue-500 hover:bg-blue-50/30 transition-all cursor-pointer flex gap-3.5 items-center group shadow-2xs"
                  >
                    <img
                      src={prop.imageUrl}
                      alt={prop.name}
                      className="w-18 h-18 rounded-xl object-cover bg-slate-200 group-hover:scale-105 transition-transform"
                    />
                    <div className="flex-1 min-w-0">
                      <h4 className="font-extrabold text-slate-900 text-sm sm:text-base truncate group-hover:text-blue-600 transition-colors">
                        {prop.name}
                      </h4>
                      <p className="text-xs text-slate-500 truncate mt-0.5">{prop.address}, {prop.city}</p>
                      <div className="mt-2 flex items-center gap-2 text-xs text-blue-600 font-bold">
                        <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-md text-[11px]">{prop.totalUnits} Units</span>
                        <span className="text-slate-400">&bull;</span>
                        <span className="capitalize text-slate-600">{prop.type}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Active Tenants List Preview */}
          <div className="bg-white border border-slate-200/80 rounded-3xl p-5 sm:p-6 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-extrabold text-slate-900 text-lg flex items-center gap-2.5">
                <Users className="w-5 h-5 text-emerald-600" /> Active Leases & Occupants ({tenants.length})
              </h3>
              <button
                onClick={() => onNavigate('tenants')}
                className="text-xs sm:text-sm text-emerald-600 hover:text-emerald-700 font-bold flex items-center gap-1 cursor-pointer transition hover:translate-x-0.5"
              >
                Manage Leases <ArrowUpRight className="w-4 h-4" />
              </button>
            </div>

            {tenants.length === 0 ? (
              <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-3">
                <p className="text-sm text-slate-700 font-bold">No active tenants registered under your account yet.</p>
                <button
                  onClick={() => onNavigate('register')}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm shadow-xs transition cursor-pointer"
                >
                  + Register First Tenant
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {tenants.map((tenant, tIdx) => (
                  <div
                    key={`dash-tenant-${tenant.id}-${tIdx}`}
                    className="bg-slate-50/80 border border-slate-200/80 p-3.5 rounded-2xl flex items-center justify-between gap-4 text-xs sm:text-sm hover:bg-emerald-50/30 hover:border-emerald-200 transition-all"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white font-bold text-base flex items-center justify-center shadow-xs">
                        {tenant.fullName.charAt(0)}
                      </div>
                      <div>
                        <p className="font-extrabold text-slate-900 text-sm">{tenant.fullName}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{tenant.propertyName} &bull; Unit {tenant.unitNumber}</p>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="font-extrabold text-emerald-600 text-sm sm:text-base">{formatKSH(tenant.monthlyRent)}/mo</p>
                      <p className="text-xs text-slate-500">{tenant.phone || tenant.email}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Automated Email Log & Quick Actions */}
        <div className="space-y-6 sm:space-y-7">
          {/* Quick Automation Tools */}
          <div className="bg-white border border-slate-200/80 rounded-3xl p-5 sm:p-6 shadow-sm">
            <h3 className="font-extrabold text-slate-900 text-lg mb-4 flex items-center gap-2">
              ⚡ Quick Operations
            </h3>
            <div className="grid grid-cols-1 gap-3">
              <button
                onClick={() => onNavigate('register')}
                className="w-full text-left p-3.5 rounded-2xl bg-slate-50 hover:bg-emerald-50/80 border border-slate-200 hover:border-emerald-300 text-slate-800 text-xs sm:text-sm font-medium transition flex items-center justify-between group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <span className="p-2 rounded-xl bg-emerald-100 text-emerald-700 text-base">📝</span>
                  <div>
                    <p className="font-extrabold text-slate-900 group-hover:text-emerald-700">Register New Tenant</p>
                    <p className="text-xs text-slate-500">Generates quote & first invoice</p>
                  </div>
                </div>
                <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 transition-colors" />
              </button>

              <button
                onClick={() => onNavigate('properties')}
                className="w-full text-left p-3.5 rounded-2xl bg-slate-50 hover:bg-blue-50/80 border border-slate-200 hover:border-blue-300 text-slate-800 text-xs sm:text-sm font-medium transition flex items-center justify-between group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <span className="p-2 rounded-xl bg-blue-100 text-blue-700 text-base">🏢</span>
                  <div>
                    <p className="font-extrabold text-slate-900 group-hover:text-blue-700">Add Unit / Property</p>
                    <p className="text-xs text-slate-500">Add apartments & set monthly rent</p>
                  </div>
                </div>
                <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-colors" />
              </button>

              <button
                onClick={onOpenNewInvoice}
                className="w-full text-left p-3.5 rounded-2xl bg-slate-50 hover:bg-indigo-50/80 border border-slate-200 hover:border-indigo-300 text-slate-800 text-xs sm:text-sm font-medium transition flex items-center justify-between group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <span className="p-2 rounded-xl bg-indigo-100 text-indigo-700 text-base">📄</span>
                  <div>
                    <p className="font-extrabold text-slate-900 group-hover:text-indigo-700">Issue Monthly Invoice</p>
                    <p className="text-xs text-slate-500">Breakdown & auto-carry arrears</p>
                  </div>
                </div>
                <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 transition-colors" />
              </button>

              <button
                onClick={onOpenNewQuote}
                className="w-full text-left p-3.5 rounded-2xl bg-slate-50 hover:bg-sky-50/80 border border-slate-200 hover:border-sky-300 text-slate-800 text-xs sm:text-sm font-medium transition flex items-center justify-between group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <span className="p-2 rounded-xl bg-sky-100 text-sky-700 text-base">🏷️</span>
                  <div>
                    <p className="font-extrabold text-slate-900 group-hover:text-sky-700">Generate Rental Quote</p>
                    <p className="text-xs text-slate-500">Pricing, terms & move-in estimate</p>
                  </div>
                </div>
                <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-sky-600 transition-colors" />
              </button>

              <button
                onClick={() => onNavigate('payments')}
                className="w-full text-left p-3.5 rounded-2xl bg-slate-50 hover:bg-amber-50/80 border border-slate-200 hover:border-amber-300 text-slate-800 text-xs sm:text-sm font-medium transition flex items-center justify-between group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <span className="p-2 rounded-xl bg-amber-100 text-amber-700 text-base">💳</span>
                  <div>
                    <p className="font-extrabold text-slate-900 group-hover:text-amber-700">Payment Ledger & Receipts</p>
                    <p className="text-xs text-slate-500">M-Pesa STK & bank ledger</p>
                  </div>
                </div>
                <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-amber-600 transition-colors" />
              </button>

              <button
                onClick={() => onNavigate('maintenance')}
                className="w-full text-left p-3.5 rounded-2xl bg-slate-50 hover:bg-rose-50/80 border border-slate-200 hover:border-rose-300 text-slate-800 text-xs sm:text-sm font-medium transition flex items-center justify-between group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <span className="p-2 rounded-xl bg-rose-100 text-rose-700 text-base">🔧</span>
                  <div>
                    <p className="font-extrabold text-slate-900 group-hover:text-rose-700">Maintenance & Repairs</p>
                    <p className="text-xs text-slate-500">AI triage & technician assignments</p>
                  </div>
                </div>
                <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-rose-600 transition-colors" />
              </button>

              <button
                onClick={() => onNavigate('landlord-accounts')}
                className="w-full text-left p-3.5 rounded-2xl bg-slate-50 hover:bg-purple-50/80 border border-slate-200 hover:border-purple-300 text-slate-800 text-xs sm:text-sm font-medium transition flex items-center justify-between group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <span className="p-2 rounded-xl bg-purple-100 text-purple-700 text-base">🏦</span>
                  <div>
                    <p className="font-extrabold text-slate-900 group-hover:text-purple-700">Bank & M-Pesa Accounts</p>
                    <p className="text-xs text-slate-500">Receiving paybill & till accounts</p>
                  </div>
                </div>
                <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-purple-600 transition-colors" />
              </button>
            </div>
          </div>

          {/* Email Dispatcher Activity Stream */}
          <div className="bg-white border border-slate-200/80 rounded-3xl p-5 sm:p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-extrabold text-slate-900 text-lg flex items-center gap-2.5">
                <Mail className="w-5 h-5 text-blue-600" /> Dispatched Notifications
              </h3>
              <span className="text-[11px] bg-blue-100 text-blue-800 px-3 py-1 rounded-full font-extrabold border border-blue-200">
                Auto Dispatched
              </span>
            </div>

            <div className="space-y-3">
              {recentEmails.map((email, eIdx) => (
                <div
                  key={`dash-email-${email.id}-${eIdx}`}
                  className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-200/80 text-xs space-y-1.5 hover:border-blue-300 transition-colors"
                >
                  <div className="flex items-center justify-between text-slate-600">
                    <span className="font-extrabold text-blue-600 text-xs sm:text-sm">{email.recipientName}</span>
                    <div className="flex items-center gap-1.5">
                      {email.serialNumber && (
                        <span className="font-mono text-[10px] text-sky-700 bg-sky-50 px-2 py-0.5 rounded-md border border-sky-200 font-bold">
                          {email.serialNumber}
                        </span>
                      )}
                      <span className="text-[11px] text-slate-400 font-mono">
                        {new Date(email.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                  <p className="font-bold text-slate-800 line-clamp-1">{email.subject}</p>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
                    <span className="truncate">To: {email.recipientEmail}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      email.externalDeliveryStatus === 'delivered'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      {email.externalDeliveryStatus === 'delivered' ? '✓ Delivered to Inbox' : 'App Inbox Archive'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
