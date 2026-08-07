import { Property, Unit, Tenant, Invoice, Quote, Payment, MaintenanceRequest, EmailLog, Landlord } from '../types';

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
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, role }),
  });
  return handleResponse(res, 'Authentication failed');
}

export async function fetchLandlords(): Promise<Landlord[]> {
  const res = await fetch('/api/landlords');
  return handleResponse(res, 'Failed to fetch landlords');
}

export async function updateLandlordDetails(landlordId: string, data: Partial<Landlord>): Promise<Landlord> {
  const res = await fetch(`/api/landlords/${landlordId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse(res, 'Failed to update landlord profile');
}

export async function registerLandlordAccount(data: any): Promise<{ landlord: Landlord; receiptCode: string; message: string }> {
  const res = await fetch('/api/landlords/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse(res, 'Landlord registration failed');
}

export async function triggerMpesaStkPush(data: { phone: string; amount: number; invoiceId: string; accountRef?: string }) {
  const res = await fetch('/api/payments/stk-push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse(res, 'M-Pesa STK Push failed');
}

export async function fetchProperties(): Promise<Property[]> {
  const res = await fetch('/api/properties');
  return handleResponse(res, 'Failed to fetch properties');
}

export async function updatePropertyDetails(propertyId: string, data: Partial<Property>): Promise<Property> {
  const res = await fetch(`/api/properties/${propertyId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse(res, 'Failed to update property details');
}

export async function deleteProperty(propertyId: string): Promise<void> {
  const res = await fetch(`/api/properties/${propertyId}`, {
    method: 'DELETE',
  });
  await handleResponse(res, 'Failed to remove property');
}

export async function fetchUnits(): Promise<Unit[]> {
  const res = await fetch('/api/units');
  return handleResponse(res, 'Failed to fetch units');
}

export async function fetchTenants(): Promise<Tenant[]> {
  const res = await fetch('/api/tenants');
  return handleResponse(res, 'Failed to fetch tenants');
}

export async function registerTenant(data: any) {
  const res = await fetch('/api/tenants/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse(res, 'Registration failed');
}

export async function updateTenantDetails(tenantId: string, data: Partial<Tenant>): Promise<Tenant> {
  const res = await fetch(`/api/tenants/${tenantId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse(res, 'Failed to update tenant details');
}

export async function fetchInvoices(): Promise<Invoice[]> {
  const res = await fetch('/api/invoices');
  return handleResponse(res, 'Failed to fetch invoices');
}

export async function createInvoice(data: any): Promise<Invoice> {
  const res = await fetch('/api/invoices/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse(res, 'Failed to create invoice');
}

export async function fetchQuotes(): Promise<Quote[]> {
  const res = await fetch('/api/quotes');
  return handleResponse(res, 'Failed to fetch quotes');
}

export async function createQuote(data: any): Promise<Quote> {
  const res = await fetch('/api/quotes/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse(res, 'Failed to create quote');
}

export async function fetchPayments(): Promise<Payment[]> {
  const res = await fetch('/api/payments');
  return handleResponse(res, 'Failed to fetch payments');
}

export async function recordPayment(data: any) {
  const res = await fetch('/api/payments/record', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse(res, 'Failed to record payment');
}

export async function fetchMaintenance(): Promise<MaintenanceRequest[]> {
  const res = await fetch('/api/maintenance');
  return handleResponse(res, 'Failed to fetch maintenance');
}

export async function createMaintenance(data: any): Promise<MaintenanceRequest> {
  const res = await fetch('/api/maintenance/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse(res, 'Failed to create maintenance request');
}

export async function updateMaintenanceStatus(id: string, status: string, assignedTechnician?: string) {
  const res = await fetch(`/api/maintenance/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, assignedTechnician }),
  });
  return handleResponse(res, 'Failed to update maintenance request');
}

export async function fetchEmails(recipientEmail?: string): Promise<EmailLog[]> {
  const url = recipientEmail ? `/api/emails?recipientEmail=${encodeURIComponent(recipientEmail)}` : '/api/emails';
  const res = await fetch(url);
  return handleResponse(res, 'Failed to fetch email logs');
}

export async function generateAiQuote(data: any) {
  const res = await fetch('/api/ai/generate-quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse(res, 'AI Quote failed');
}
