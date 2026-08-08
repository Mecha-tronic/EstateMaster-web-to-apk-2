import React, { useState } from 'react';
import { Tenant, Unit } from '../types';
import { formatKSH } from '../lib/formatters';
import { Users, Mail, Phone, Calendar, ShieldCheck, Briefcase, Plus, FileText, Send, Camera, Upload, X, User } from 'lucide-react';
import { updateTenantDetails } from '../lib/api';

interface TenantsLeasesViewProps {
  tenants: Tenant[];
  units?: Unit[];
  onNavigateRegister: () => void;
  onOpenInvoiceModal: (tenantId: string) => void;
  onRefreshData?: () => void;
}

export const TenantsLeasesView: React.FC<TenantsLeasesViewProps> = ({
  tenants,
  units = [],
  onNavigateRegister,
  onOpenInvoiceModal,
  onRefreshData,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [editingTenantPhoto, setEditingTenantPhoto] = useState<Tenant | null>(null);
  const [photoUrl, setPhotoUrl] = useState('');
  const [isSavingPhoto, setIsSavingPhoto] = useState(false);

  const PRESET_TENANT_AVATARS = [
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=80',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80',
  ];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setPhotoUrl(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveTenantPhoto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTenantPhoto || !photoUrl) return;
    setIsSavingPhoto(true);
    try {
      await updateTenantDetails(editingTenantPhoto.id, { profilePictureUrl: photoUrl });
      if (onRefreshData) onRefreshData();
      setEditingTenantPhoto(null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingPhoto(false);
    }
  };

  const filteredTenants = tenants.filter(
    (t) =>
      t.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.unitNumber?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-600" /> Tenant Profiles & Active Leases
          </h2>
          <p className="text-xs sm:text-sm text-slate-500">
            View tenant personal information, employment data, move-in dates, profile photos, and lease term compliance.
          </p>
        </div>

        <button
          onClick={onNavigateRegister}
          className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> Register New Tenant
        </button>
      </div>

      {/* Search Filter */}
      <div className="max-w-md">
        <input
          type="text"
          placeholder="Search by tenant name, personal email, or unit..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-white border border-slate-300 rounded-lg px-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 shadow-sm"
        />
      </div>

      {/* Tenants Grid/Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredTenants.map((tenant) => (
          <div
            key={tenant.id}
            className="bg-white border border-slate-200 rounded-xl p-4 space-y-4 relative hover:border-blue-500 transition shadow-sm text-slate-900"
          >
            {/* Top Bar */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="relative group shrink-0">
                  <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-700 font-bold text-base flex items-center justify-center border border-blue-200 overflow-hidden shadow-xs">
                    {tenant.profilePictureUrl ? (
                      <img src={tenant.profilePictureUrl} alt={tenant.fullName} className="w-full h-full object-cover" />
                    ) : (
                      <span>{tenant.fullName.charAt(0)}</span>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setEditingTenantPhoto(tenant);
                      setPhotoUrl(tenant.profilePictureUrl || PRESET_TENANT_AVATARS[0]);
                    }}
                    className="absolute -bottom-1 -right-1 p-1 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-xs transition"
                    title="Change Profile Photo"
                  >
                    <Camera className="w-3 h-3" />
                  </button>
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base leading-tight">{tenant.fullName}</h3>
                  {(() => {
                    const matchedUnit = units.find((u) => u.id === tenant.unitId);
                    const propName = tenant.propertyName || matchedUnit?.propertyName || 'Apartment';
                    const unitNum = tenant.unitNumber || matchedUnit?.unitNumber || 'Unit';
                    return (
                      <p className="text-xs text-blue-600 font-semibold mt-0.5">
                        {propName} &bull; Unit {unitNum}
                      </p>
                    );
                  })()}
                </div>
              </div>

              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                {tenant.status}
              </span>
            </div>

            {/* Personal Details & Contact Grid */}
            <div className="grid grid-cols-2 gap-2.5 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200">
              <div className="space-y-1">
                <p className="text-slate-500 text-[10px] flex items-center gap-1 font-medium">
                  <Mail className="w-3 h-3 text-blue-600" /> Personal Email
                </p>
                <p className="font-medium text-slate-900 truncate" title={tenant.email}>
                  {tenant.email}
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-slate-500 text-[10px] flex items-center gap-1 font-medium">
                  <Phone className="w-3 h-3 text-blue-600" /> Phone Number
                </p>
                <p className="font-medium text-slate-900">{tenant.phone}</p>
              </div>

              <div className="space-y-1">
                <p className="text-slate-500 text-[10px] flex items-center gap-1 font-medium">
                  <Briefcase className="w-3 h-3 text-blue-600" /> Occupation & Income
                </p>
                <p className="font-medium text-slate-900 truncate">
                  {tenant.occupation} ({formatKSH(tenant.income)}/mo)
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-slate-500 text-[10px] flex items-center gap-1 font-medium">
                  <ShieldCheck className="w-3 h-3 text-blue-600" /> National ID / Passport
                </p>
                <p className="font-medium text-slate-900">{tenant.idNumber}</p>
              </div>
            </div>

            {/* Lease Contract & Move-in Info */}
            <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200">
              <div>
                <p className="text-[10px] text-slate-500 flex items-center gap-1 font-medium">
                  <Calendar className="w-3 h-3 text-blue-600" /> Lease Term
                </p>
                <p className="font-semibold text-slate-800 text-[11px]">
                  {tenant.leaseStartDate} to {tenant.leaseEndDate}
                </p>
              </div>

              <div className="text-right">
                <p className="text-[10px] text-slate-500 font-medium">Monthly Rent</p>
                <p className="font-extrabold text-emerald-600 text-sm">{formatKSH(tenant.monthlyRent)}</p>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-2 flex items-center gap-2">
              <button
                onClick={() => {
                  setEditingTenantPhoto(tenant);
                  setPhotoUrl(tenant.profilePictureUrl || PRESET_TENANT_AVATARS[0]);
                }}
                className="py-2 px-3 rounded-lg bg-slate-100 border border-slate-200 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition flex items-center justify-center gap-1.5"
                title="Update Tenant Profile Picture"
              >
                <Camera className="w-3.5 h-3.5 text-blue-600" /> Photo
              </button>
              <button
                onClick={() => onOpenInvoiceModal(tenant.id)}
                className="flex-1 py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition flex items-center justify-center gap-1.5 shadow-sm"
              >
                <FileText className="w-3.5 h-3.5" /> Issue Monthly Invoice
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Edit Tenant Photo Modal for Landlord */}
      {editingTenantPhoto && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-5 space-y-4 text-xs shadow-2xl text-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Camera className="w-5 h-5 text-blue-600" /> Upload Tenant Profile Picture
              </h3>
              <button onClick={() => setEditingTenantPhoto(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Upload a profile photo for tenant <strong className="text-slate-900">{editingTenantPhoto.fullName}</strong> (Unit {editingTenantPhoto.unitNumber}).
            </p>

            <form onSubmit={handleSaveTenantPhoto} className="space-y-4">
              <div className="flex justify-center my-2">
                <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-blue-500 bg-slate-100 shadow-md relative group">
                  {photoUrl ? (
                    <img src={photoUrl} alt="Avatar Preview" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-blue-50 text-blue-500 font-bold text-3xl">
                      {editingTenantPhoto.fullName.charAt(0)}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="cursor-pointer py-2.5 px-4 border border-dashed border-blue-400 rounded-xl bg-blue-50/70 hover:bg-blue-100/70 transition flex items-center justify-center gap-2 text-blue-700 font-bold text-xs">
                  <Upload className="w-4 h-4 text-blue-600" />
                  <span>Choose Photo File from Device</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </label>
              </div>

              <div>
                <p className="text-[11px] font-semibold text-slate-700 mb-2">Or select sample profile avatar:</p>
                <div className="flex items-center justify-center gap-3">
                  {PRESET_TENANT_AVATARS.map((url, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setPhotoUrl(url)}
                      className={`w-12 h-12 rounded-full overflow-hidden border-2 transition ${
                        photoUrl === url ? 'border-blue-600 ring-2 ring-blue-400 scale-105' : 'border-slate-200 hover:border-slate-400'
                      }`}
                    >
                      <img src={url} alt={`Avatar ${idx + 1}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingTenantPhoto(null)}
                  className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingPhoto}
                  className="px-5 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 transition shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSavingPhoto ? 'Saving...' : 'Save Tenant Photo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
