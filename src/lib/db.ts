import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where
} from 'firebase/firestore';
import { db } from './firebase';
import {
  Landlord,
  Tenant,
  Property,
  Unit,
  Invoice,
  Quote,
  Payment,
  MaintenanceRequest,
  EmailLog
} from '../types';

// Helper to sanitize objects for Firestore (remove undefined values)
function sanitize<T extends Record<string, any>>(obj: T): T {
  const clean: any = {};
  Object.keys(obj).forEach((key) => {
    if (obj[key] !== undefined) {
      clean[key] = obj[key];
    }
  });
  return clean as T;
}

// Collections
const COLLECTIONS = {
  LANDLORDS: 'landlords',
  TENANTS: 'tenants',
  PROPERTIES: 'properties',
  UNITS: 'units',
  INVOICES: 'invoices',
  QUOTES: 'quotes',
  PAYMENTS: 'payments',
  MAINTENANCE: 'maintenance',
  EMAILS: 'emails'
};

// --- LANDLORDS ---
export async function getLandlordsFromDb(): Promise<Landlord[]> {
  try {
    const snapshot = await getDocs(collection(db, COLLECTIONS.LANDLORDS));
    return snapshot.docs.map((d) => d.data() as Landlord);
  } catch (err) {
    console.error('Error getting landlords from Firestore:', err);
    return [];
  }
}

export async function saveLandlordToDb(landlord: Landlord): Promise<void> {
  try {
    const cleanData = sanitize(landlord);
    await setDoc(doc(db, COLLECTIONS.LANDLORDS, landlord.id), cleanData);
  } catch (err) {
    console.error('Error saving landlord to Firestore:', err);
  }
}

export async function updateLandlordInDb(id: string, data: Partial<Landlord>): Promise<void> {
  try {
    const cleanData = sanitize(data);
    await updateDoc(doc(db, COLLECTIONS.LANDLORDS, id), cleanData);
  } catch (err) {
    console.error('Error updating landlord in Firestore:', err);
  }
}

// --- TENANTS ---
export async function getTenantsFromDb(): Promise<Tenant[]> {
  try {
    const snapshot = await getDocs(collection(db, COLLECTIONS.TENANTS));
    return snapshot.docs.map((d) => d.data() as Tenant);
  } catch (err) {
    console.error('Error getting tenants from Firestore:', err);
    return [];
  }
}

export async function getTenantByEmailFromDb(email: string): Promise<Tenant | null> {
  try {
    const cleanEmail = email.trim().toLowerCase();
    const q = query(collection(db, COLLECTIONS.TENANTS), where('emailLower', '==', cleanEmail));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      return snapshot.docs[0].data() as Tenant;
    }

    // Fallback search in all tenants if emailLower not set
    const all = await getTenantsFromDb();
    return all.find((t) => t.email && t.email.trim().toLowerCase() === cleanEmail) || null;
  } catch (err) {
    console.error('Error querying tenant by email from Firestore:', err);
    return null;
  }
}

export async function saveTenantToDb(tenant: Tenant): Promise<void> {
  try {
    const cleanData = sanitize({
      ...tenant,
      emailLower: tenant.email ? tenant.email.trim().toLowerCase() : ''
    });
    await setDoc(doc(db, COLLECTIONS.TENANTS, tenant.id), cleanData);
  } catch (err) {
    console.error('Error saving tenant to Firestore:', err);
  }
}

export async function updateTenantInDb(id: string, data: Partial<Tenant>): Promise<void> {
  try {
    const cleanData = sanitize(data);
    if (data.email) {
      (cleanData as any).emailLower = data.email.trim().toLowerCase();
    }
    await updateDoc(doc(db, COLLECTIONS.TENANTS, id), cleanData);
  } catch (err) {
    console.error('Error updating tenant in Firestore:', err);
  }
}

export async function deleteTenantFromDb(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, COLLECTIONS.TENANTS, id));
  } catch (err) {
    console.error('Error deleting tenant from Firestore:', err);
  }
}

// --- PROPERTIES ---
export async function getPropertiesFromDb(): Promise<Property[]> {
  try {
    const snapshot = await getDocs(collection(db, COLLECTIONS.PROPERTIES));
    return snapshot.docs.map((d) => d.data() as Property);
  } catch (err) {
    console.error('Error getting properties from Firestore:', err);
    return [];
  }
}

export async function savePropertyToDb(property: Property): Promise<void> {
  try {
    await setDoc(doc(db, COLLECTIONS.PROPERTIES, property.id), sanitize(property));
  } catch (err) {
    console.error('Error saving property to Firestore:', err);
  }
}

export async function updatePropertyInDb(id: string, data: Partial<Property>): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTIONS.PROPERTIES, id), sanitize(data));
  } catch (err) {
    console.error('Error updating property in Firestore:', err);
  }
}

export async function deletePropertyFromDb(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, COLLECTIONS.PROPERTIES, id));
  } catch (err) {
    console.error('Error deleting property from Firestore:', err);
  }
}

// --- UNITS ---
export async function getUnitsFromDb(): Promise<Unit[]> {
  try {
    const snapshot = await getDocs(collection(db, COLLECTIONS.UNITS));
    return snapshot.docs.map((d) => d.data() as Unit);
  } catch (err) {
    console.error('Error getting units from Firestore:', err);
    return [];
  }
}

export async function saveUnitToDb(unit: Unit): Promise<void> {
  try {
    await setDoc(doc(db, COLLECTIONS.UNITS, unit.id), sanitize(unit));
  } catch (err) {
    console.error('Error saving unit to Firestore:', err);
  }
}

export async function updateUnitInDb(id: string, data: Partial<Unit>): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTIONS.UNITS, id), sanitize(data));
  } catch (err) {
    console.error('Error updating unit in Firestore:', err);
  }
}

// --- INVOICES ---
export async function getInvoicesFromDb(): Promise<Invoice[]> {
  try {
    const snapshot = await getDocs(collection(db, COLLECTIONS.INVOICES));
    return snapshot.docs.map((d) => d.data() as Invoice);
  } catch (err) {
    console.error('Error getting invoices from Firestore:', err);
    return [];
  }
}

export async function saveInvoiceToDb(invoice: Invoice): Promise<void> {
  try {
    await setDoc(doc(db, COLLECTIONS.INVOICES, invoice.id), sanitize(invoice));
  } catch (err) {
    console.error('Error saving invoice to Firestore:', err);
  }
}

export async function updateInvoiceInDb(id: string, data: Partial<Invoice>): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTIONS.INVOICES, id), sanitize(data));
  } catch (err) {
    console.error('Error updating invoice in Firestore:', err);
  }
}

// --- QUOTES ---
export async function getQuotesFromDb(): Promise<Quote[]> {
  try {
    const snapshot = await getDocs(collection(db, COLLECTIONS.QUOTES));
    return snapshot.docs.map((d) => d.data() as Quote);
  } catch (err) {
    console.error('Error getting quotes from Firestore:', err);
    return [];
  }
}

export async function saveQuoteToDb(quote: Quote): Promise<void> {
  try {
    await setDoc(doc(db, COLLECTIONS.QUOTES, quote.id), sanitize(quote));
  } catch (err) {
    console.error('Error saving quote to Firestore:', err);
  }
}

// --- PAYMENTS ---
export async function getPaymentsFromDb(): Promise<Payment[]> {
  try {
    const snapshot = await getDocs(collection(db, COLLECTIONS.PAYMENTS));
    return snapshot.docs.map((d) => d.data() as Payment);
  } catch (err) {
    console.error('Error getting payments from Firestore:', err);
    return [];
  }
}

export async function savePaymentToDb(payment: Payment): Promise<void> {
  try {
    await setDoc(doc(db, COLLECTIONS.PAYMENTS, payment.id), sanitize(payment));
  } catch (err) {
    console.error('Error saving payment to Firestore:', err);
  }
}

// --- MAINTENANCE ---
export async function getMaintenanceFromDb(): Promise<MaintenanceRequest[]> {
  try {
    const snapshot = await getDocs(collection(db, COLLECTIONS.MAINTENANCE));
    return snapshot.docs.map((d) => d.data() as MaintenanceRequest);
  } catch (err) {
    console.error('Error getting maintenance requests from Firestore:', err);
    return [];
  }
}

export async function saveMaintenanceToDb(maint: MaintenanceRequest): Promise<void> {
  try {
    await setDoc(doc(db, COLLECTIONS.MAINTENANCE, maint.id), sanitize(maint));
  } catch (err) {
    console.error('Error saving maintenance to Firestore:', err);
  }
}

export async function updateMaintenanceInDb(id: string, data: Partial<MaintenanceRequest>): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTIONS.MAINTENANCE, id), sanitize(data));
  } catch (err) {
    console.error('Error updating maintenance in Firestore:', err);
  }
}

// --- EMAILS ---
export async function getEmailsFromDb(): Promise<EmailLog[]> {
  try {
    const snapshot = await getDocs(collection(db, COLLECTIONS.EMAILS));
    return snapshot.docs.map((d) => d.data() as EmailLog);
  } catch (err) {
    console.error('Error getting emails from Firestore:', err);
    return [];
  }
}

export async function saveEmailToDb(email: EmailLog): Promise<void> {
  try {
    await setDoc(doc(db, COLLECTIONS.EMAILS, email.id), sanitize(email));
  } catch (err) {
    console.error('Error saving email to Firestore:', err);
  }
}

// --- SEED DATABASE IF EMPTY ---
export async function seedDbIfEmpty(
  initialLandlords: Landlord[],
  initialProperties: Property[],
  initialUnits: Unit[],
  initialTenants: Tenant[],
  initialInvoices: Invoice[],
  initialQuotes: Quote[],
  initialPayments: Payment[],
  initialMaintenance: MaintenanceRequest[],
  initialEmails: EmailLog[]
): Promise<void> {
  try {
    // Check if landlords exist
    const existingLandlords = await getLandlordsFromDb();
    if (existingLandlords.length === 0) {
      console.log('⚡ Seeding initial landlords to Firestore...');
      for (const l of initialLandlords) {
        await saveLandlordToDb(l);
      }
    } else {
      // Ensure key seed landlords (like Allan (Raha)) are always present
      for (const l of initialLandlords) {
        const found = existingLandlords.some(e => e.email.trim().toLowerCase() === l.email.trim().toLowerCase() || e.id === l.id);
        if (!found) {
          console.log(`⚡ Syncing missing seed landlord (${l.name} - ${l.email}) to Firestore...`);
          await saveLandlordToDb(l);
        }
      }
    }

    // Check properties
    const existingProps = await getPropertiesFromDb();
    if (existingProps.length === 0) {
      console.log('⚡ Seeding initial properties to Firestore...');
      for (const p of initialProperties) {
        await savePropertyToDb(p);
      }
    } else {
      for (const p of initialProperties) {
        const found = existingProps.some(ep => ep.id === p.id);
        if (!found) {
          await savePropertyToDb(p);
        }
      }
    }

    // Check units
    const existingUnits = await getUnitsFromDb();
    if (existingUnits.length === 0) {
      console.log('⚡ Seeding initial units to Firestore...');
      for (const u of initialUnits) {
        await saveUnitToDb(u);
      }
    }

    // Check tenants
    const existingTenants = await getTenantsFromDb();
    if (existingTenants.length === 0) {
      console.log('⚡ Seeding initial tenants to Firestore...');
      for (const t of initialTenants) {
        await saveTenantToDb(t);
      }
    }

    // Check invoices
    const existingInvoices = await getInvoicesFromDb();
    if (existingInvoices.length === 0) {
      console.log('⚡ Seeding initial invoices to Firestore...');
      for (const inv of initialInvoices) {
        await saveInvoiceToDb(inv);
      }
    }

    // Check quotes
    const existingQuotes = await getQuotesFromDb();
    if (existingQuotes.length === 0) {
      console.log('⚡ Seeding initial quotes to Firestore...');
      for (const q of initialQuotes) {
        await saveQuoteToDb(q);
      }
    }

    // Check payments
    const existingPayments = await getPaymentsFromDb();
    if (existingPayments.length === 0) {
      console.log('⚡ Seeding initial payments to Firestore...');
      for (const p of initialPayments) {
        await savePaymentToDb(p);
      }
    }

    // Check maintenance
    const existingMaint = await getMaintenanceFromDb();
    if (existingMaint.length === 0) {
      console.log('⚡ Seeding initial maintenance to Firestore...');
      for (const m of initialMaintenance) {
        await saveMaintenanceToDb(m);
      }
    }

    // Check emails
    const existingEmails = await getEmailsFromDb();
    if (existingEmails.length === 0) {
      console.log('⚡ Seeding initial email logs to Firestore...');
      for (const e of initialEmails) {
        await saveEmailToDb(e);
      }
    }
  } catch (err) {
    console.error('Error seeding database:', err);
  }
}
