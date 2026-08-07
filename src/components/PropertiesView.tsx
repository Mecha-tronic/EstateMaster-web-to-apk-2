import React, { useState } from 'react';
import { Property, Unit } from '../types';
import { formatKSH } from '../lib/formatters';
import { Building2, Plus, Home, MapPin, CheckCircle, AlertTriangle, Layers, Trash2, AlertCircle, X, ShieldAlert, Camera, Upload, Image as ImageIcon } from 'lucide-react';
import { updatePropertyDetails } from '../lib/api';

interface PropertiesViewProps {
  properties: Property[];
  units: Unit[];
  onAddProperty: (property: Partial<Property>) => void;
  onRemoveProperty?: (propertyId: string) => void;
  onAddUnit: (unit: Partial<Unit>) => void;
  onSelectUnitForRegister?: (unitId: string) => void;
  onRefreshData?: () => void;
}

export const PropertiesView: React.FC<PropertiesViewProps> = ({
  properties,
  units,
  onAddProperty,
  onRemoveProperty,
  onAddUnit,
  onSelectUnitForRegister,
  onRefreshData,
}) => {
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('all');
  const [showPropertyModal, setShowPropertyModal] = useState(false);
  const [showUnitModal, setShowUnitModal] = useState(false);
  const [showRemoveSection, setShowRemoveSection] = useState(false);
  const [propertyToDelete, setPropertyToDelete] = useState<Property | null>(null);
  const [propertyToEditPhoto, setPropertyToEditPhoto] = useState<Property | null>(null);
  const [editPhotoUrl, setEditPhotoUrl] = useState<string>('');
  const [isSavingPhoto, setIsSavingPhoto] = useState(false);

  // New property form state
  const [propName, setPropName] = useState('');
  const [propAddress, setPropAddress] = useState('');
  const [propCity, setPropCity] = useState('Nairobi');
  const [propType, setPropType] = useState<any>('Apartment Building');
  const [propImageUrl, setPropImageUrl] = useState<string>('');

  // New unit form state
  const [unitPropId, setUnitPropId] = useState(properties[0]?.id || '');
  const [unitNumber, setUnitNumber] = useState('');
  const [bedrooms, setBedrooms] = useState('2');
  const [bathrooms, setBathrooms] = useState('2');
  const [sqft, setSqft] = useState('900');
  const [monthlyRent, setMonthlyRent] = useState('650');

  const filteredUnits =
    selectedPropertyId === 'all'
      ? units
      : units.filter((u) => u.propertyId === selectedPropertyId);

  const selectedProperty = properties.find((p) => p.id === selectedPropertyId);

  // Default preset property photos
  const PRESET_PROPERTY_PHOTOS = [
    'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=800&q=80',
  ];

  // Helper for image file uploading
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, setUrl: (url: string) => void) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setUrl(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCreateProperty = (e: React.FormEvent) => {
    e.preventDefault();
    if (!propName || !propAddress) return;
    onAddProperty({
      name: propName,
      address: propAddress,
      city: propCity,
      type: propType,
      totalUnits: 4,
      imageUrl: propImageUrl || PRESET_PROPERTY_PHOTOS[0],
      description: 'Newly added landlord property listing.',
      amenities: ['Parking', 'Security', 'Water Backup']
    });
    setPropName('');
    setPropAddress('');
    setPropImageUrl('');
    setShowPropertyModal(false);
  };

  const handleSavePropertyPhoto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!propertyToEditPhoto || !editPhotoUrl) return;
    setIsSavingPhoto(true);
    try {
      await updatePropertyDetails(propertyToEditPhoto.id, { imageUrl: editPhotoUrl });
      if (onRefreshData) onRefreshData();
      setPropertyToEditPhoto(null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingPhoto(false);
    }
  };

  const handleCreateUnit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!unitNumber) return;
    const prop = properties.find((p) => p.id === unitPropId);
    onAddUnit({
      propertyId: unitPropId,
      propertyName: prop?.name || 'Property',
      unitNumber,
      bedrooms: parseInt(bedrooms),
      bathrooms: parseFloat(bathrooms),
      sqft: parseInt(sqft),
      monthlyRent: parseFloat(monthlyRent),
      depositAmount: parseFloat(monthlyRent),
      status: 'Available',
      features: ['Balcony', 'Modern Bath', 'High Ceiling']
    });
    setUnitNumber('');
    setShowUnitModal(false);
  };

  const handleConfirmDelete = () => {
    if (propertyToDelete && onRemoveProperty) {
      onRemoveProperty(propertyToDelete.id);
      if (selectedPropertyId === propertyToDelete.id) {
        setSelectedPropertyId('all');
      }
      setPropertyToDelete(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="w-6 h-6 text-blue-600" /> Properties & Apartments
          </h2>
          <p className="text-xs sm:text-sm text-slate-500">
            Manage your real estate buildings, view unit availability, set rental pricing, or remove property listings.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowRemoveSection(!showRemoveSection)}
            className={`px-3.5 py-2 rounded-lg border text-xs font-semibold shadow-xs transition flex items-center gap-1.5 ${
              showRemoveSection
                ? 'bg-rose-600 text-white border-rose-700'
                : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
            }`}
          >
            <Trash2 className="w-4 h-4" />
            {showRemoveSection ? 'Hide Property Management' : 'Manage / Remove Properties'}
          </button>

          <button
            onClick={() => setShowPropertyModal(true)}
            className="px-3.5 py-2 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium shadow-xs transition flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4 text-blue-600" /> Add Property
          </button>
          <button
            onClick={() => setShowUnitModal(true)}
            className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium shadow-xs transition flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Add Apartment Unit
          </button>
        </div>
      </div>

      {/* Remove / Manage Property Section */}
      {showRemoveSection && (
        <div className="bg-rose-50/70 border border-rose-200 rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-rose-200 pb-3">
            <div>
              <h3 className="font-bold text-rose-950 text-base flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-rose-600" /> Landlord Property Removal Section
              </h3>
              <p className="text-xs text-rose-800">
                Select a property below to permanently delete its building listing and unregister its units from EstateMaster.
              </p>
            </div>
            <button
              onClick={() => setShowRemoveSection(false)}
              className="p-1 text-rose-500 hover:text-rose-800 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {properties.map((prop) => {
              const propUnits = units.filter((u) => u.propertyId === prop.id);
              const occupiedCount = propUnits.filter((u) => u.status === 'Occupied').length;
              return (
                <div
                  key={prop.id}
                  className="bg-white border border-rose-200 rounded-xl overflow-hidden shadow-xs space-y-3 flex flex-col justify-between"
                >
                  <div>
                    {/* Property Cover / Profile Photo */}
                    <div className="relative h-32 w-full bg-slate-100 group">
                      <img
                        src={prop.imageUrl || PRESET_PROPERTY_PHOTOS[0]}
                        alt={prop.name}
                        className="w-full h-full object-cover"
                      />
                      <button
                        onClick={() => {
                          setPropertyToEditPhoto(prop);
                          setEditPhotoUrl(prop.imageUrl || PRESET_PROPERTY_PHOTOS[0]);
                        }}
                        className="absolute bottom-2 right-2 px-2.5 py-1 bg-slate-900/80 hover:bg-slate-900 text-white rounded-lg text-[10px] font-semibold flex items-center gap-1 backdrop-blur-xs transition shadow-sm"
                      >
                        <Camera className="w-3 h-3 text-blue-400" /> Change Photo
                      </button>
                    </div>

                    <div className="p-4 space-y-2">
                      <div className="flex justify-between items-start gap-2">
                        <h4 className="font-bold text-slate-900 text-sm">{prop.name}</h4>
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-semibold">
                          {prop.type || 'Building'}
                        </span>
                      </div>

                      <p className="text-xs text-slate-500 flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" /> {prop.address}, {prop.city}
                      </p>

                      <div className="grid grid-cols-2 gap-2 mt-3 bg-slate-50 p-2 rounded-lg text-[11px] text-slate-700 border border-slate-200">
                        <div>
                          <span className="text-slate-500 block text-[10px]">Total Units</span>
                          <span className="font-bold">{propUnits.length} Units</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px]">Occupied</span>
                          <span className="font-bold text-emerald-600">{occupiedCount} Occupied</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 pt-0">
                    <button
                      onClick={() => setPropertyToDelete(prop)}
                      className="w-full py-2 px-3 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg shadow-xs transition flex items-center justify-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Remove Property
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Selected Property Header Summary with Profile Picture */}
      {selectedProperty && (
        <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-xl overflow-hidden border border-blue-300 relative group shrink-0 bg-slate-100">
              <img
                src={selectedProperty.imageUrl || PRESET_PROPERTY_PHOTOS[0]}
                alt={selectedProperty.name}
                className="w-full h-full object-cover"
              />
              <button
                onClick={() => {
                  setPropertyToEditPhoto(selectedProperty);
                  setEditPhotoUrl(selectedProperty.imageUrl || PRESET_PROPERTY_PHOTOS[0]);
                }}
                className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white"
                title="Update Property Profile Picture"
              >
                <Camera className="w-4 h-4" />
              </button>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 text-sm">{selectedProperty.name}</h3>
                <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold text-[10px]">
                  {selectedProperty.type || 'Property Listing'}
                </span>
              </div>
              <p className="text-slate-600 text-[11px] flex items-center gap-1 mt-0.5">
                <MapPin className="w-3 h-3 text-slate-400" /> {selectedProperty.address}, {selectedProperty.city}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setPropertyToEditPhoto(selectedProperty);
                setEditPhotoUrl(selectedProperty.imageUrl || PRESET_PROPERTY_PHOTOS[0]);
              }}
              className="px-3 py-1.5 rounded-lg bg-white border border-blue-300 text-blue-700 hover:bg-blue-100 font-semibold text-xs transition flex items-center gap-1.5 shadow-xs"
            >
              <Camera className="w-3.5 h-3.5" /> Change Cover Photo
            </button>
            <button
              onClick={() => setPropertyToDelete(selectedProperty)}
              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition flex items-center gap-1.5 shadow-xs"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete {selectedProperty.name}
            </button>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <button
          onClick={() => setSelectedPropertyId('all')}
          className={`px-3.5 py-2 rounded-lg font-medium transition whitespace-nowrap ${
            selectedPropertyId === 'all'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          All Units ({units.length})
        </button>
        {properties.map((prop) => (
          <button
            key={prop.id}
            onClick={() => setSelectedPropertyId(prop.id)}
            className={`px-3.5 py-2 rounded-lg font-medium transition whitespace-nowrap ${
              selectedPropertyId === prop.id
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {prop.name}
          </button>
        ))}
      </div>

      {/* Units Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredUnits.map((unit) => {
          const isOccupied = unit.status === 'Occupied';
          return (
            <div
              key={unit.id}
              className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 relative flex flex-col justify-between hover:border-blue-500 transition shadow-sm text-slate-900"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <span className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
                      {unit.propertyName}
                    </span>
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-1.5">
                      <Home className="w-4 h-4 text-blue-600" /> Unit {unit.unitNumber}
                    </h3>
                  </div>

                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                      isOccupied
                        ? 'bg-amber-100 text-amber-800 border border-amber-200'
                        : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    }`}
                  >
                    {isOccupied ? <AlertTriangle className="w-3 h-3" /> : <CheckCircle className="w-3 h-3" />}
                    {unit.status}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-center text-xs my-3">
                  <div>
                    <p className="text-slate-500 text-[10px]">Bedrooms</p>
                    <p className="font-bold text-slate-800">{unit.bedrooms} Bed</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-[10px]">Bathrooms</p>
                    <p className="font-bold text-slate-800">{unit.bathrooms} Bath</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-[10px]">Floor Area</p>
                    <p className="font-bold text-slate-800">{unit.sqft} sqft</p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div>
                    <p className="text-[10px] text-slate-500">Monthly Rent</p>
                    <p className="text-lg font-extrabold text-emerald-600">{formatKSH(unit.monthlyRent)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium text-slate-500">Required Deposit</p>
                    <p className="text-sm font-semibold text-slate-700">{formatKSH(unit.depositAmount)}</p>
                  </div>
                </div>
              </div>

              {onSelectUnitForRegister && !isOccupied && (
                <button
                  onClick={() => onSelectUnitForRegister(unit.id)}
                  className="w-full mt-3 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition"
                >
                  Register New Tenant for Unit
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Property Removal Confirmation Modal */}
      {propertyToDelete && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-rose-200 rounded-2xl max-w-md w-full p-6 space-y-4 text-xs shadow-2xl text-slate-900">
            <div className="flex items-center gap-3 border-b border-rose-100 pb-3">
              <div className="p-2.5 bg-rose-100 text-rose-700 rounded-xl">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Confirm Property Removal</h3>
                <p className="text-xs text-rose-600 font-medium">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-slate-700 leading-relaxed">
              Are you sure you want to remove <strong className="text-slate-900 font-bold">{propertyToDelete.name}</strong> ({propertyToDelete.address}, {propertyToDelete.city}) from your landlord portfolio?
            </p>

            <div className="bg-rose-50 border border-rose-200 p-3 rounded-xl text-rose-900 space-y-1 text-[11px]">
              <span className="font-bold flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 text-rose-600" /> Consequences of removal:
              </span>
              <ul className="list-disc list-inside text-rose-800 space-y-0.5">
                <li>The building record will be deleted from your landlord database.</li>
                <li>Associated units and active listings for this building will be removed.</li>
              </ul>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPropertyToDelete(null)}
                className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-5 py-2 rounded-lg bg-rose-600 text-white font-bold hover:bg-rose-700 transition shadow-sm flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" /> Remove Property
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Update Property Profile Photo Modal */}
      {propertyToEditPhoto && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-5 space-y-4 text-xs shadow-2xl text-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Camera className="w-5 h-5 text-blue-600" /> Upload Property Profile Picture
              </h3>
              <button
                onClick={() => setPropertyToEditPhoto(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Update the cover photo for <strong className="text-slate-900">{propertyToEditPhoto.name}</strong>. Upload a new image file from your device or select from sample property photos.
            </p>

            <form onSubmit={handleSavePropertyPhoto} className="space-y-4">
              <div>
                <label className="cursor-pointer py-2.5 px-4 border border-dashed border-blue-400 rounded-xl bg-blue-50/70 hover:bg-blue-100/70 transition flex items-center justify-center gap-2 text-blue-700 font-semibold text-xs">
                  <Upload className="w-4 h-4 text-blue-600" />
                  <span>Choose Photo File from Device</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFileChange(e, setEditPhotoUrl)}
                  />
                </label>
              </div>

              {editPhotoUrl && (
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-slate-700">Photo Preview:</span>
                  <div className="relative rounded-xl overflow-hidden border border-slate-200 h-40">
                    <img src={editPhotoUrl} alt="Preview" className="w-full h-full object-cover" />
                  </div>
                </div>
              )}

              <div>
                <p className="text-[11px] font-semibold text-slate-700 mb-1.5">Or choose a preset property image:</p>
                <div className="grid grid-cols-4 gap-2">
                  {PRESET_PROPERTY_PHOTOS.map((url, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setEditPhotoUrl(url)}
                      className={`h-14 rounded-lg overflow-hidden border-2 transition relative ${
                        editPhotoUrl === url ? 'border-blue-600 ring-2 ring-blue-400' : 'border-slate-200 hover:border-slate-400'
                      }`}
                    >
                      <img src={url} alt={`Preset ${idx + 1}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPropertyToEditPhoto(null)}
                  className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingPhoto}
                  className="px-5 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 transition shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSavingPhoto ? 'Saving...' : 'Save Profile Picture'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Property Modal */}
      {showPropertyModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-5 space-y-4 text-xs shadow-xl text-slate-900">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-600" /> Add Property Listing
            </h3>
            <form onSubmit={handleCreateProperty} className="space-y-3">
              <div>
                <label className="block text-slate-700 font-medium mb-1">Property Name</label>
                <input
                  type="text"
                  required
                  value={propName}
                  onChange={(e) => setPropName(e.target.value)}
                  placeholder="e.g. Oakwood Luxury Apartments"
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-blue-500 shadow-sm"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Street Address</label>
                <input
                  type="text"
                  required
                  value={propAddress}
                  onChange={(e) => setPropAddress(e.target.value)}
                  placeholder="e.g. 124 Parklands Road"
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-blue-500 shadow-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">City</label>
                  <input
                    type="text"
                    value={propCity}
                    onChange={(e) => setPropCity(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-blue-500 shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Property Type</label>
                  <select
                    value={propType}
                    onChange={(e) => setPropType(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-blue-500 shadow-sm"
                  >
                    <option value="Apartment Building">Apartment Building</option>
                    <option value="Condo">Condo</option>
                    <option value="Duplex">Duplex</option>
                    <option value="Single Family">Single Family</option>
                  </select>
                </div>
              </div>

              {/* Property Profile Picture Upload */}
              <div>
                <label className="block text-slate-700 font-medium mb-1 flex items-center justify-between">
                  <span>Property Profile Picture</span>
                  <span className="text-[10px] text-slate-500 font-normal">Upload file or select photo</span>
                </label>
                
                <div className="space-y-2">
                  <label className="cursor-pointer py-2 px-3 border border-dashed border-blue-400 rounded-lg bg-blue-50/60 hover:bg-blue-100/60 transition flex items-center justify-center gap-2 text-blue-700 font-semibold text-xs">
                    <Upload className="w-4 h-4 text-blue-600" />
                    <span>Upload Property Photo from Device</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleFileChange(e, setPropImageUrl)}
                    />
                  </label>

                  {propImageUrl ? (
                    <div className="relative rounded-lg overflow-hidden border border-slate-200 h-32 group">
                      <img src={propImageUrl} alt="Property Preview" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setPropImageUrl('')}
                        className="absolute top-2 right-2 p-1.5 bg-slate-950/80 text-white rounded-full hover:bg-rose-600 transition"
                        title="Remove photo"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div>
                      <p className="text-[10px] text-slate-500 mb-1">Or choose a sample property photo:</p>
                      <div className="grid grid-cols-4 gap-2">
                        {PRESET_PROPERTY_PHOTOS.map((url, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setPropImageUrl(url)}
                            className="h-14 rounded-lg overflow-hidden border-2 border-slate-200 hover:border-blue-600 transition relative group"
                          >
                            <img src={url} alt={`Sample ${idx + 1}`} className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPropertyModal(false)}
                  className="px-4 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 font-medium hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition shadow-sm"
                >
                  Save Property
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Unit Modal */}
      {showUnitModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-5 space-y-4 text-xs shadow-xl text-slate-900">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Home className="w-5 h-5 text-blue-600" /> Add Apartment Unit
            </h3>
            <form onSubmit={handleCreateUnit} className="space-y-3">
              <div>
                <label className="block text-slate-700 font-medium mb-1">Select Property</label>
                <select
                  value={unitPropId}
                  onChange={(e) => setUnitPropId(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-blue-500 shadow-sm"
                >
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Unit Number</label>
                  <input
                    type="text"
                    required
                    value={unitNumber}
                    onChange={(e) => setUnitNumber(e.target.value)}
                    placeholder="e.g. C302"
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-blue-500 shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Monthly Rent (KSh)</label>
                  <input
                    type="number"
                    required
                    value={monthlyRent}
                    onChange={(e) => setMonthlyRent(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-blue-500 shadow-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Bedrooms</label>
                  <input
                    type="number"
                    value={bedrooms}
                    onChange={(e) => setBedrooms(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Bathrooms</label>
                  <input
                    type="number"
                    step="0.5"
                    value={bathrooms}
                    onChange={(e) => setBathrooms(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Sq Ft</label>
                  <input
                    type="number"
                    value={sqft}
                    onChange={(e) => setSqft(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 shadow-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUnitModal(false)}
                  className="px-4 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 font-medium hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition shadow-sm"
                >
                  Save Unit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
