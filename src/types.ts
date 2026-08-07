export type PropertyType = 'Apartment Building' | 'Single Family' | 'Duplex' | 'Condo' | 'Commercial';

export interface Landlord {
  id: string;
  name: string;
  companyName: string;
  email: string;
  phone: string;
  password?: string;
  idNumber?: string;
  // Subscription Commercialization
  subscriptionStatus: 'Active' | 'Pending Payment' | 'Expired';
  subscriptionExpiry: string;
  subscriptionPlan: string; // e.g. "EstateMaster Annual License (KSH 20,000/yr)"
  registeredAt?: string;
  // M-Pesa Details
  mpesaPaybill?: string;
  mpesaTillNumber?: string;
  mpesaPhoneNumber?: string;
  // Bank Account Details
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
  branchName?: string;
  swiftCode?: string;
}

export interface Property {
  id: string;
  landlordId?: string;
  name: string;
  address: string;
  city: string;
  type: PropertyType;
  totalUnits: number;
  imageUrl: string;
  description: string;
  amenities: string[];
}

export interface Unit {
  id: string;
  propertyId: string;
  propertyName?: string;
  unitNumber: string;
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  monthlyRent: number;
  depositAmount: number;
  status: 'Available' | 'Occupied' | 'Under Maintenance';
  features: string[];
}

export interface Tenant {
  id: string;
  propertyId: string;
  unitId: string;
  propertyName?: string;
  unitNumber?: string;
  fullName: string;
  email: string;
  phone: string;
  password?: string;
  idNumber: string;
  occupation: string;
  income: number;
  emergencyContactName: string;
  emergencyContactPhone: string;
  moveInDate: string;
  leaseStartDate: string;
  leaseEndDate: string;
  monthlyRent: number;
  depositPaid: boolean;
  status: 'Active' | 'Pending Approval' | 'Past';
  profilePictureUrl?: string;
  registeredAt: string;
}

export interface InvoiceItem {
  description: string;
  amount: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  tenantId: string;
  tenantName: string;
  tenantEmail: string;
  unitId: string;
  unitNumber: string;
  propertyName: string;
  issueDate: string;
  dueDate: string;
  periodMonth: string; // e.g. "August 2026"
  rentAmount: number;
  waterFee: number;
  trashFee: number;
  maintenanceFee: number;
  taxAmount: number;
  discount: number;
  totalAmount: number;
  status: 'Unpaid' | 'Paid' | 'Overdue' | 'Partial';
  amountPaid: number;
  notes?: string;
  emailedToTenant: boolean;
  emailSentAt?: string;
}

export interface Quote {
  id: string;
  quoteNumber: string;
  tenantName: string;
  tenantEmail: string;
  tenantPhone: string;
  unitId: string;
  unitNumber: string;
  propertyName: string;
  monthlyRentQuote: number;
  depositQuote: number;
  leaseTermMonths: number;
  validUntil: string;
  estimatedUtilities: number;
  specialDiscount: number;
  totalMoveInCost: number;
  notes: string;
  status: 'Sent' | 'Accepted' | 'Expired';
  createdAt: string;
  emailedToTenant: boolean;
  emailSentAt?: string;
}

export interface Payment {
  id: string;
  invoiceId: string;
  tenantId: string;
  tenantName: string;
  unitNumber: string;
  amount: number;
  paymentMethod: 'M-Pesa' | 'Bank Transfer' | 'Credit Card' | 'Cash' | 'Check';
  referenceCode: string;
  paymentDate: string;
  status: 'Completed' | 'Pending Verification' | 'Failed';
  notes?: string;
}

export interface MaintenanceRequest {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantEmail: string;
  unitId: string;
  unitNumber: string;
  propertyName: string;
  title: string;
  description: string;
  category: 'Plumbing' | 'Electrical' | 'HVAC' | 'Appliance' | 'Structural' | 'Locks & Keys' | 'Other';
  urgency: 'Emergency' | 'High' | 'Medium' | 'Low';
  status: 'Open' | 'In Progress' | 'Completed' | 'Cancelled';
  submittedAt: string;
  resolvedAt?: string;
  aiTriageSummary?: string;
  aiSuggestedDiy?: string;
  aiEstimatedCost?: string;
  photoUrl?: string;
  assignedTechnician?: string;
}

export interface EmailLog {
  id: string;
  recipientEmail: string;
  recipientName: string;
  subject: string;
  bodyHtml: string;
  emailType: 'Invoice' | 'Quote' | 'Welcome & Lease' | 'Payment Receipt' | 'Maintenance Update';
  sentAt: string;
  readStatus: boolean;
  documentId?: string; // invoice or quote id
}

export interface AiQuoteRequest {
  tenantName: string;
  tenantEmail: string;
  unitId: string;
  leaseTermMonths: number;
  moveInDate: string;
  specialRequests?: string;
}

export interface AiInvoiceRequest {
  tenantId: string;
  periodMonth: string;
  customCharges?: { description: string; amount: number }[];
  notes?: string;
}

export interface AiTriageRequest {
  title: string;
  description: string;
  category: string;
  unitNumber: string;
}
