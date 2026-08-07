import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import {
  Property,
  Unit,
  Tenant,
  Invoice,
  Quote,
  Payment,
  MaintenanceRequest,
  EmailLog,
  Landlord
} from './src/types.js';

dotenv.config();

// Initialize Gemini Client safely
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

// Seed In-Memory Landlords Database (Multiple Landlords)
const landlords: Landlord[] = [
  {
    id: 'landlord-1',
    name: 'Eng. James Mwangi',
    companyName: 'Mwangi Premier Estates Ltd',
    email: 'james.mwangi@mwangiestates.co.ke',
    phone: '+254 712 345 678',
    password: 'password123',
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
    password: 'password123',
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
    password: 'password123',
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
    password: 'password123',
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
    password: 'password123',
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

async function startServer() {
  const app = express();
  app.use(express.json());

  // --- API ROUTES ---

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // Authentication Sign In Endpoint (Tenant & Landlord)
  app.post('/api/auth/login', (req, res) => {
    try {
      const { email, password, role } = req.body;
      if (!email || !email.trim()) {
        return res.status(400).json({ error: 'Email address is required.' });
      }

      const cleanEmail = email.trim().toLowerCase();

      if (role === 'tenant') {
        const tenant = tenants.find((t) => t.email.toLowerCase() === cleanEmail);
        if (!tenant) {
          return res.status(401).json({ error: 'No tenant account found with this email address.' });
        }
        if (password && tenant.password && tenant.password !== password) {
          return res.status(401).json({ error: 'Invalid password. Please check your credentials.' });
        }
        return res.json({ success: true, role: 'tenant', user: tenant });
      } else if (role === 'landlord') {
        const landlord = landlords.find((l) => l.email.toLowerCase() === cleanEmail);
        if (!landlord) {
          return res.status(401).json({ error: 'No landlord account found with this email address.' });
        }
        if (password && landlord.password && landlord.password !== password) {
          return res.status(401).json({ error: 'Invalid password. Please check your credentials.' });
        }
        return res.json({ success: true, role: 'landlord', user: landlord });
      } else {
        // Auto-detect role by email
        const tenant = tenants.find((t) => t.email.toLowerCase() === cleanEmail);
        if (tenant) {
          if (password && tenant.password && tenant.password !== password) {
            return res.status(401).json({ error: 'Invalid password.' });
          }
          return res.json({ success: true, role: 'tenant', user: tenant });
        }

        const landlord = landlords.find((l) => l.email.toLowerCase() === cleanEmail);
        if (landlord) {
          if (password && landlord.password && landlord.password !== password) {
            return res.status(401).json({ error: 'Invalid password.' });
          }
          return res.json({ success: true, role: 'landlord', user: landlord });
        }

        return res.status(401).json({ error: 'No account found with this email address. Please register.' });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Login failed' });
    }
  });

  // Landlords Endpoints
  app.get('/api/landlords', (req, res) => {
    res.json(landlords);
  });

  app.post('/api/landlords/register', (req, res) => {
    try {
      const {
        name,
        companyName,
        email,
        phone,
        idNumber,
        mpesaTillNumber,
        mpesaPaybill,
        bankName,
        accountName,
        accountNumber,
        branchName,
        swiftCode,
        paymentMethod,
        paymentPhone
      } = req.body;

      if (!name || !email || !phone || !companyName) {
        return res.status(400).json({ error: 'Full name, company name, email, and phone number are required.' });
      }

      // Check if email already registered
      const existing = landlords.find(l => l.email.toLowerCase() === email.toLowerCase());
      if (existing) {
        return res.status(400).json({ error: 'A landlord account with this email address already exists on EstateMaster.' });
      }

      const nextYear = new Date();
      nextYear.setFullYear(nextYear.getFullYear() + 1);

      const receiptCode = `STK-EM-${Math.floor(100000 + Math.random() * 900000)}`;

      const newLandlord: Landlord = {
        id: `landlord-${Date.now()}`,
        name,
        companyName,
        email,
        phone,
        password: req.body.password || 'password123',
        idNumber: idNumber || `ID-${Math.floor(10000000 + Math.random() * 90000000)}`,
        subscriptionStatus: 'Active',
        subscriptionExpiry: nextYear.toISOString().split('T')[0],
        subscriptionPlan: 'EstateMaster Annual License (KSH 20,000/yr)',
        registeredAt: new Date().toISOString(),
        mpesaPaybill: mpesaPaybill || '247247',
        mpesaTillNumber: mpesaTillNumber || '781920',
        mpesaPhoneNumber: phone,
        bankName: bankName || 'Equity Bank Kenya',
        accountName: accountName || companyName,
        accountNumber: accountNumber || '01100998877',
        branchName: branchName || 'Nairobi Main Branch',
        swiftCode: swiftCode || 'EQBLKENA'
      };

      landlords.unshift(newLandlord);

      // Create Subscription Receipt Email
      const emailLog: EmailLog = {
        id: `email-sub-${Date.now()}`,
        recipientEmail: email,
        recipientName: name,
        subject: 'Welcome to EstateMaster! KSH 20,000 Annual Subscription Confirmation',
        bodyHtml: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
            <div style="background-color: #0284c7; padding: 16px; border-radius: 8px; color: #ffffff; text-align: center;">
              <h1 style="margin: 0; font-size: 20px;">Welcome to EstateMaster!</h1>
              <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.9;">Commercial Property Management Platform</p>
            </div>
            
            <div style="padding: 20px 0;">
              <p>Dear <strong>${name}</strong> (${companyName}),</p>
              <p>Thank you for subscribing to <strong>EstateMaster Commercial Property Software</strong>.</p>
              
              <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 16px; border-radius: 8px; margin: 16px 0;">
                <h3 style="margin-top: 0; color: #166534; font-size: 15px;">Subscription Receipt</h3>
                <p style="margin: 4px 0; font-size: 13px;"><strong>Plan:</strong> EstateMaster Annual License</p>
                <p style="margin: 4px 0; font-size: 13px;"><strong>Amount Paid:</strong> KSh 20,000 / year</p>
                <p style="margin: 4px 0; font-size: 13px;"><strong>Payment Method:</strong> ${paymentMethod || 'M-Pesa Express'}</p>
                <p style="margin: 4px 0; font-size: 13px;"><strong>M-Pesa / Bank Reference:</strong> ${receiptCode}</p>
                <p style="margin: 4px 0; font-size: 13px;"><strong>Subscription Expiry:</strong> ${newLandlord.subscriptionExpiry}</p>
              </div>

              <p style="font-size: 13px; color: #475569;">You now have unlimited access to manage your properties, automatically issue M-Pesa rental invoices, track tenant ledgers, and handle AI-powered maintenance requests.</p>
            </div>
            
            <div style="border-top: 1px solid #e2e8f0; pt-12; font-size: 11px; color: #94a3b8; text-align: center; padding-top: 12px;">
              EstateMaster Kenya • Support: support@estatemaster.co.ke • +254 700 000 000
            </div>
          </div>
        `,
        emailType: 'Welcome & Lease',
        sentAt: new Date().toISOString(),
        readStatus: false
      };
      emailLogs.unshift(emailLog);

      res.status(201).json({
        landlord: newLandlord,
        receiptCode,
        message: 'Landlord account registered successfully! KSH 20,000 annual subscription activated.'
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch('/api/landlords/:id', (req, res) => {
    const { id } = req.params;
    const landlord = landlords.find((l) => l.id === id);
    if (!landlord) {
      return res.status(404).json({ error: 'Landlord not found' });
    }
    Object.assign(landlord, req.body);
    res.json(landlord);
  });

  // M-Pesa Express STK Push Simulation Endpoint
  app.post('/api/payments/stk-push', (req, res) => {
    const { phone, amount, invoiceId, accountRef } = req.body;
    if (!phone || !amount || !invoiceId) {
      return res.status(400).json({ error: 'Phone number, amount, and invoice ID are required for M-Pesa STK Push' });
    }

    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Generate realistic Daraja / Safaricom M-Pesa receipt code
    const receiptCode = `SAB${Math.floor(10000000 + Math.random() * 90000000)}`;

    const payAmt = Number(amount);
    const pay: Payment = {
      id: `pay-${Date.now()}`,
      invoiceId,
      tenantId: inv.tenantId,
      tenantName: inv.tenantName,
      unitNumber: inv.unitNumber,
      amount: payAmt,
      paymentMethod: 'M-Pesa',
      referenceCode: receiptCode,
      paymentDate: new Date().toISOString(),
      status: 'Completed',
      notes: `M-Pesa Express STK Push completed for phone ${phone}. Acc: ${accountRef || inv.unitNumber}`
    };
    payments.unshift(pay);

    // Update invoice state
    inv.amountPaid = (inv.amountPaid || 0) + payAmt;
    if (inv.amountPaid >= inv.totalAmount) {
      inv.status = 'Paid';
    } else {
      inv.status = 'Partial';
    }

    // Dispatch instant M-Pesa SMS / Email payment receipt
    const receiptEmailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #10b981; border-radius: 12px; background: #fff;">
        <div style="background-color: #065f46; color: white; padding: 16px; border-radius: 8px 8px 0 0; text-align: center;">
          <h2 style="margin: 0; font-size: 20px;">📲 M-PESA PAYMENT CONFIRMED</h2>
          <p style="margin: 4px 0 0 0; font-size: 13px; color: #a7f3d0;">Official Rent Payment Receipt</p>
        </div>
        <div style="padding: 20px 0;">
          <p style="color: #1e293b; font-size: 15px;">Dear <strong>${inv.tenantName}</strong>,</p>
          <p style="color: #334155; font-size: 14px;">
            We have confirmed receipt of <strong>KSh ${payAmt.toLocaleString()}</strong> via M-Pesa Express STK Push for <strong>Invoice #${inv.invoiceNumber}</strong> (Unit ${inv.unitNumber}).
          </p>

          <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 4px 0; color: #166534; font-size: 13px;"><strong>M-Pesa Receipt Code:</strong> <span style="font-family: monospace; font-size: 15px; font-weight: bold;">${receiptCode}</span></p>
            <p style="margin: 4px 0; color: #166534; font-size: 13px;"><strong>Phone Number:</strong> ${phone}</p>
            <p style="margin: 4px 0; color: #166534; font-size: 13px;"><strong>Amount Paid:</strong> KSh ${payAmt.toLocaleString()}</p>
            <p style="margin: 4px 0; color: #166534; font-size: 13px;"><strong>Date & Time:</strong> ${new Date().toLocaleString('en-KE')}</p>
            <p style="margin: 4px 0; color: #15803d; font-size: 14px; font-weight: bold;">Status: Invoice ${inv.status}</p>
          </div>

          <p style="color: #64748b; font-size: 13px;">
            Thank you for paying your rent on time!
          </p>
        </div>
      </div>
    `;

    emailLogs.unshift({
      id: `email-${Date.now()}`,
      recipientEmail: inv.tenantEmail,
      recipientName: inv.tenantName,
      subject: `📲 M-Pesa Receipt ${receiptCode}: KSh ${payAmt.toLocaleString()} for Invoice #${inv.invoiceNumber}`,
      bodyHtml: receiptEmailHtml,
      emailType: 'Payment Receipt',
      sentAt: new Date().toISOString(),
      readStatus: false,
      documentId: pay.id
    });

    res.status(200).json({
      success: true,
      receiptCode,
      message: `M-Pesa STK Push payment of KSh ${payAmt.toLocaleString()} successfully processed! Confirmation Code: ${receiptCode}`,
      payment: pay,
      invoice: inv
    });
  });

  // Properties & Units
  app.get('/api/properties', (req, res) => {
    res.json(properties);
  });

  app.get('/api/units', (req, res) => {
    res.json(units);
  });

  app.post('/api/properties', (req, res) => {
    const newProp: Property = {
      id: `prop-${Date.now()}`,
      ...req.body
    };
    properties.push(newProp);
    res.status(201).json(newProp);
  });

  app.patch('/api/properties/:id', (req, res) => {
    const { id } = req.params;
    const property = properties.find((p) => p.id === id);
    if (!property) {
      return res.status(404).json({ error: 'Property not found' });
    }
    Object.assign(property, req.body);
    res.json(property);
  });

  app.delete('/api/properties/:id', (req, res) => {
    const { id } = req.params;
    const index = properties.findIndex((p) => p.id === id);
    if (index === -1) {
      return res.status(404).json({ error: 'Property not found' });
    }
    const removed = properties.splice(index, 1)[0];
    // Also optional: remove associated units if any
    const remainingUnits = units.filter((u) => u.propertyId !== id);
    units.length = 0;
    units.push(...remainingUnits);

    res.json({ message: 'Property removed successfully', property: removed });
  });

  app.post('/api/units', (req, res) => {
    const newUnit: Unit = {
      id: `unit-${Date.now()}`,
      ...req.body
    };
    units.push(newUnit);
    res.status(201).json(newUnit);
  });

  // Tenants
  app.get('/api/tenants', (req, res) => {
    res.json(tenants);
  });

  app.patch('/api/tenants/:id', (req, res) => {
    const { id } = req.params;
    const tenant = tenants.find((t) => t.id === id);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    Object.assign(tenant, req.body);
    res.json(tenant);
  });

  // NEW TENANT SELF-REGISTRATION FOR AN APARTMENT
  app.post('/api/tenants/register', async (req, res) => {
    try {
      const {
        fullName,
        email,
        phone,
        idNumber,
        occupation,
        income,
        emergencyContactName,
        emergencyContactPhone,
        unitId,
        moveInDate,
        leaseTermMonths = 12
      } = req.body;

      if (!fullName || !email || !unitId) {
        return res.status(400).json({ error: 'Full name, email, and selected unit are required.' });
      }

      const selectedUnit = units.find(u => u.id === unitId);
      if (!selectedUnit) {
        return res.status(400).json({ error: 'Selected apartment unit not found.' });
      }

      const selectedProp = properties.find(p => p.id === selectedUnit.propertyId);

      // 1. Create Tenant Record
      const newTenantId = `tenant-${Date.now()}`;
      const startDate = moveInDate || new Date().toISOString().split('T')[0];
      const endDateObj = new Date(startDate);
      endDateObj.setMonth(endDateObj.getMonth() + parseInt(leaseTermMonths.toString()));
      const endDate = endDateObj.toISOString().split('T')[0];

      const newTenant: Tenant = {
        id: newTenantId,
        propertyId: selectedUnit.propertyId,
        unitId: selectedUnit.id,
        propertyName: selectedUnit.propertyName || selectedProp?.name || 'Apartment',
        unitNumber: selectedUnit.unitNumber,
        fullName,
        email,
        phone: phone || '+254 700 000 000',
        password: req.body.password || 'password123',
        idNumber: idNumber || 'N/A',
        occupation: occupation || 'Applicant',
        income: parseFloat(income) || 3000,
        emergencyContactName: emergencyContactName || 'N/A',
        emergencyContactPhone: emergencyContactPhone || 'N/A',
        moveInDate: startDate,
        leaseStartDate: startDate,
        leaseEndDate: endDate,
        monthlyRent: selectedUnit.monthlyRent,
        depositPaid: false,
        status: 'Active',
        profilePictureUrl: req.body.profilePictureUrl || undefined,
        registeredAt: new Date().toISOString()
      };

      // Mark unit as occupied
      selectedUnit.status = 'Occupied';
      tenants.push(newTenant);

      // 2. Automatically Generate Rental Quote for the registered tenant
      const quoteId = `q-${Date.now()}`;
      const validUntilObj = new Date();
      validUntilObj.setDate(validUntilObj.getDate() + 14);
      const validUntil = validUntilObj.toISOString().split('T')[0];

      const estUtilities = 40;
      const depositQuote = selectedUnit.depositAmount;
      const moveInTotal = selectedUnit.monthlyRent + depositQuote;

      const newQuote: Quote = {
        id: quoteId,
        quoteNumber: `QTE-${Date.now().toString().slice(-6)}`,
        tenantName: fullName,
        tenantEmail: email,
        tenantPhone: phone || 'N/A',
        unitId: selectedUnit.id,
        unitNumber: selectedUnit.unitNumber,
        propertyName: selectedUnit.propertyName || 'Apartment Complex',
        monthlyRentQuote: selectedUnit.monthlyRent,
        depositQuote,
        leaseTermMonths: parseInt(leaseTermMonths.toString()),
        validUntil,
        estimatedUtilities: estUtilities,
        specialDiscount: 0,
        totalMoveInCost: moveInTotal,
        notes: `Automated official rental quote generated upon apartment registration for Unit ${selectedUnit.unitNumber}.`,
        status: 'Sent',
        createdAt: new Date().toISOString(),
        emailedToTenant: true,
        emailSentAt: new Date().toISOString()
      };
      quotes.push(newQuote);

      // 3. Automatically Generate First Month Invoice for the registered tenant
      const invoiceId = `inv-${Date.now()}`;
      const now = new Date();
      const currentMonthYear = now.toLocaleString('default', { month: 'long', year: 'numeric' });
      const dueDateObj = new Date();
      dueDateObj.setDate(dueDateObj.getDate() + 7);

      const waterFee = 25;
      const trashFee = 15;
      const totalInvAmount = selectedUnit.monthlyRent + waterFee + trashFee;

      const newInvoice: Invoice = {
        id: invoiceId,
        invoiceNumber: `INV-${Date.now().toString().slice(-6)}`,
        tenantId: newTenantId,
        tenantName: fullName,
        tenantEmail: email,
        unitId: selectedUnit.id,
        unitNumber: selectedUnit.unitNumber,
        propertyName: selectedUnit.propertyName || 'Apartment Complex',
        issueDate: now.toISOString().split('T')[0],
        dueDate: dueDateObj.toISOString().split('T')[0],
        periodMonth: currentMonthYear,
        rentAmount: selectedUnit.monthlyRent,
        waterFee,
        trashFee,
        maintenanceFee: 0,
        taxAmount: 0,
        discount: 0,
        totalAmount: totalInvAmount,
        status: 'Unpaid',
        amountPaid: 0,
        notes: `Welcome to ${selectedUnit.propertyName}! Initial move-in rental invoice for ${currentMonthYear}.`,
        emailedToTenant: true,
        emailSentAt: new Date().toISOString()
      };
      invoices.push(newInvoice);

      // 4. Send Automated Registration Welcome & Lease Email to Personal Email
      const welcomeEmailBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
          <div style="background-color: #1e293b; color: white; padding: 16px; border-radius: 8px 8px 0 0; text-align: center;">
            <h2 style="margin: 0; font-size: 20px;">Welcome to ${selectedUnit.propertyName}!</h2>
            <p style="margin: 4px 0 0 0; font-size: 13px; color: #94a3b8;">Apartment Registration & Lease Confirmation</p>
          </div>
          <div style="padding: 20px 0;">
            <p style="color: #334155; font-size: 15px;">Hello <strong>${fullName}</strong>,</p>
            <p style="color: #334155; font-size: 14px; line-height: 1.5;">
              Congratulations! Your registration for <strong>Unit ${selectedUnit.unitNumber}</strong> at <strong>${selectedUnit.propertyName}</strong> has been successfully processed. Below are your lease confirmation details and your initial monthly documents.
            </p>
            
            <div style="background-color: #f8fafc; border-left: 4px solid #2563eb; padding: 16px; margin: 16px 0; border-radius: 4px;">
              <h3 style="margin: 0 0 10px 0; color: #1e293b; font-size: 15px;">📋 Apartment & Lease Summary</h3>
              <p style="margin: 4px 0; color: #475569; font-size: 13px;"><strong>Unit:</strong> ${selectedUnit.unitNumber} (${selectedUnit.bedrooms} Bed, ${selectedUnit.bathrooms} Bath)</p>
              <p style="margin: 4px 0; color: #475569; font-size: 13px;"><strong>Monthly Rent:</strong> KSh ${selectedUnit.monthlyRent.toLocaleString()}</p>
              <p style="margin: 4px 0; color: #475569; font-size: 13px;"><strong>Lease Duration:</strong> ${leaseTermMonths} Months (${startDate} to ${endDate})</p>
              <p style="margin: 4px 0; color: #475569; font-size: 13px;"><strong>Registered Email:</strong> ${email}</p>
            </div>

            <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 16px; margin: 16px 0; border-radius: 8px;">
              <h3 style="margin: 0 0 10px 0; color: #166534; font-size: 15px;">📄 Initial Documents Dispatched</h3>
              <p style="margin: 4px 0; color: #15803d; font-size: 13px;">✅ <strong>Official Rental Quote #${newQuote.quoteNumber}:</strong> Total move-in cost estimate KSh ${moveInTotal.toLocaleString()}</p>
              <p style="margin: 4px 0; color: #15803d; font-size: 13px;">✅ <strong>First Monthly Invoice #${newInvoice.invoiceNumber}:</strong> Total Due KSh ${totalInvAmount.toLocaleString()} (Due: ${newInvoice.dueDate})</p>
            </div>

            <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; padding: 16px; margin: 16px 0; border-radius: 8px;">
              <h3 style="margin: 0 0 10px 0; color: #1e3a8a; font-size: 15px;">💳 Landlord Payment Options (M-Pesa & Bank Account)</h3>
              <p style="margin: 4px 0; color: #1e40af; font-size: 13px;"><strong>M-Pesa Buy Goods Till:</strong> 781920 (Mwangi Premier Estates)</p>
              <p style="margin: 4px 0; color: #1e40af; font-size: 13px;"><strong>M-Pesa Paybill:</strong> 247247 (Account: ${selectedUnit.unitNumber})</p>
              <p style="margin: 4px 0; color: #1e40af; font-size: 13px;"><strong>Bank Name:</strong> Equity Bank Kenya (Westlands Branch)</p>
              <p style="margin: 4px 0; color: #1e40af; font-size: 13px;"><strong>Account Name:</strong> Mwangi Premier Estates Ltd</p>
              <p style="margin: 4px 0; color: #1e40af; font-size: 13px;"><strong>Account Number:</strong> 0110293847561</p>
            </div>

            <p style="color: #334155; font-size: 14px;">
              You can view and manage your monthly invoices, track payments, or submit maintenance requests directly via your EstateMaster Tenant Mobile App Portal.
            </p>
            <p style="color: #64748b; font-size: 13px; margin-top: 24px;">
              Warm regards,<br/>
              <strong>EstateMaster Property Management</strong>
            </p>
          </div>
        </div>
      `;

      const welcomeEmail: EmailLog = {
        id: `email-${Date.now()}`,
        recipientEmail: email,
        recipientName: fullName,
        subject: `🎉 Registration Confirmed: Unit ${selectedUnit.unitNumber} - ${selectedUnit.propertyName}`,
        bodyHtml: welcomeEmailBody,
        emailType: 'Welcome & Lease',
        sentAt: new Date().toISOString(),
        readStatus: false,
        documentId: newInvoice.id
      };
      emailLogs.push(welcomeEmail);

      res.status(201).json({
        success: true,
        tenant: newTenant,
        quote: newQuote,
        invoice: newInvoice,
        email: welcomeEmail,
        message: `Tenant registered! Automated rental quote & invoice dispatched to ${email}.`
      });

    } catch (err: any) {
      console.error('Registration error:', err);
      res.status(500).json({ error: err.message || 'Failed to register tenant' });
    }
  });

  // Invoices & Quotes CRUD
  app.get('/api/invoices', (req, res) => {
    res.json(invoices);
  });

  app.post('/api/invoices/generate', (req, res) => {
    const { tenantId, periodMonth, waterFee = 25, trashFee = 15, maintenanceFee = 0, discount = 0, notes } = req.body;
    const tenant = tenants.find(t => t.id === tenantId);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const total = tenant.monthlyRent + Number(waterFee) + Number(trashFee) + Number(maintenanceFee) - Number(discount);
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 5);

    const inv: Invoice = {
      id: `inv-${Date.now()}`,
      invoiceNumber: `INV-${Date.now().toString().slice(-6)}`,
      tenantId: tenant.id,
      tenantName: tenant.fullName,
      tenantEmail: tenant.email,
      unitId: tenant.unitId,
      unitNumber: tenant.unitNumber || 'Unit',
      propertyName: tenant.propertyName || 'Property',
      issueDate: new Date().toISOString().split('T')[0],
      dueDate: dueDate.toISOString().split('T')[0],
      periodMonth: periodMonth || 'Current Month',
      rentAmount: tenant.monthlyRent,
      waterFee: Number(waterFee),
      trashFee: Number(trashFee),
      maintenanceFee: Number(maintenanceFee),
      taxAmount: 0,
      discount: Number(discount),
      totalAmount: total,
      status: 'Unpaid',
      amountPaid: 0,
      notes: notes || `Monthly rent statement for ${periodMonth}`,
      emailedToTenant: true,
      emailSentAt: new Date().toISOString()
    };
    invoices.push(inv);

    // Send invoice email notification to tenant's personal email
    const invoiceEmailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background: #fff;">
        <h2 style="color: #1e293b; margin-top: 0;">New Monthly Rent Invoice Dispatched</h2>
        <p>Dear ${tenant.fullName},</p>
        <p>A new rental invoice for <strong>${inv.periodMonth}</strong> has been generated for your unit <strong>${inv.unitNumber}</strong>.</p>
        <div style="background-color: #f8fafc; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p style="margin: 4px 0;"><strong>Invoice Number:</strong> ${inv.invoiceNumber}</p>
          <p style="margin: 4px 0;"><strong>Due Date:</strong> ${inv.dueDate}</p>
          <p style="margin: 4px 0;"><strong>Base Rent:</strong> $${inv.rentAmount}</p>
          <p style="margin: 4px 0;"><strong>Water & Trash:</strong> $${inv.waterFee + inv.trashFee}</p>
          <hr style="border: 0; border-top: 1px solid #cbd5e1; margin: 8px 0;"/>
          <p style="margin: 4px 0; font-size: 16px; color: #1e293b;"><strong>Total Amount Due: $${inv.totalAmount}</strong></p>
        </div>
        <p>Please log in to your EstateMaster Tenant Mobile App to complete payment or view details.</p>
      </div>
    `;

    emailLogs.push({
      id: `email-${Date.now()}`,
      recipientEmail: tenant.email,
      recipientName: tenant.fullName,
      subject: `📄 Monthly Rent Invoice #${inv.invoiceNumber} (${inv.periodMonth})`,
      bodyHtml: invoiceEmailHtml,
      emailType: 'Invoice',
      sentAt: new Date().toISOString(),
      readStatus: false,
      documentId: inv.id
    });

    res.status(201).json(inv);
  });

  app.get('/api/quotes', (req, res) => {
    res.json(quotes);
  });

  app.post('/api/quotes/generate', (req, res) => {
    const { tenantName, tenantEmail, tenantPhone, unitId, monthlyRentQuote, depositQuote, leaseTermMonths = 12, notes } = req.body;
    const unit = units.find(u => u.id === unitId);

    const rent = Number(monthlyRentQuote) || unit?.monthlyRent || 500;
    const deposit = Number(depositQuote) || unit?.depositAmount || rent;
    const moveInCost = rent + deposit;

    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + 14);

    const qte: Quote = {
      id: `q-${Date.now()}`,
      quoteNumber: `QTE-${Date.now().toString().slice(-6)}`,
      tenantName: tenantName || 'Prospect',
      tenantEmail: tenantEmail || 'tenant@example.com',
      tenantPhone: tenantPhone || 'N/A',
      unitId: unit?.id || 'unit-1',
      unitNumber: unit?.unitNumber || 'A1',
      propertyName: unit?.propertyName || 'Apartments',
      monthlyRentQuote: rent,
      depositQuote: deposit,
      leaseTermMonths: Number(leaseTermMonths),
      validUntil: validUntil.toISOString().split('T')[0],
      estimatedUtilities: 40,
      specialDiscount: 0,
      totalMoveInCost: moveInCost,
      notes: notes || 'Official lease quotation from landlord.',
      status: 'Sent',
      createdAt: new Date().toISOString(),
      emailedToTenant: true,
      emailSentAt: new Date().toISOString()
    };
    quotes.push(qte);

    // Send email log
    const quoteEmailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background: #fff;">
        <h2 style="color: #0f172a; margin-top: 0;">Official Rental Quote Offer</h2>
        <p>Dear ${qte.tenantName},</p>
        <p>Thank you for your interest in <strong>Unit ${qte.unitNumber}</strong> at <strong>${qte.propertyName}</strong>.</p>
        <div style="background-color: #f1f5f9; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p style="margin: 4px 0;"><strong>Quote #:</strong> ${qte.quoteNumber}</p>
          <p style="margin: 4px 0;"><strong>Quoted Monthly Rent:</strong> $${qte.monthlyRentQuote}</p>
          <p style="margin: 4px 0;"><strong>Security Deposit:</strong> $${qte.depositQuote}</p>
          <p style="margin: 4px 0;"><strong>Lease Duration:</strong> ${qte.leaseTermMonths} Months</p>
          <p style="margin: 4px 0; font-size: 16px; color: #0284c7;"><strong>Total Move-in Cost: $${qte.totalMoveInCost}</strong></p>
          <p style="margin: 4px 0; color: #64748b; font-size: 12px;">Valid Until: ${qte.validUntil}</p>
        </div>
      </div>
    `;

    emailLogs.push({
      id: `email-${Date.now()}`,
      recipientEmail: qte.tenantEmail,
      recipientName: qte.tenantName,
      subject: `🏷️ Rental Quotation #${qte.quoteNumber} - Unit ${qte.unitNumber}`,
      bodyHtml: quoteEmailHtml,
      emailType: 'Quote',
      sentAt: new Date().toISOString(),
      readStatus: false,
      documentId: qte.id
    });

    res.status(201).json(qte);
  });

  // Payments
  app.get('/api/payments', (req, res) => {
    res.json(payments);
  });

  app.post('/api/payments/record', (req, res) => {
    const { invoiceId, amount, paymentMethod, referenceCode, notes } = req.body;
    const inv = invoices.find(i => i.id === invoiceId);
    if (!inv) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const payAmt = Number(amount) || inv.totalAmount;
    const pay: Payment = {
      id: `pay-${Date.now()}`,
      invoiceId,
      tenantId: inv.tenantId,
      tenantName: inv.tenantName,
      unitNumber: inv.unitNumber,
      amount: payAmt,
      paymentMethod: paymentMethod || 'M-Pesa',
      referenceCode: referenceCode || `REF-${Math.floor(Math.random() * 899999 + 100000)}`,
      paymentDate: new Date().toISOString(),
      status: 'Completed',
      notes
    };
    payments.push(pay);

    // Update invoice status
    inv.amountPaid = (inv.amountPaid || 0) + payAmt;
    if (inv.amountPaid >= inv.totalAmount) {
      inv.status = 'Paid';
    } else if (inv.amountPaid > 0) {
      inv.status = 'Partial';
    }

    // Dispatch payment receipt email
    const receiptEmailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background: #fff;">
        <h2 style="color: #166534; margin-top: 0;">Payment Received Confirmation</h2>
        <p>Dear ${inv.tenantName},</p>
        <p>We have successfully received your payment of <strong>$${payAmt.toFixed(2)}</strong> for Invoice <strong>#${inv.invoiceNumber}</strong>.</p>
        <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p style="margin: 4px 0;"><strong>Receipt ID:</strong> ${pay.id}</p>
          <p style="margin: 4px 0;"><strong>Payment Method:</strong> ${pay.paymentMethod}</p>
          <p style="margin: 4px 0;"><strong>Reference Code:</strong> ${pay.referenceCode}</p>
          <p style="margin: 4px 0;"><strong>Date:</strong> ${new Date(pay.paymentDate).toLocaleDateString()}</p>
          <p style="margin: 4px 0; color: #15803d; font-size: 16px;"><strong>Invoice Paid In Full: $${inv.amountPaid.toFixed(2)} / $${inv.totalAmount.toFixed(2)}</strong></p>
        </div>
        <p>Thank you for choosing EstateMaster Property Management.</p>
      </div>
    `;

    emailLogs.push({
      id: `email-${Date.now()}`,
      recipientEmail: inv.tenantEmail,
      recipientName: inv.tenantName,
      subject: `✅ Payment Receipt for Invoice #${inv.invoiceNumber} ($${payAmt})`,
      bodyHtml: receiptEmailHtml,
      emailType: 'Payment Receipt',
      sentAt: new Date().toISOString(),
      readStatus: false,
      documentId: pay.id
    });

    res.status(201).json({ payment: pay, invoice: inv });
  });

  // Maintenance Requests
  app.get('/api/maintenance', (req, res) => {
    res.json(maintenanceRequests);
  });

  app.post('/api/maintenance/create', async (req, res) => {
    try {
      const { tenantId, title, description, category, urgency, photoUrl } = req.body;
      const tenant = tenants.find(t => t.id === tenantId) || tenants[0];

      // Call Gemini for AI triage suggestions if available
      let aiSummary = 'Standard request logged.';
      let aiDiy = 'Inspect area and ensure safety.';
      let aiCost = 'Estimated KSh 5,000 - KSh 15,000';

      const ai = getGeminiClient();
      if (ai) {
        try {
          const prompt = `You are an AI Property Maintenance Assistant for a real estate landlord. Analyze this tenant maintenance request:
Category: ${category || 'General'}
Title: ${title}
Description: ${description}

Provide a concise JSON response with:
1. summary: 1-sentence technical assessment.
2. diyAdvice: 1-2 helpful troubleshooting steps the tenant can check while waiting.
3. estimatedCost: estimated repair cost range in Kenyan Shillings (KSh).
4. suggestedUrgency: "Emergency" | "High" | "Medium" | "Low"`;

          const genResponse = await ai.models.generateContent({
            model: 'gemini-3.6-flash',
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
            },
          });

          if (genResponse.text) {
            const parsed = JSON.parse(genResponse.text);
            if (parsed.summary) aiSummary = parsed.summary;
            if (parsed.diyAdvice) aiDiy = parsed.diyAdvice;
            if (parsed.estimatedCost) aiCost = parsed.estimatedCost;
          }
        } catch (aiErr) {
          console.error('Gemini maintenance triage fallback:', aiErr);
        }
      }

      const reqObj: MaintenanceRequest = {
        id: `maint-${Date.now()}`,
        tenantId: tenant.id,
        tenantName: tenant.fullName,
        tenantEmail: tenant.email,
        unitId: tenant.unitId,
        unitNumber: tenant.unitNumber || 'Unit',
        propertyName: tenant.propertyName || 'Property',
        title,
        description,
        category: category || 'Other',
        urgency: urgency || 'Medium',
        status: 'Open',
        submittedAt: new Date().toISOString(),
        aiTriageSummary: aiSummary,
        aiSuggestedDiy: aiDiy,
        aiEstimatedCost: aiCost,
        photoUrl
      };

      maintenanceRequests.unshift(reqObj);
      res.status(201).json(reqObj);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch('/api/maintenance/:id', (req, res) => {
    const { id } = req.params;
    const reqObj = maintenanceRequests.find(m => m.id === id);
    if (!reqObj) {
      return res.status(404).json({ error: 'Request not found' });
    }

    if (req.body.status) reqObj.status = req.body.status;
    if (req.body.assignedTechnician) reqObj.assignedTechnician = req.body.assignedTechnician;
    if (req.body.status === 'Completed') reqObj.resolvedAt = new Date().toISOString();

    res.json(reqObj);
  });

  // Email Logs
  app.get('/api/emails', (req, res) => {
    const { recipientEmail } = req.query;
    if (recipientEmail) {
      const filtered = emailLogs.filter(e => e.recipientEmail.toLowerCase() === (recipientEmail as string).toLowerCase());
      return res.json(filtered);
    }
    res.json(emailLogs);
  });

  // AI GEMINI POWERED ENDPOINTS

  // AI Quote Generation
  app.post('/api/ai/generate-quote', async (req, res) => {
    try {
      const { tenantName, unitId, leaseTermMonths, moveInDate, specialRequests } = req.body;
      const unit = units.find(u => u.id === unitId) || units[0];
      const ai = getGeminiClient();

      if (!ai) {
        return res.json({
          monthlyRentQuote: unit.monthlyRent,
          depositQuote: unit.depositAmount,
          specialDiscount: 0,
          notes: `Standard rental quote for Unit ${unit.unitNumber}. Monthly rent KSh ${unit.monthlyRent.toLocaleString()}, Security Deposit KSh ${unit.depositAmount.toLocaleString()}.`
        });
      }

      const prompt = `As an expert AI Landlord Property Management Assistant, generate an optimal rental quote for a tenant applicant.
Property: ${unit.propertyName} (Unit ${unit.unitNumber})
Bedrooms: ${unit.bedrooms}, Bathrooms: ${unit.bathrooms}, Size: ${unit.sqft} sqft
Standard Rent: KSh ${unit.monthlyRent}, Deposit: KSh ${unit.depositAmount}
Applicant Name: ${tenantName}
Lease Duration: ${leaseTermMonths} months
Move in Date: ${moveInDate}
Special Notes/Requests: ${specialRequests || 'None'}

Return a JSON object:
{
  "monthlyRentQuote": number,
  "depositQuote": number,
  "specialDiscount": number,
  "notes": "A polite, professional breakdown sentence explaining the pricing, inclusion of parking/Wi-Fi or discounts."
}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
      });

      if (response.text) {
        const data = JSON.parse(response.text);
        return res.json(data);
      }

      res.json({
        monthlyRentQuote: unit.monthlyRent,
        depositQuote: unit.depositAmount,
        specialDiscount: 0,
        notes: `Standard rental quotation generated for ${tenantName}.`
      });
    } catch (err: any) {
      console.error('AI Quote error:', err);
      res.status(500).json({ error: 'AI Quote generation failed' });
    }
  });

  // AI Email Copilot
  app.post('/api/ai/draft-email', async (req, res) => {
    try {
      const { emailType, tenantName, unitNumber, customPrompt } = req.body;
      const ai = getGeminiClient();

      if (!ai) {
        return res.json({
          subject: `${emailType} Notice - Unit ${unitNumber}`,
          bodyHtml: `<p>Dear ${tenantName},</p><p>This is an automated ${emailType} regarding your apartment Unit ${unitNumber}.</p><p>Regards,<br/>Landlord</p>`
        });
      }

      const prompt = `Write a professional, friendly HTML email body from Landlord/EstateMaster Property Management to tenant ${tenantName} (Unit ${unitNumber}).
Email Purpose: ${emailType}
Additional details: ${customPrompt || 'Standard notice'}

Return JSON:
{
  "subject": "Clear engaging subject line",
  "bodyHtml": "HTML formatted email content with inline CSS styles for clean display."
}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
      });

      if (response.text) {
        return res.json(JSON.parse(response.text));
      }

      res.json({
        subject: `${emailType} - Unit ${unitNumber}`,
        bodyHtml: `<p>Dear ${tenantName},</p><p>${customPrompt || 'Notice from management.'}</p>`
      });
    } catch (err: any) {
      res.status(500).json({ error: 'AI Email drafting failed' });
    }
  });


  // --- VITE / STATIC SERVING ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`EstateMaster Landlord Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
