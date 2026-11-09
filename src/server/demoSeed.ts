/**
 * DEMO DATA (development only).
 *
 * Loaded only when ENABLE_DEMO_SEED=true and NODE_ENV !== 'production'.
 * Accounts receive a RANDOM one-time password printed once to the server log, so no
 * well-known credential (the old "password123") can ever exist on a running system.
 */
import crypto from 'crypto';
import type {
  Property, Unit, Tenant, Invoice, Quote, Payment, MaintenanceRequest, EmailLog, Landlord
} from '../types.js';
import { createPasswordCredential } from '../lib/security.js';
import { getStore } from './store.js';
import { COLLECTIONS } from './db.js';

const landlords: Landlord[] = [
  {
    id: 'landlord-1',
    name: 'Eng. James Mwangi',
    companyName: 'Mwangi Premier Estates Ltd',
    email: 'james.mwangi@mwangiestates.co.ke',
    phone: '+254 712 345 678',
    idNumber: 'ID-28193021',
    subscriptionStatus: 'Active',
    subscriptionExpiry: '2027-08-01',
    subscriptionPlan: 'EstateMaster Annual License (KSH 20,000/yr)',
    registeredAt: '2026-08-01T08:00:00.000Z',
    mpesaPaybill: '247247',
    mpesaTillNumber: '781920',
    mpesaPhoneNumber: '+254 712 345 678',
    bankName: 'Equity Bank Kenya',
    accountName: 'Mwangi Premier Estates Ltd',
    accountNumber: '0110293847561',
    branchName: 'Westlands Branch',
    swiftCode: 'EQBLKENA'
  },
  {
    id: 'landlord-2',
    name: 'Dr. Sarah Chebet',
    companyName: 'Chebet Heights Properties',
    email: 'sarah.chebet@chebetheights.co.ke',
    phone: '+254 722 987 654',
    idNumber: 'ID-19820391',
    subscriptionStatus: 'Active',
    subscriptionExpiry: '2027-08-01',
    subscriptionPlan: 'EstateMaster Annual License (KSH 20,000/yr)',
    registeredAt: '2026-08-02T10:00:00.000Z',
    mpesaPaybill: '522522',
    mpesaTillNumber: '409123',
    mpesaPhoneNumber: '+254 722 987 654',
    bankName: 'KCB Bank Kenya',
    accountName: 'Chebet Heights Ltd',
    accountNumber: '11829304958',
    branchName: 'Kilimani Branch',
    swiftCode: 'KCBLKENA'
  },
  {
    id: 'landlord-3',
    name: 'Hassan Abdalla',
    companyName: 'Coast Skyline Investments',
    email: 'hassan.abdalla@coastskyline.co.ke',
    phone: '+254 733 111 222',
    idNumber: 'ID-39102938',
    subscriptionStatus: 'Active',
    subscriptionExpiry: '2027-08-01',
    subscriptionPlan: 'EstateMaster Annual License (KSH 20,000/yr)',
    registeredAt: '2026-08-03T12:00:00.000Z',
    mpesaPaybill: '400200',
    mpesaTillNumber: '601928',
    mpesaPhoneNumber: '+254 733 111 222',
    bankName: 'NCBA Bank Kenya',
    accountName: 'Coast Skyline Investments',
    accountNumber: '7729102938',
    branchName: 'Upperhill Branch',
    swiftCode: 'CBAFKENA'
  },
  {
    id: 'landlord-raha',
    name: 'Allan (Raha)',
    companyName: 'Raha Estate Management',
    email: 'mk@gmail.com',
    phone: '+254 712 000 111',
    idNumber: 'ID-38291049',
    subscriptionStatus: 'Active',
    subscriptionExpiry: '2027-08-01',
    subscriptionPlan: 'EstateMaster Annual License (KSH 20,000/yr)',
    registeredAt: '2026-08-01T08:00:00.000Z',
    mpesaPaybill: '247247',
    mpesaTillNumber: '882910',
    mpesaPhoneNumber: '+254 712 000 111',
    bankName: 'Equity Bank Kenya',
    accountName: 'Raha Estate Management',
    accountNumber: '0110992837410',
    branchName: 'Nairobi Main Branch',
    swiftCode: 'EQBLKENA'
  },
  {
    id: 'landlord-1786370548593',
    name: 'Allan Mokua',
    companyName: 'EstateMaster Premier Group',
    email: 'mokuaallan89@gmail.com',
    phone: '+254 746 549 710',
    idNumber: 'ID-38291049',
    subscriptionStatus: 'Active',
    subscriptionExpiry: '2028-08-01',
    subscriptionPlan: 'EstateMaster Enterprise License (KSH 20,000/yr)',
    registeredAt: '2026-08-01T08:00:00.000Z',
    twoFactorEnabled: false,
    mpesaPaybill: '247247',
    mpesaTillNumber: '882910',
    mpesaPhoneNumber: '+254 746 549 710',
    bankName: 'Equity Bank Kenya',
    accountName: 'EstateMaster Premier Group',
    accountNumber: '0110992837410',
    branchName: 'Nairobi Main Branch',
    swiftCode: 'EQBLKENA'
  },
  {
    id: 'landlord-js',
    name: 'J.S. Properties (Allan)',
    companyName: 'JS Premier Properties',
    email: 'js@gmail.com',
    phone: '+254 746 549 710',
    idNumber: 'ID-49201928',
    subscriptionStatus: 'Active',
    subscriptionExpiry: '2027-09-15',
    subscriptionPlan: 'EstateMaster Annual License (KSH 20,000/yr)',
    registeredAt: '2026-08-01T08:00:00.000Z',
    mpesaPaybill: '247247',
    mpesaTillNumber: '781920',
    mpesaPhoneNumber: '+254 746 549 710',
    bankName: 'Equity Bank Kenya',
    accountName: 'JS Premier Properties',
    accountNumber: '0110293847561',
    branchName: 'Westlands Branch',
    swiftCode: 'EQBLKENA'
  }
];

// Seed In-Memory Database
const properties: Property[] = [
  {
    id: 'prop-1',
    landlordId: 'landlord-1',
    name: 'Highland Park Apartments',
    address: '452 Parklands Road',
    city: 'Nairobi',
    type: 'Apartment Building',
    totalUnits: 12,
    imageUrl: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=80',
    description: 'Modern urban complex with high-speed fiber internet, 24/7 security, backup generator, borehole, and swimming pool.',
    amenities: ['Elevator', '24/7 Security', 'Gym', 'Parking', 'Fiber Wi-Fi', 'Borehole Water']
  },
  {
    id: 'prop-2',
    landlordId: 'landlord-2',
    name: 'Grandview Executive Suites',
    address: '108 Riverside Drive',
    city: 'Nairobi',
    type: 'Condo',
    totalUnits: 8,
    imageUrl: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80',
    description: 'Luxury high-rise apartments overlooking the river with private balconies and concierge service.',
    amenities: ['Concierge', 'Rooftop Lounge', 'Covered Parking', 'Solar Heating', 'Smart Lock']
  },
  {
    id: 'prop-raha',
    landlordId: 'landlord-raha',
    name: 'Raha Executive Residency',
    address: '540 Ngong Road, Kilimani',
    city: 'Nairobi',
    type: 'Apartment Complex',
    totalUnits: 6,
    imageUrl: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=80',
    description: 'Executive modern residences featuring high-speed fiber internet, 24/7 manned security gate, borehole water, and automatic backup generator.',
    amenities: ['Elevator', '24/7 Security', 'Parking', 'Fiber Wi-Fi', 'Borehole Water']
  }
];

const units: Unit[] = [
  {
    id: 'unit-101',
    propertyId: 'prop-1',
    propertyName: 'Highland Park Apartments',
    unitNumber: 'A101',
    bedrooms: 2,
    bathrooms: 2,
    sqft: 950,
    monthlyRent: 65000,
    depositAmount: 65000,
    status: 'Occupied',
    features: ['Balcony', 'En-suite Master', 'Granite Countertops']
  },
  {
    id: 'unit-102',
    propertyId: 'prop-1',
    propertyName: 'Highland Park Apartments',
    unitNumber: 'A102',
    bedrooms: 1,
    bathrooms: 1,
    sqft: 620,
    monthlyRent: 48000,
    depositAmount: 48000,
    status: 'Available',
    features: ['Open Plan Kitchen', 'Natural Light', 'Built-in Wardrobes']
  },
  {
    id: 'unit-201',
    propertyId: 'prop-1',
    propertyName: 'Highland Park Apartments',
    unitNumber: 'B201',
    bedrooms: 3,
    bathrooms: 2,
    sqft: 1250,
    monthlyRent: 95000,
    depositAmount: 95000,
    status: 'Occupied',
    features: ['Master Suite', 'Pantry', 'Spacious Balcony']
  },
  {
    id: 'unit-301',
    propertyId: 'prop-2',
    propertyName: 'Grandview Executive Suites',
    unitNumber: 'Suite 301',
    bedrooms: 2,
    bathrooms: 2.5,
    sqft: 1100,
    monthlyRent: 120000,
    depositAmount: 120000,
    status: 'Available',
    features: ['River View', 'Smart Lighting', 'Marble Bathrooms']
  }
];

const tenants: Tenant[] = [
  {
    id: 'tenant-1',
    propertyId: 'prop-1',
    unitId: 'unit-101',
    propertyName: 'Highland Park Apartments',
    unitNumber: 'A101',
    fullName: 'Jane Wanjiku',
    email: 'jane.wanjiku@example.com',
    phone: '+254 712 345 678',
    idNumber: 'ID-3891029',
    occupation: 'Software Engineer',
    income: 280000,
    emergencyContactName: 'Peter Wanjiku',
    emergencyContactPhone: '+254 722 987 654',
    moveInDate: '2026-01-15',
    leaseStartDate: '2026-01-15',
    leaseEndDate: '2027-01-14',
    monthlyRent: 65000,
    depositPaid: true,
    status: 'Active',
    profilePictureUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
    registeredAt: '2026-01-10T10:00:00.000Z'
  },
  {
    id: 'tenant-2',
    propertyId: 'prop-1',
    unitId: 'unit-201',
    propertyName: 'Highland Park Apartments',
    unitNumber: 'B201',
    fullName: 'David Omondi',
    email: 'david.omondi@example.com',
    phone: '+254 733 456 789',
    idNumber: 'ID-4512980',
    occupation: 'Financial Analyst',
    income: 380000,
    emergencyContactName: 'Grace Omondi',
    emergencyContactPhone: '+254 711 112 233',
    moveInDate: '2026-03-01',
    leaseStartDate: '2026-03-01',
    leaseEndDate: '2027-02-28',
    monthlyRent: 95000,
    depositPaid: true,
    status: 'Active',
    profilePictureUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
    registeredAt: '2026-02-20T14:30:00.000Z'
  },
  {
    id: 'tenant-js',
    propertyId: 'prop-1',
    unitId: 'unit-102',
    propertyName: 'Highland Park Apartments',
    unitNumber: 'A102',
    fullName: 'Josphine S. (JS)',
    email: 'js@gmail.com',
    phone: '+254 746 549 710',
    idNumber: 'ID-3920182',
    occupation: 'Executive Consultant',
    income: 250000,
    emergencyContactName: 'Allan Mokua',
    emergencyContactPhone: '+254 746 549 710',
    moveInDate: '2026-02-01',
    leaseStartDate: '2026-02-01',
    leaseEndDate: '2027-01-31',
    monthlyRent: 48000,
    depositPaid: true,
    status: 'Active',
    profilePictureUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
    registeredAt: '2026-02-01T10:00:00.000Z'
  }
];

const invoices: Invoice[] = [
  {
    id: 'inv-1001',
    invoiceNumber: 'INV-2026-08-01',
    tenantId: 'tenant-1',
    tenantName: 'Jane Wanjiku',
    tenantEmail: 'jane.wanjiku@example.com',
    unitId: 'unit-101',
    unitNumber: 'A101',
    propertyName: 'Highland Park Apartments',
    issueDate: '2026-08-01',
    dueDate: '2026-08-05',
    periodMonth: 'August 2026',
    rentAmount: 65000,
    waterFee: 2500,
    trashFee: 1500,
    maintenanceFee: 0,
    taxAmount: 0,
    discount: 0,
    totalAmount: 69000,
    status: 'Paid',
    amountPaid: 69000,
    notes: 'Rent + Utility package for August 2026',
    emailedToTenant: true,
    emailSentAt: '2026-08-01T08:00:00.000Z'
  },
  {
    id: 'inv-1002',
    invoiceNumber: 'INV-2026-08-02',
    tenantId: 'tenant-2',
    tenantName: 'David Omondi',
    tenantEmail: 'david.omondi@example.com',
    unitId: 'unit-201',
    unitNumber: 'B201',
    propertyName: 'Highland Park Apartments',
    issueDate: '2026-08-01',
    dueDate: '2026-08-05',
    periodMonth: 'August 2026',
    rentAmount: 95000,
    waterFee: 3500,
    trashFee: 1500,
    maintenanceFee: 2000,
    taxAmount: 0,
    discount: 0,
    totalAmount: 102000,
    status: 'Unpaid',
    amountPaid: 0,
    notes: 'August 2026 Rent & Utilities Statement',
    emailedToTenant: true,
    emailSentAt: '2026-08-01T08:05:00.000Z'
  },
  {
    id: 'inv-js-101',
    invoiceNumber: 'INV-2026-09-JS',
    tenantId: 'tenant-js',
    tenantName: 'Josphine S. (JS)',
    tenantEmail: 'js@gmail.com',
    unitId: 'unit-102',
    unitNumber: 'A102',
    propertyName: 'Highland Park Apartments',
    issueDate: '2026-09-01',
    dueDate: '2026-09-05',
    periodMonth: 'September 2026',
    rentAmount: 48000,
    waterFee: 2000,
    trashFee: 1500,
    maintenanceFee: 0,
    taxAmount: 0,
    discount: 0,
    totalAmount: 51500,
    status: 'Unpaid',
    amountPaid: 0,
    notes: 'September 2026 Rent & Utilities for Unit A102',
    emailedToTenant: true,
    emailSentAt: '2026-09-01T08:00:00.000Z'
  }
];

const quotes: Quote[] = [
  {
    id: 'q-501',
    quoteNumber: 'QTE-2026-089',
    tenantName: 'Samuel Kamau',
    tenantEmail: 'samuel.kamau@example.com',
    tenantPhone: '+254 788 123 456',
    unitId: 'unit-102',
    unitNumber: 'A102',
    propertyName: 'Highland Park Apartments',
    monthlyRentQuote: 48000,
    depositQuote: 48000,
    leaseTermMonths: 12,
    validUntil: '2026-08-20',
    estimatedUtilities: 4000,
    specialDiscount: 2000,
    totalMoveInCost: 94000,
    notes: 'Early move-in special offer (KSh 2,000 monthly discount applied). Includes reserved parking space.',
    status: 'Sent',
    createdAt: '2026-08-02T11:00:00.000Z',
    emailedToTenant: true,
    emailSentAt: '2026-08-02T11:01:00.000Z'
  }
];

const payments: Payment[] = [
  {
    id: 'pay-201',
    invoiceId: 'inv-1001',
    tenantId: 'tenant-1',
    tenantName: 'Jane Wanjiku',
    unitNumber: 'A101',
    amount: 69000,
    paymentMethod: 'M-Pesa',
    referenceCode: 'RK89230192',
    paymentDate: '2026-08-02T14:20:00.000Z',
    status: 'Completed',
    notes: 'Paid via M-Pesa Buy Goods Till 781920'
  }
];

const maintenanceRequests: MaintenanceRequest[] = [
  {
    id: 'maint-301',
    tenantId: 'tenant-1',
    tenantName: 'Jane Wanjiku',
    tenantEmail: 'jane.wanjiku@example.com',
    unitId: 'unit-101',
    unitNumber: 'A101',
    propertyName: 'Highland Park Apartments',
    title: 'Low Water Pressure in Master Bathroom Shower',
    description: 'Since yesterday evening the shower in the master en-suite has very low flow. Kitchen tap is working normally.',
    category: 'Plumbing',
    urgency: 'Medium',
    status: 'In Progress',
    submittedAt: '2026-08-03T09:15:00.000Z',
    aiTriageSummary: 'Non-emergency plumbing issue isolated to master shower head or mixing valve.',
    aiSuggestedDiy: 'Check if the showerhead aerator has mineral buildup. Unscrew counter-clockwise to inspect.',
    aiEstimatedCost: '$40 - $80 (Aerator replacement or valve flushing)',
    assignedTechnician: 'John Plumbers Ltd'
  }
];

const emailLogs: EmailLog[] = [
  {
    id: 'email-1',
    recipientEmail: 'jane.wanjiku@example.com',
    recipientName: 'Jane Wanjiku',
    subject: 'Monthly Rent Invoice #INV-2026-08-01 - Highland Park Apartments',
    bodyHtml: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; rounded: 12px;">
        <h2 style="color: #1e293b; margin-top: 0;">Monthly Rent Invoice Notice</h2>
        <p>Dear Jane Wanjiku,</p>
        <p>Your monthly rent invoice for <strong>August 2026</strong> for unit <strong>A101 (Highland Park Apartments)</strong> has been generated.</p>
        <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <p style="margin: 4px 0;"><strong>Invoice #:</strong> INV-2026-08-01</p>
          <p style="margin: 4px 0;"><strong>Due Date:</strong> August 5, 2026</p>
          <p style="margin: 4px 0;"><strong>Total Due:</strong> $710.00</p>
          <p style="margin: 4px 0; color: #16a34a;"><strong>Status:</strong> Paid ($710.00)</p>
        </div>
        <p>Thank you for your prompt payment!</p>
        <p style="color: #64748b; font-size: 13px;">EstateMaster Property Management</p>
      </div>
    `,
    emailType: 'Invoice',
    sentAt: '2026-08-01T08:00:00.000Z',
    readStatus: true,
    documentId: 'inv-1001'
  },
  {
    id: 'email-2',
    recipientEmail: 'david.omondi@example.com',
    recipientName: 'David Omondi',
    subject: 'Monthly Rent Statement #INV-2026-08-02 - Highland Park Apartments',
    bodyHtml: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; rounded: 12px;">
        <h2 style="color: #1e293b; margin-top: 0;">Monthly Rent Statement Notice</h2>
        <p>Dear David Omondi,</p>
        <p>Please find attached your invoice for <strong>August 2026</strong> for unit <strong>B201</strong>.</p>
        <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <p style="margin: 4px 0;"><strong>Invoice #:</strong> INV-2026-08-02</p>
          <p style="margin: 4px 0;"><strong>Due Date:</strong> August 5, 2026</p>
          <p style="margin: 4px 0;"><strong>Rent:</strong> $950.00</p>
          <p style="margin: 4px 0;"><strong>Utilities:</strong> $75.00</p>
          <p style="margin: 4px 0; font-size: 16px;"><strong>Total Amount:</strong> $1,025.00</p>
        </div>
        <p>You can complete your payment via M-Pesa or Bank Transfer directly from your tenant portal.</p>
        <p style="color: #64748b; font-size: 13px;">EstateMaster Property Management</p>
      </div>
    `,
    emailType: 'Invoice',
    sentAt: '2026-08-01T08:05:00.000Z',
    readStatus: false,
    documentId: 'inv-1002'
  }
];

/**
 * Seeds the demo estate once. Every demo account gets its own random password, logged once.
 * Records that predate per-landlord ownership are stamped with the owning landlord via their property.
 */
export async function seedDemoData(log: (msg: string) => void = console.log): Promise<void> {
  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_DEMO_SEED !== 'true') return;
  const store = getStore();
  if (await store.get('_meta', 'demo_seed_done')) return;
  if ((await store.list(COLLECTIONS.LANDLORDS)).length > 0) return; // never touch a DB with real accounts

  const propLandlord = new Map(properties.map((p) => [p.id, p.landlordId]));
  const tenantLandlord = new Map<string, string | undefined>();

  for (const l of landlords) {
    const pw = crypto.randomBytes(9).toString('base64url');
    const cred = await createPasswordCredential(pw);
    await store.set(COLLECTIONS.LANDLORDS, l.id, { ...l, ...cred, emailLower: l.email.toLowerCase() });
    log(`[demo-seed] landlord ${l.email}  one-time password: ${pw}`);
  }
  for (const p of properties) await store.set(COLLECTIONS.PROPERTIES, p.id, p as any);
  for (const u of units) {
    await store.set(COLLECTIONS.UNITS, u.id, { ...u, landlordId: u.landlordId || propLandlord.get(u.propertyId || '') } as any);
  }
  for (const t of tenants) {
    const landlordId = t.landlordId || propLandlord.get(t.propertyId || '');
    tenantLandlord.set(t.id, landlordId);
    const pw = crypto.randomBytes(9).toString('base64url');
    const cred = await createPasswordCredential(pw);
    await store.set(COLLECTIONS.TENANTS, t.id, { ...t, ...cred, landlordId, emailLower: t.email.toLowerCase() } as any);
    log(`[demo-seed] tenant   ${t.email}  one-time password: ${pw}`);
  }
  for (const i of invoices) {
    await store.set(COLLECTIONS.INVOICES, i.id, { ...i, landlordId: i.landlordId || tenantLandlord.get(i.tenantId) } as any);
  }
  for (const q of quotes) await store.set(COLLECTIONS.QUOTES, q.id, { ...q, landlordId: q.landlordId || propLandlord.get(units.find((u) => u.id === q.unitId)?.propertyId || '') } as any);
  for (const p of payments) {
    await store.set(COLLECTIONS.PAYMENTS, p.id, { ...p, landlordId: p.landlordId || (p.tenantId ? tenantLandlord.get(p.tenantId) : undefined) } as any);
  }
  for (const m of maintenanceRequests) {
    await store.set(COLLECTIONS.MAINTENANCE, m.id, { ...m, landlordId: m.landlordId || (m.tenantId ? tenantLandlord.get(m.tenantId) : undefined) } as any);
  }
  for (const e of emailLogs) await store.set(COLLECTIONS.EMAILS, e.id, e as any);
  await store.set('_meta', 'demo_seed_done', { at: new Date().toISOString() });
}
