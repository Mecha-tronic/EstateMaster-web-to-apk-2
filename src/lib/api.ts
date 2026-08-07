import { Property, Unit, Tenant, Invoice, Quote, Payment, MaintenanceRequest, EmailLog, Landlord } from '../types';

export async function loginUser(email: string, password?: string, role?: 'tenant' | 'landlord'): Promise<{ success: boolean; role: 'tenant' | 'landlord'; user: Tenant | Landlord }> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, role }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Authentication failed');
  }
  return res.json();
}

export async function fetchLandlords(): Promise<Landlord[]> {
  const res = await fetch('/api/landlords');
  if (!res.ok) throw new Error('Failed to fetch landlords');
  return res.json();
}

export async function updateLandlordDetails(landlordId: string, data: Partial<Landlord>): Promise<Landlord> {
  const res = await fetch(`/api/landlords/${landlordId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update landlord profile');
  return res.json();
}

export async function registerLandlordAccount(data: any): Promise<{ landlord: Landlord; receiptCode: string; message: string }> {
  const res = await fetch('/api/landlords/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Landlord registration failed');
  }
  return res.json();
}

export async function triggerMpesaStkPush(data: { phone: string; amount: number; invoiceId: string; accountRef?: string }) {
  const res = await fetch('/api/payments/stk-push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'M-Pesa STK Push failed');
  }
  return res.json();
}

export async function fetchProperties(): Promise<Property[]> {
  const res = await fetch('/api/properties');
  if (!res.ok) throw new Error('Failed to fetch properties');
  return res.json();
}

export async function updatePropertyDetails(propertyId: string, data: Partial<Property>): Promise<Property> {
  const res = await fetch(`/api/properties/${propertyId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update property details');
  return res.json();
}

export async function deleteProperty(propertyId: string): Promise<void> {
  const res = await fetch(`/api/properties/${propertyId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to remove property');
  }
}

export async function fetchUnits(): Promise<Unit[]> {
  const res = await fetch('/api/units');
  if (!res.ok) throw new Error('Failed to fetch units');
  return res.json();
}

export async function fetchTenants(): Promise<Tenant[]> {
  const res = await fetch('/api/tenants');
  if (!res.ok) throw new Error('Failed to fetch tenants');
  return res.json();
}

export async function registerTenant(data: any) {
  const res = await fetch('/api/tenants/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Registration failed');
  }
  return res.json();
}

export async function updateTenantDetails(tenantId: string, data: Partial<Tenant>): Promise<Tenant> {
  const res = await fetch(`/api/tenants/${tenantId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update tenant details');
  return res.json();
}

export async function fetchInvoices(): Promise<Invoice[]> {
  const res = await fetch('/api/invoices');
  if (!res.ok) throw new Error('Failed to fetch invoices');
  return res.json();
}

export async function createInvoice(data: any): Promise<Invoice> {
  const res = await fetch('/api/invoices/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create invoice');
  return res.json();
}

export async function fetchQuotes(): Promise<Quote[]> {
  const res = await fetch('/api/quotes');
  if (!res.ok) throw new Error('Failed to fetch quotes');
  return res.json();
}

export async function createQuote(data: any): Promise<Quote> {
  const res = await fetch('/api/quotes/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create quote');
  return res.json();
}

export async function fetchPayments(): Promise<Payment[]> {
  const res = await fetch('/api/payments');
  if (!res.ok) throw new Error('Failed to fetch payments');
  return res.json();
}

export async function recordPayment(data: any) {
  const res = await fetch('/api/payments/record', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to record payment');
  return res.json();
}

export async function fetchMaintenance(): Promise<MaintenanceRequest[]> {
  const res = await fetch('/api/maintenance');
  if (!res.ok) throw new Error('Failed to fetch maintenance');
  return res.json();
}

export async function createMaintenance(data: any): Promise<MaintenanceRequest> {
  const res = await fetch('/api/maintenance/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create maintenance request');
  return res.json();
}

export async function updateMaintenanceStatus(id: string, status: string, assignedTechnician?: string) {
  const res = await fetch(`/api/maintenance/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, assignedTechnician }),
  });
  if (!res.ok) throw new Error('Failed to update maintenance request');
  return res.json();
}

export async function fetchEmails(recipientEmail?: string): Promise<EmailLog[]> {
  const url = recipientEmail ? `/api/emails?recipientEmail=${encodeURIComponent(recipientEmail)}` : '/api/emails';
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch email logs');
  return res.json();
}

export async function generateAiQuote(data: any) {
  const res = await fetch('/api/ai/generate-quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('AI Quote failed');
  return res.json();
}
