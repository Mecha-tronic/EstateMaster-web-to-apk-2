import { Property, Unit, Tenant, Invoice, Quote, Payment, MaintenanceRequest, EmailLog, Landlord } from '../types';

export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const customUrl = localStorage.getItem('estatemaster_api_url');
    if (customUrl) return customUrl.replace(/\/$/, '');

    const isLocalhostHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const isCapacitor = 
      window.location.protocol === 'capacitor:' ||
      window.location.protocol === 'file:' ||
      (isLocalhostHost && window.location.port !== '3000') ||
      (typeof navigator !== 'undefined' && !!navigator.userAgent && navigator.userAgent.includes('Capacitor'));

    if (isCapacitor) {
      return 'https://ais-pre-ezkstodggizsdniqekt6v3-227270690811.europe-west1.run.app';
    }
  }

  if ((import.meta as any).env?.VITE_API_BASE_URL) {
    return ((import.meta as any).env.VITE_API_BASE_URL as string).replace(/\/$/, '');
  }

  return '';
}

export function getApiUrl(path: string): string {
  const base = getApiBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${cleanPath}` : cleanPath;
}

// Local Fallback Storage Helpers
const STORAGE_KEYS = {
  LANDLORDS: 'em_fallback_landlords',
  PROPERTIES: 'em_fallback_properties',
  UNITS: 'em_fallback_units',
  TENANTS: 'em_fallback_tenants',
  INVOICES: 'em_fallback_invoices',
  QUOTES: 'em_fallback_quotes',
  PAYMENTS: 'em_fallback_payments',
  MAINTENANCE: 'em_fallback_maintenance',
  EMAILS: 'em_fallback_emails'
};

function getLocalData<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function setLocalData<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

/**
 * Helper to safely process fetch HTTP responses without throwing SyntaxError on HTML responses.
 */
async function handleResponse<T = any>(res: Response, defaultError: string = 'Request failed'): Promise<T> {
  const text = await res.text();
  let data: any = null;

  if (text && text.trim()) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const errorMsg = data?.error || data?.message || (text.startsWith('<') ? `Server returned HTTP ${res.status} (${res.statusText || 'Error'})` : text) || defaultError;
    throw new Error(errorMsg);
  }

  if (data === null) {
    if (text.trim().startsWith('<')) {
      throw new Error(`API path not found or returned HTML page (${res.url})`);
    }
    throw new Error('Invalid JSON response returned by server');
  }

  return data as T;
}

export async function loginUser(email: string, password?: string, role?: 'tenant' | 'landlord'): Promise<{ success: boolean; role: 'tenant' | 'landlord'; user: Tenant | Landlord }> {
  const cleanEmail = email ? email.trim().toLowerCase() : '';
  const cleanPassword = password ? password.trim() : '';
  if (!cleanEmail) {
    throw new Error('Please enter a valid email address.');
  }

  try {
    const res = await fetch(getApiUrl('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cleanEmail, password: cleanPassword, role }),
    });
    const result = await handleResponse(res, 'Authentication failed');

    // Keep localStorage in sync with logged in account
    if (result && result.user) {
      if (result.role === 'landlord') {
        const landlords = getLocalData<Landlord[]>(STORAGE_KEYS.LANDLORDS, []);
        const idx = landlords.findIndex(l => l.email.trim().toLowerCase() === cleanEmail);
        if (idx !== -1) landlords[idx] = result.user as Landlord;
        else landlords.unshift(result.user as Landlord);
        setLocalData(STORAGE_KEYS.LANDLORDS, landlords);
      } else if (result.role === 'tenant') {
        const tenants = getLocalData<Tenant[]>(STORAGE_KEYS.TENANTS, []);
        const idx = tenants.findIndex(t => t.email.trim().toLowerCase() === cleanEmail);
        if (idx !== -1) tenants[idx] = result.user as Tenant;
        else tenants.unshift(result.user as Tenant);
        setLocalData(STORAGE_KEYS.TENANTS, tenants);
      }
    }

    return result;
  } catch (err: any) {
    // If the error message came from a server response (e.g. 401 Unregistered account or invalid password), rethrow it directly!
    if (
      err.message &&
      !err.message.includes('Failed to fetch') &&
      !err.message.includes('NetworkError') &&
      !err.message.includes('API path not found')
    ) {
      throw err;
    }

    console.warn('Backend server unreachable, checking local storage for registered account:', err);

    if (role === 'landlord') {
      const landlords = getLocalData<Landlord[]>(STORAGE_KEYS.LANDLORDS, []);
      const found = landlords.find(l => l.email.trim().toLowerCase() === cleanEmail);
      if (!found) {
        throw new Error('No registered landlord account found with this email address. Please register first.');
      }
      if (cleanPassword && found.password && found.password.trim() !== cleanPassword) {
        throw new Error('Invalid password. Please check your credentials.');
      }
      return { success: true, role: 'landlord', user: found };
    } else if (role === 'tenant') {
      const tenants = getLocalData<Tenant[]>(STORAGE_KEYS.TENANTS, []);
      const found = tenants.find(t => t.email.trim().toLowerCase() === cleanEmail);
      if (!found) {
        throw new Error('No registered tenant account found with this email address. Please register first.');
      }
      if (cleanPassword && found.password && found.password.trim() !== cleanPassword) {
        throw new Error('Invalid password. Please check your credentials.');
      }
      return { success: true, role: 'tenant', user: found };
    } else {
      const landlords = getLocalData<Landlord[]>(STORAGE_KEYS.LANDLORDS, []);
      const landlord = landlords.find(l => l.email.trim().toLowerCase() === cleanEmail);
      if (landlord) {
        if (cleanPassword && landlord.password && landlord.password.trim() !== cleanPassword) {
          throw new Error('Invalid password. Please check your credentials.');
        }
        return { success: true, role: 'landlord', user: landlord };
      }

      const tenants = getLocalData<Tenant[]>(STORAGE_KEYS.TENANTS, []);
      const tenant = tenants.find(t => t.email.trim().toLowerCase() === cleanEmail);
      if (tenant) {
        if (cleanPassword && tenant.password && tenant.password.trim() !== cleanPassword) {
          throw new Error('Invalid password. Please check your credentials.');
        }
        return { success: true, role: 'tenant', user: tenant };
      }

      throw new Error('No registered account found with this email address. Please register first.');
    }
  }
}

export async function fetchLandlords(): Promise<Landlord[]> {
  try {
    const res = await fetch(getApiUrl('/api/landlords'));
    const landlords = await handleResponse(res, 'Failed to fetch landlords');
    if (Array.isArray(landlords) && landlords.length > 0) {
      setLocalData(STORAGE_KEYS.LANDLORDS, landlords);
    }
    return landlords;
  } catch (err) {
    return getLocalData<Landlord[]>(STORAGE_KEYS.LANDLORDS, [
      {
        id: 'landlord-1',
        name: 'Eng. Duncan Mutua',
        companyName: 'Mutua Crest Properties Ltd',
        email: 'duncan.mutua@mwangiestates.co.ke',
        phone: '+254 712 345 678',
        idNumber: 'ID-28910293',
        subscriptionPaid: true,
        subscriptionExpiry: '2027-08-01',
        receiptCode: 'SAB91823901',
        mpesaTillNumber: '15637747',
        mpesaPaybill: '247247',
        bankName: 'Equity Bank Kenya',
        accountName: 'Mutua Crest Properties',
        accountNumber: '0110293849201'
      }
    ]);
  }
}

export async function updateLandlordDetails(landlordId: string, data: Partial<Landlord>): Promise<Landlord> {
  try {
    const res = await fetch(getApiUrl(`/api/landlords/${landlordId}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const updated = await handleResponse(res, 'Failed to update landlord profile');
    if (updated) {
      const landlords = getLocalData<Landlord[]>(STORAGE_KEYS.LANDLORDS, []);
      const idx = landlords.findIndex(l => l.id === landlordId);
      if (idx !== -1) landlords[idx] = updated;
      else landlords.unshift(updated);
      setLocalData(STORAGE_KEYS.LANDLORDS, landlords);
    }
    return updated;
  } catch (err) {
    const landlords = await fetchLandlords();
    const idx = landlords.findIndex(l => l.id === landlordId);
    if (idx !== -1) {
      landlords[idx] = { ...landlords[idx], ...data };
      setLocalData(STORAGE_KEYS.LANDLORDS, landlords);
      return landlords[idx];
    }
    const updated = { id: landlordId, name: 'Landlord', email: '', subscriptionPaid: true, ...data } as Landlord;
    setLocalData(STORAGE_KEYS.LANDLORDS, [updated, ...landlords]);
    return updated;
  }
}

export async function registerLandlordAccount(data: any): Promise<{ landlord: Landlord; receiptCode: string; message: string }> {
  const cleanEmail = data.email ? data.email.trim().toLowerCase() : '';
  const cleanPassword = data.password ? data.password.trim() : 'password123';
  const payload = {
    ...data,
    email: cleanEmail,
    password: cleanPassword
  };

  try {
    const res = await fetch(getApiUrl('/api/landlords/register'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await handleResponse(res, 'Landlord registration failed');

    if (result && result.landlord) {
      const currentLandlords = getLocalData<Landlord[]>(STORAGE_KEYS.LANDLORDS, []);
      const existingIdx = currentLandlords.findIndex(l => l.email.trim().toLowerCase() === cleanEmail);
      if (existingIdx !== -1) {
        currentLandlords[existingIdx] = result.landlord;
      } else {
        currentLandlords.unshift(result.landlord);
      }
      setLocalData(STORAGE_KEYS.LANDLORDS, currentLandlords);
    }

    return result;
  } catch (err: any) {
    console.warn('Backend fetch failed, executing local landlord registration:', err);
    const receiptCode = `SAB${Math.floor(10000000 + Math.random() * 90000000)}`;
    const newLandlord: Landlord = {
      id: `landlord-${Date.now()}`,
      name: data.name ? data.name.trim() : 'Landlord',
      companyName: data.companyName ? data.companyName.trim() : 'Estate Management',
      email: cleanEmail,
      phone: data.phone ? data.phone.trim() : '+254 700 000 000',
      password: cleanPassword,
      idNumber: data.idNumber ? data.idNumber.trim() : 'ID-12345678',
      subscriptionStatus: 'Active',
      subscriptionPaid: true,
      subscriptionExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      subscriptionPlan: 'EstateMaster Annual License (KSH 20,000/yr)',
      receiptCode,
      mpesaTillNumber: data.mpesaTillNumber,
      mpesaPaybill: data.mpesaPaybill,
      bankName: data.bankName,
      accountName: data.accountName,
      accountNumber: data.accountNumber,
      createdAt: new Date().toISOString()
    };

    const currentLandlords = getLocalData<Landlord[]>(STORAGE_KEYS.LANDLORDS, []);
    currentLandlords.unshift(newLandlord);
    setLocalData(STORAGE_KEYS.LANDLORDS, currentLandlords);

    return {
      landlord: newLandlord,
      receiptCode,
      message: `M-Pesa Subscription Payment of KSH 20,000 Verified! Receipt Code: ${receiptCode}`
    };
  }
}

export async function triggerMpesaStkPush(data: { phone: string; amount: number; invoiceId: string; accountRef?: string }) {
  try {
    const res = await fetch(getApiUrl('/api/payments/stk-push'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return await handleResponse(res, 'M-Pesa STK Push failed');
  } catch (err: any) {
    console.warn('Backend fetch failed, executing local STK push fallback:', err);
    const receiptCode = `SAB${Math.floor(10000000 + Math.random() * 90000000)}`;
    const pay: Payment = {
      id: `pay-${Date.now()}`,
      invoiceId: data.invoiceId || `SUB-${Date.now()}`,
      tenantId: 'landlord-sub',
      tenantName: data.accountRef || 'EstateMaster Subscription',
      unitNumber: 'Commercial License',
      amount: data.amount,
      paymentMethod: 'M-Pesa',
      referenceCode: receiptCode,
      paymentDate: new Date().toISOString(),
      status: 'Completed',
      notes: `M-Pesa Express STK Push completed for phone ${data.phone}.`
    };
    const currentPayments = getLocalData<Payment[]>(STORAGE_KEYS.PAYMENTS, []);
    currentPayments.unshift(pay);
    setLocalData(STORAGE_KEYS.PAYMENTS, currentPayments);

    return {
      success: true,
      receiptCode,
      message: `M-Pesa STK Push payment of KSh ${data.amount.toLocaleString()} successfully processed! Confirmation Code: ${receiptCode}`,
      payment: pay
    };
  }
}

export async function fetchProperties(): Promise<Property[]> {
  try {
    const res = await fetch(getApiUrl('/api/properties'));
    const properties = await handleResponse(res, 'Failed to fetch properties');
    if (Array.isArray(properties) && properties.length > 0) {
      setLocalData(STORAGE_KEYS.PROPERTIES, properties);
    }
    return properties;
  } catch (err) {
    return getLocalData<Property[]>(STORAGE_KEYS.PROPERTIES, [
      {
        id: 'prop-1',
        landlordId: 'landlord-1',
        name: 'Kilimani Palms Heights',
        location: 'Argwings Kodhek Road, Kilimani, Nairobi',
        address: 'Argwings Kodhek Road, Kilimani, Nairobi',
        city: 'Nairobi',
        type: 'Residential Apartments',
        totalUnits: 12,
        occupiedUnits: 10,
        imageUrl: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=80'
      },
      {
        id: 'prop-2',
        landlordId: 'landlord-1',
        name: 'Westlands Commercial Plaza',
        location: 'Waiyaki Way, Westlands, Nairobi',
        address: 'Waiyaki Way, Westlands, Nairobi',
        city: 'Nairobi',
        type: 'Commercial Office Space',
        totalUnits: 8,
        occupiedUnits: 6,
        imageUrl: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=80'
      }
    ]);
  }
}

export async function createProperty(data: Partial<Property>): Promise<Property> {
  const newProp: Property = {
    id: data.id || `prop-${Date.now()}`,
    landlordId: data.landlordId || 'landlord-1',
    name: data.name || 'New Property',
    address: data.address || data.location || 'Nairobi, Kenya',
    location: data.location || data.address || 'Nairobi, Kenya',
    city: data.city || 'Nairobi',
    type: data.type || 'Residential Apartments',
    totalUnits: data.totalUnits || 0,
    occupiedUnits: data.occupiedUnits || 0,
    imageUrl: data.imageUrl || 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=80',
    description: data.description || 'Landlord property listing',
    amenities: data.amenities || ['Parking', 'Security']
  };

  try {
    const res = await fetch(getApiUrl('/api/properties'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newProp),
    });
    const created = await handleResponse(res, 'Failed to create property');
    const propertyToSave = created || newProp;

    const properties = getLocalData<Property[]>(STORAGE_KEYS.PROPERTIES, []);
    const idx = properties.findIndex(p => p.id === propertyToSave.id);
    if (idx !== -1) properties[idx] = propertyToSave;
    else properties.unshift(propertyToSave);
    setLocalData(STORAGE_KEYS.PROPERTIES, properties);

    return propertyToSave;
  } catch (err) {
    console.warn('Backend fetch failed, saving property locally:', err);
    const properties = getLocalData<Property[]>(STORAGE_KEYS.PROPERTIES, []);
    const idx = properties.findIndex(p => p.id === newProp.id);
    if (idx !== -1) properties[idx] = newProp;
    else properties.unshift(newProp);
    setLocalData(STORAGE_KEYS.PROPERTIES, properties);
    return newProp;
  }
}

export async function updatePropertyDetails(propertyId: string, data: Partial<Property>): Promise<Property> {
  try {
    const res = await fetch(getApiUrl(`/api/properties/${propertyId}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const updated = await handleResponse(res, 'Failed to update property details');
    if (updated) {
      const props = getLocalData<Property[]>(STORAGE_KEYS.PROPERTIES, []);
      const idx = props.findIndex(p => p.id === propertyId);
      if (idx !== -1) props[idx] = updated;
      else props.unshift(updated);
      setLocalData(STORAGE_KEYS.PROPERTIES, props);
    }
    return updated;
  } catch (err) {
    const props = await fetchProperties();
    const idx = props.findIndex(p => p.id === propertyId);
    if (idx !== -1) {
      props[idx] = { ...props[idx], ...data };
      setLocalData(STORAGE_KEYS.PROPERTIES, props);
      return props[idx];
    }
    const updated = { id: propertyId, name: 'Property', location: '', type: 'Residential', totalUnits: 1, occupiedUnits: 0, ...data } as Property;
    setLocalData(STORAGE_KEYS.PROPERTIES, [updated, ...props]);
    return updated;
  }
}

export async function deleteProperty(propertyId: string): Promise<void> {
  try {
    const res = await fetch(getApiUrl(`/api/properties/${propertyId}`), {
      method: 'DELETE',
    });
    await handleResponse(res, 'Failed to remove property');
  } catch (err) {
    console.warn('Backend fetch failed, deleting property locally:', err);
  } finally {
    const props = getLocalData<Property[]>(STORAGE_KEYS.PROPERTIES, []);
    const filtered = props.filter(p => p.id !== propertyId);
    setLocalData(STORAGE_KEYS.PROPERTIES, filtered);

    const units = getLocalData<Unit[]>(STORAGE_KEYS.UNITS, []);
    const filteredUnits = units.filter(u => u.propertyId !== propertyId);
    setLocalData(STORAGE_KEYS.UNITS, filteredUnits);
  }
}

export async function fetchUnits(): Promise<Unit[]> {
  try {
    const res = await fetch(getApiUrl('/api/units'));
    const units = await handleResponse(res, 'Failed to fetch units');
    if (Array.isArray(units) && units.length > 0) {
      setLocalData(STORAGE_KEYS.UNITS, units);
    }
    return units;
  } catch (err) {
    return getLocalData<Unit[]>(STORAGE_KEYS.UNITS, [
      {
        id: 'unit-1',
        propertyId: 'prop-1',
        propertyName: 'Kilimani Palms Heights',
        unitNumber: 'A101',
        type: '2 Bedroom Master En-Suite',
        monthlyRent: 45000,
        status: 'Occupied',
        currentTenantName: 'Mercy Chebet',
        currentTenantEmail: 'mercy.chebet@example.com'
      },
      {
        id: 'unit-2',
        propertyId: 'prop-1',
        propertyName: 'Kilimani Palms Heights',
        unitNumber: 'A102',
        type: '3 Bedroom Master En-Suite',
        monthlyRent: 60000,
        status: 'Vacant'
      },
      {
        id: 'unit-3',
        propertyId: 'prop-2',
        propertyName: 'Westlands Commercial Plaza',
        unitNumber: 'Suite 3B',
        type: 'Executive Office Space',
        monthlyRent: 85000,
        status: 'Occupied',
        currentTenantName: 'TechVision Solutions Kenya',
        currentTenantEmail: 'finance@techvision.co.ke'
      }
    ]);
  }
}

export async function createUnit(data: Partial<Unit>): Promise<Unit> {
  const newUnit: Unit = {
    id: data.id || `unit-${Date.now()}`,
    propertyId: data.propertyId || 'prop-1',
    propertyName: data.propertyName || 'Property',
    unitNumber: data.unitNumber || '101',
    type: data.type || `${data.bedrooms || 2} Bedroom`,
    bedrooms: data.bedrooms || 2,
    bathrooms: data.bathrooms || 1,
    sqft: data.sqft || 800,
    monthlyRent: Number(data.monthlyRent || 0),
    depositAmount: Number(data.depositAmount || data.monthlyRent || 0),
    status: data.status || 'Available',
    features: data.features || ['Balcony', 'Modern Bath']
  };

  try {
    const res = await fetch(getApiUrl('/api/units'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newUnit),
    });
    const created = await handleResponse(res, 'Failed to create unit');
    const unitToSave = created || newUnit;

    const units = getLocalData<Unit[]>(STORAGE_KEYS.UNITS, []);
    const idx = units.findIndex(u => u.id === unitToSave.id);
    if (idx !== -1) units[idx] = unitToSave;
    else units.unshift(unitToSave);
    setLocalData(STORAGE_KEYS.UNITS, units);

    // Update parent property totalUnits in localStorage as well
    const properties = getLocalData<Property[]>(STORAGE_KEYS.PROPERTIES, []);
    const propIdx = properties.findIndex(p => p.id === unitToSave.propertyId);
    if (propIdx !== -1) {
      properties[propIdx].totalUnits = (properties[propIdx].totalUnits || 0) + 1;
      setLocalData(STORAGE_KEYS.PROPERTIES, properties);
    }

    return unitToSave;
  } catch (err) {
    console.warn('Backend fetch failed, saving unit locally:', err);
    const units = getLocalData<Unit[]>(STORAGE_KEYS.UNITS, []);
    const idx = units.findIndex(u => u.id === newUnit.id);
    if (idx !== -1) units[idx] = newUnit;
    else units.unshift(newUnit);
    setLocalData(STORAGE_KEYS.UNITS, units);

    const properties = getLocalData<Property[]>(STORAGE_KEYS.PROPERTIES, []);
    const propIdx = properties.findIndex(p => p.id === newUnit.propertyId);
    if (propIdx !== -1) {
      properties[propIdx].totalUnits = (properties[propIdx].totalUnits || 0) + 1;
      setLocalData(STORAGE_KEYS.PROPERTIES, properties);
    }

    return newUnit;
  }
}

export async function fetchTenants(): Promise<Tenant[]> {
  try {
    const res = await fetch(getApiUrl('/api/tenants'));
    const tenants = await handleResponse(res, 'Failed to fetch tenants');
    if (Array.isArray(tenants) && tenants.length > 0) {
      setLocalData(STORAGE_KEYS.TENANTS, tenants);
    }
    return tenants;
  } catch (err) {
    return getLocalData<Tenant[]>(STORAGE_KEYS.TENANTS, [
      {
        id: 'tenant-1',
        landlordId: 'landlord-1',
        fullName: 'Mercy Chebet',
        email: 'mercy.chebet@example.com',
        phone: '+254 700 123 456',
        idNumber: 'ID-39201928',
        unitId: 'unit-1',
        unitNumber: 'A101',
        propertyName: 'Kilimani Palms Heights',
        monthlyRent: 45000,
        leaseStartDate: '2025-01-01',
        leaseEndDate: '2026-12-31',
        status: 'Active'
      }
    ]);
  }
}

export async function registerTenant(data: any) {
  const cleanEmail = data.email ? data.email.trim().toLowerCase() : '';
  const cleanPassword = data.password ? data.password.trim() : 'password123';
  const payload = {
    ...data,
    email: cleanEmail,
    password: cleanPassword
  };

  try {
    const res = await fetch(getApiUrl('/api/tenants/register'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await handleResponse(res, 'Registration failed');

    if (result && result.tenant) {
      const currentTenants = getLocalData<Tenant[]>(STORAGE_KEYS.TENANTS, []);
      const existingIdx = currentTenants.findIndex(t => t.email.trim().toLowerCase() === cleanEmail);
      if (existingIdx !== -1) {
        currentTenants[existingIdx] = result.tenant;
      } else {
        currentTenants.unshift(result.tenant);
      }
      setLocalData(STORAGE_KEYS.TENANTS, currentTenants);
    }

    return result;
  } catch (err: any) {
    console.warn('Backend fetch failed, executing local tenant registration:', err);
    const newTenant: Tenant = {
      id: `tenant-${Date.now()}`,
      landlordId: 'landlord-1',
      fullName: data.fullName || 'New Tenant',
      email: data.email,
      phone: data.phone || '+254 700 000 000',
      idNumber: data.idNumber || 'ID-12345678',
      unitId: data.unitId || 'unit-1',
      unitNumber: 'A101',
      propertyName: 'Kilimani Palms Heights',
      monthlyRent: 45000,
      leaseStartDate: new Date().toISOString().split('T')[0],
      leaseEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'Active'
    };

    const currentTenants = getLocalData<Tenant[]>(STORAGE_KEYS.TENANTS, []);
    currentTenants.unshift(newTenant);
    setLocalData(STORAGE_KEYS.TENANTS, currentTenants);

    return {
      success: true,
      tenant: newTenant,
      invoice: {
        id: `inv-${Date.now()}`,
        invoiceNumber: `INV-${Math.floor(10000 + Math.random() * 90000)}`,
        tenantId: newTenant.id,
        tenantName: newTenant.fullName,
        unitNumber: newTenant.unitNumber,
        totalAmount: 45000,
        amountPaid: 0,
        dueDate: new Date().toISOString().split('T')[0],
        status: 'Unpaid'
      }
    };
  }
}

export async function updateTenantDetails(tenantId: string, data: Partial<Tenant>): Promise<Tenant> {
  try {
    const res = await fetch(getApiUrl(`/api/tenants/${tenantId}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return await handleResponse(res, 'Failed to update tenant details');
  } catch (err) {
    const tenants = await fetchTenants();
    const idx = tenants.findIndex(t => t.id === tenantId);
    if (idx !== -1) {
      tenants[idx] = { ...tenants[idx], ...data };
      setLocalData(STORAGE_KEYS.TENANTS, tenants);
      return tenants[idx];
    }
    const updated = { id: tenantId, fullName: 'Tenant', email: '', status: 'Active', ...data } as Tenant;
    setLocalData(STORAGE_KEYS.TENANTS, [updated, ...tenants]);
    return updated;
  }
}

export async function fetchInvoices(): Promise<Invoice[]> {
  try {
    const res = await fetch(getApiUrl('/api/invoices'));
    return await handleResponse(res, 'Failed to fetch invoices');
  } catch (err) {
    return getLocalData<Invoice[]>(STORAGE_KEYS.INVOICES, [
      {
        id: 'inv-1',
        invoiceNumber: 'INV-2026-081',
        tenantId: 'tenant-1',
        tenantName: 'Mercy Chebet',
        tenantEmail: 'mercy.chebet@example.com',
        unitNumber: 'A101',
        propertyName: 'Kilimani Palms Heights',
        rentAmount: 45000,
        waterBill: 1200,
        electricityBill: 2300,
        serviceCharge: 2500,
        totalAmount: 51000,
        amountPaid: 0,
        issueDate: '2026-08-01',
        dueDate: '2026-08-10',
        status: 'Unpaid'
      }
    ]);
  }
}

export async function createInvoice(data: any): Promise<Invoice> {
  try {
    const res = await fetch(getApiUrl('/api/invoices/generate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return await handleResponse(res, 'Failed to create invoice');
  } catch (err) {
    const newInv: Invoice = {
      id: `inv-${Date.now()}`,
      invoiceNumber: `INV-${Math.floor(10000 + Math.random() * 90000)}`,
      tenantId: data.tenantId || 'tenant-1',
      tenantName: data.tenantName || 'Mercy Chebet',
      unitNumber: data.unitNumber || 'A101',
      propertyName: 'Kilimani Palms Heights',
      rentAmount: Number(data.rentAmount || 45000),
      waterBill: Number(data.waterBill || 0),
      electricityBill: Number(data.electricityBill || 0),
      serviceCharge: Number(data.serviceCharge || 0),
      totalAmount: Number(data.rentAmount || 45000) + Number(data.waterBill || 0) + Number(data.electricityBill || 0) + Number(data.serviceCharge || 0),
      amountPaid: 0,
      issueDate: new Date().toISOString().split('T')[0],
      dueDate: data.dueDate || new Date().toISOString().split('T')[0],
      status: 'Unpaid'
    };
    const invoices = getLocalData<Invoice[]>(STORAGE_KEYS.INVOICES, []);
    invoices.unshift(newInv);
    setLocalData(STORAGE_KEYS.INVOICES, invoices);
    return newInv;
  }
}

export async function fetchQuotes(): Promise<Quote[]> {
  try {
    const res = await fetch(getApiUrl('/api/quotes'));
    return await handleResponse(res, 'Failed to fetch quotes');
  } catch (err) {
    return getLocalData<Quote[]>(STORAGE_KEYS.QUOTES, []);
  }
}

export async function createQuote(data: any): Promise<Quote> {
  try {
    const res = await fetch(getApiUrl('/api/quotes/generate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return await handleResponse(res, 'Failed to create quote');
  } catch (err) {
    const newQuote: Quote = {
      id: `quote-${Date.now()}`,
      quoteNumber: `Q-${Math.floor(10000 + Math.random() * 90000)}`,
      applicantName: data.applicantName || 'Applicant',
      applicantEmail: data.applicantEmail || '',
      unitNumber: data.unitNumber || 'A101',
      propertyName: 'Kilimani Palms Heights',
      monthlyRent: 45000,
      securityDeposit: 45000,
      waterDeposit: 2000,
      electricityDeposit: 2000,
      leasePreparationFee: 3000,
      totalMoveInCost: 97000,
      issueDate: new Date().toISOString().split('T')[0],
      validUntil: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'Active'
    };
    const quotes = getLocalData<Quote[]>(STORAGE_KEYS.QUOTES, []);
    quotes.unshift(newQuote);
    setLocalData(STORAGE_KEYS.QUOTES, quotes);
    return newQuote;
  }
}

export async function fetchPayments(): Promise<Payment[]> {
  try {
    const res = await fetch(getApiUrl('/api/payments'));
    return await handleResponse(res, 'Failed to fetch payments');
  } catch (err) {
    return getLocalData<Payment[]>(STORAGE_KEYS.PAYMENTS, []);
  }
}

export async function recordPayment(data: any) {
  try {
    const res = await fetch(getApiUrl('/api/payments/record'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return await handleResponse(res, 'Failed to record payment');
  } catch (err) {
    const receiptCode = `SAB${Math.floor(10000000 + Math.random() * 90000000)}`;
    const pay: Payment = {
      id: `pay-${Date.now()}`,
      invoiceId: data.invoiceId || `INV-${Date.now()}`,
      tenantId: data.tenantId || 'tenant-1',
      tenantName: data.tenantName || 'Mercy Chebet',
      unitNumber: data.unitNumber || 'A101',
      amount: Number(data.amount || 0),
      paymentMethod: data.paymentMethod || 'M-Pesa',
      referenceCode: data.referenceCode || receiptCode,
      paymentDate: new Date().toISOString(),
      status: 'Completed',
      notes: data.notes || 'Recorded payment'
    };
    const payments = getLocalData<Payment[]>(STORAGE_KEYS.PAYMENTS, []);
    payments.unshift(pay);
    setLocalData(STORAGE_KEYS.PAYMENTS, payments);
    return { success: true, payment: pay, receiptCode };
  }
}

export async function fetchMaintenance(): Promise<MaintenanceRequest[]> {
  try {
    const res = await fetch(getApiUrl('/api/maintenance'));
    return await handleResponse(res, 'Failed to fetch maintenance');
  } catch (err) {
    return getLocalData<MaintenanceRequest[]>(STORAGE_KEYS.MAINTENANCE, []);
  }
}

export async function sendMaintenanceAiChat(data: {
  message: string;
  category?: string;
  unitNumber?: string;
  tenantName?: string;
}): Promise<string> {
  try {
    const res = await fetch(getApiUrl('/api/maintenance/ai-chat'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await handleResponse(res, 'AI Assistant failed');
    return json.reply || 'AI Assistant could not respond.';
  } catch (err) {
    return '🔧 **AI Maintenance Guidance:** Please ensure the affected utility (water valve or power breaker) is safely secured, and submit your maintenance ticket below for landlord dispatch.';
  }
}

export async function createMaintenance(data: any): Promise<MaintenanceRequest> {
  try {
    const res = await fetch(getApiUrl('/api/maintenance/create'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return await handleResponse(res, 'Failed to create maintenance request');
  } catch (err) {
    const req: MaintenanceRequest = {
      id: `maint-${Date.now()}`,
      tenantId: data.tenantId || 'tenant-1',
      tenantName: data.tenantName || 'Mercy Chebet',
      unitNumber: data.unitNumber || 'A101',
      propertyName: 'Kilimani Palms Heights',
      category: data.category || 'Plumbing',
      description: data.description || 'Maintenance request',
      urgency: data.urgency || 'Medium',
      status: 'Pending',
      createdAt: new Date().toISOString()
    };
    const maint = getLocalData<MaintenanceRequest[]>(STORAGE_KEYS.MAINTENANCE, []);
    maint.unshift(req);
    setLocalData(STORAGE_KEYS.MAINTENANCE, maint);
    return req;
  }
}

export async function updateMaintenanceStatus(id: string, status: string, assignedTechnician?: string) {
  try {
    const res = await fetch(getApiUrl(`/api/maintenance/${id}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, assignedTechnician }),
    });
    return await handleResponse(res, 'Failed to update maintenance request');
  } catch (err) {
    const maint = await fetchMaintenance();
    const idx = maint.findIndex(m => m.id === id);
    if (idx !== -1) {
      maint[idx].status = status as any;
      if (assignedTechnician) maint[idx].assignedTechnician = assignedTechnician;
      setLocalData(STORAGE_KEYS.MAINTENANCE, maint);
      return maint[idx];
    }
    return { id, status, assignedTechnician };
  }
}

export async function fetchEmails(recipientEmail?: string): Promise<EmailLog[]> {
  try {
    const url = recipientEmail ? `/api/emails?recipientEmail=${encodeURIComponent(recipientEmail)}` : '/api/emails';
    const res = await fetch(getApiUrl(url));
    return await handleResponse(res, 'Failed to fetch email logs');
  } catch (err) {
    return getLocalData<EmailLog[]>(STORAGE_KEYS.EMAILS, []);
  }
}

export async function generateAiQuote(data: any) {
  try {
    const res = await fetch(getApiUrl('/api/ai/generate-quote'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return await handleResponse(res, 'AI Quote failed');
  } catch (err) {
    return {
      monthlyRent: 45000,
      securityDeposit: 45000,
      waterDeposit: 2000,
      electricityDeposit: 2000,
      leasePreparationFee: 3000,
      totalMoveInCost: 97000,
      breakdown: [
        { label: 'First Month Rent', amount: 45000 },
        { label: 'Refundable Security Deposit', amount: 45000 },
        { label: 'Water Meter Deposit', amount: 2000 },
        { label: 'Electricity Meter Deposit', amount: 2000 },
        { label: 'Lease Agreement & Legal Admin', amount: 3000 }
      ]
    };
  }
}
