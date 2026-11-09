/**
 * Server-side persistence abstraction.
 *
 * WHY THIS EXISTS
 * The browser used to read/write Firestore directly with open security rules
 * (`allow read, write: if true`). That exposed every user's data (including
 * password hashes) to anyone. All persistence now goes through this module, which
 * is used ONLY by the server. Firestore rules are deny-all; the server uses the
 * Firebase Admin SDK (service account) which bypasses rules by design.
 *
 * Two backends:
 *  - FirestoreStore  (production)  - firebase-admin
 *  - MemoryStore     (dev / tests) - no external deps, same semantics
 *
 * Both provide the primitives the payment ledger needs for correctness:
 *  - create():   atomic create-if-absent (the basis of "a reference can be redeemed only once")
 *  - transact(): read-modify-write with isolation (used to apply payments to invoices exactly once)
 */

/** Sentinel for update(): remove this field from the document. */
export const DELETE_FIELD: unique symbol = Symbol('store.delete-field');

export interface StoreTx {
  get<T = any>(col: string, id: string): Promise<T | undefined>;
  set(col: string, id: string, data: Record<string, any>): void;
  update(col: string, id: string, patch: Record<string, any>): void;
  /** Throws if the document already exists. */
  create(col: string, id: string, data: Record<string, any>): void;
}

export interface Store {
  readonly kind: 'memory' | 'firestore';
  get<T = any>(col: string, id: string): Promise<T | undefined>;
  list<T = any>(col: string): Promise<T[]>;
  where<T = any>(col: string, field: string, value: unknown): Promise<T[]>;
  set(col: string, id: string, data: Record<string, any>): Promise<void>;
  /** Shallow merge; keys with DELETE_FIELD are removed. Throws if the doc does not exist. */
  update(col: string, id: string, patch: Record<string, any>): Promise<void>;
  delete(col: string, id: string): Promise<void>;
  /** Atomic create-if-absent. Returns false (and writes nothing) if the doc already exists. */
  create(col: string, id: string, data: Record<string, any>): Promise<boolean>;
  /** Reads must precede writes inside fn (Firestore requirement). May be retried; keep fn idempotent. */
  transact<R>(fn: (tx: StoreTx) => Promise<R>): Promise<R>;
}

function applyPatch(base: Record<string, any>, patch: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === DELETE_FIELD) delete out[k];
    else if (v !== undefined) out[k] = v;
  }
  return out;
}

function clean<T extends Record<string, any>>(obj: T): T {
  // Firestore rejects `undefined`; strip it so both backends behave identically.
  const out: any = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== DELETE_FIELD) out[k] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------
export class MemoryStore implements Store {
  readonly kind = 'memory' as const;
  private cols = new Map<string, Map<string, Record<string, any>>>();
  private txQueue: Promise<unknown> = Promise.resolve();

  private col(name: string): Map<string, Record<string, any>> {
    let c = this.cols.get(name);
    if (!c) {
      c = new Map();
      this.cols.set(name, c);
    }
    return c;
  }

  async get<T = any>(col: string, id: string): Promise<T | undefined> {
    const d = this.col(col).get(id);
    return d ? (structuredClone(d) as T) : undefined;
  }

  async list<T = any>(col: string): Promise<T[]> {
    return Array.from(this.col(col).values()).map((d) => structuredClone(d) as T);
  }

  async where<T = any>(col: string, field: string, value: unknown): Promise<T[]> {
    return Array.from(this.col(col).values())
      .filter((d) => d[field] === value)
      .map((d) => structuredClone(d) as T);
  }

  async set(col: string, id: string, data: Record<string, any>): Promise<void> {
    this.col(col).set(id, structuredClone(clean(data)));
  }

  async update(col: string, id: string, patch: Record<string, any>): Promise<void> {
    const existing = this.col(col).get(id);
    if (!existing) throw new Error(`NOT_FOUND: ${col}/${id}`);
    this.col(col).set(id, structuredClone(applyPatch(existing, patch)));
  }

  async delete(col: string, id: string): Promise<void> {
    this.col(col).delete(id);
  }

  async create(col: string, id: string, data: Record<string, any>): Promise<boolean> {
    const c = this.col(col);
    if (c.has(id)) return false;
    c.set(id, structuredClone(clean(data)));
    return true;
  }

  async transact<R>(fn: (tx: StoreTx) => Promise<R>): Promise<R> {
    // Serialise transactions (emulates isolation) and buffer writes so a throw rolls back.
    const run = async (): Promise<R> => {
      const writes: Array<() => void> = [];
      const overlay = new Map<string, Record<string, any> | null>();
      const key = (c: string, i: string) => `${c}\u0000${i}`;
      const current = (c: string, i: string): Record<string, any> | undefined => {
        const k = key(c, i);
        if (overlay.has(k)) {
          const v = overlay.get(k);
          return v ? v : undefined;
        }
        return this.col(c).get(i);
      };
      const tx: StoreTx = {
        get: async (c, i) => {
          const d = current(c, i);
          return d ? (structuredClone(d) as any) : undefined;
        },
        set: (c, i, data) => {
          const v = structuredClone(clean(data));
          overlay.set(key(c, i), v);
          writes.push(() => this.col(c).set(i, v));
        },
        update: (c, i, patch) => {
          const existing = current(c, i);
          if (!existing) throw new Error(`NOT_FOUND: ${c}/${i}`);
          const v = structuredClone(applyPatch(existing, patch));
          overlay.set(key(c, i), v);
          writes.push(() => this.col(c).set(i, v));
        },
        create: (c, i, data) => {
          if (current(c, i)) throw new Error(`ALREADY_EXISTS: ${c}/${i}`);
          const v = structuredClone(clean(data));
          overlay.set(key(c, i), v);
          writes.push(() => this.col(c).set(i, v));
        }
      };
      const result = await fn(tx);
      for (const w of writes) w();
      return result;
    };
    const next = this.txQueue.then(run, run);
    this.txQueue = next.catch(() => undefined);
    return next;
  }
}

// ---------------------------------------------------------------------------
// Firestore (Admin SDK) store
// ---------------------------------------------------------------------------
type AnyFs = any;

function mapPatchForFirestore(patch: Record<string, any>, FieldValue: any): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === DELETE_FIELD) out[k] = FieldValue.delete();
    else if (v !== undefined) out[k] = v;
  }
  return out;
}

export class FirestoreStore implements Store {
  readonly kind = 'firestore' as const;
  constructor(private fs: AnyFs, private FieldValue: any) {}

  private ref(col: string, id: string) {
    return this.fs.collection(col).doc(id);
  }

  async get<T = any>(col: string, id: string): Promise<T | undefined> {
    const snap = await this.ref(col, id).get();
    return snap.exists ? (snap.data() as T) : undefined;
  }

  async list<T = any>(col: string): Promise<T[]> {
    const snap = await this.fs.collection(col).get();
    return snap.docs.map((d: any) => d.data() as T);
  }

  async where<T = any>(col: string, field: string, value: unknown): Promise<T[]> {
    const snap = await this.fs.collection(col).where(field, '==', value).get();
    return snap.docs.map((d: any) => d.data() as T);
  }

  async set(col: string, id: string, data: Record<string, any>): Promise<void> {
    await this.ref(col, id).set(clean(data));
  }

  async update(col: string, id: string, patch: Record<string, any>): Promise<void> {
    await this.ref(col, id).update(mapPatchForFirestore(patch, this.FieldValue));
  }

  async delete(col: string, id: string): Promise<void> {
    await this.ref(col, id).delete();
  }

  async create(col: string, id: string, data: Record<string, any>): Promise<boolean> {
    try {
      await this.ref(col, id).create(clean(data));
      return true;
    } catch (err: any) {
      // gRPC ALREADY_EXISTS = 6
      if (err?.code === 6 || err?.code === 'already-exists' || /ALREADY_EXISTS/i.test(String(err?.message))) {
        return false;
      }
      throw err;
    }
  }

  async transact<R>(fn: (tx: StoreTx) => Promise<R>): Promise<R> {
    return this.fs.runTransaction(async (t: any) => {
      const tx: StoreTx = {
        get: async (c, i) => {
          const snap = await t.get(this.ref(c, i));
          return snap.exists ? snap.data() : undefined;
        },
        set: (c, i, data) => {
          t.set(this.ref(c, i), clean(data));
        },
        update: (c, i, patch) => {
          t.update(this.ref(c, i), mapPatchForFirestore(patch, this.FieldValue));
        },
        create: (c, i, data) => {
          t.create(this.ref(c, i), clean(data));
        }
      };
      return fn(tx);
    });
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
function parseServiceAccount(raw: string): Record<string, any> {
  const text = raw.trim();
  const json = text.startsWith('{') ? text : Buffer.from(text, 'base64').toString('utf8');
  const parsed = JSON.parse(json);
  if (parsed.private_key && typeof parsed.private_key === 'string') {
    parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
  }
  return parsed;
}

export async function createFirestoreStore(): Promise<FirestoreStore> {
  const appMod: any = await import('firebase-admin/app');
  const fsMod: any = await import('firebase-admin/firestore');

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || undefined;
  const databaseId = process.env.FIREBASE_DATABASE_ID || '(default)';

  let app: any;
  if (appMod.getApps().length > 0) {
    app = appMod.getApp();
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const sa = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT);
    app = appMod.initializeApp({ credential: appMod.cert(sa), projectId: projectId || sa.project_id });
  } else {
    // Application Default Credentials (Cloud Run / GCE / GOOGLE_APPLICATION_CREDENTIALS / emulator)
    app = appMod.initializeApp({ credential: appMod.applicationDefault(), ...(projectId ? { projectId } : {}) });
  }

  const fs: AnyFs = databaseId && databaseId !== '(default)' ? fsMod.getFirestore(app, databaseId) : fsMod.getFirestore(app);
  try {
    fs.settings({ ignoreUndefinedProperties: true });
  } catch {
    /* settings() can only be called once */
  }
  const store = new FirestoreStore(fs, fsMod.FieldValue);

  // Fail fast if the server identity cannot reach the database.
  await store.get('_health', 'ping');
  return store;
}

let singleton: Store | null = null;

export function getStore(): Store {
  if (!singleton) throw new Error('Store not initialised. Call initStore() at startup.');
  return singleton;
}

/** For tests. */
export function setStore(store: Store): void {
  singleton = store;
}

/**
 * Picks the backend:
 *  - DATA_STORE=memory      -> MemoryStore (explicit; data is lost on restart)
 *  - DATA_STORE=firestore   -> Firestore, fail if unreachable
 *  - unset, production      -> Firestore, FAIL CLOSED if unreachable (never silently lose data)
 *  - unset, development     -> Firestore if credentials are configured, otherwise MemoryStore
 */
export async function initStore(): Promise<Store> {
  const mode = (process.env.DATA_STORE || '').toLowerCase();
  const isProd = process.env.NODE_ENV === 'production';
  const hasCreds = Boolean(
    process.env.FIREBASE_SERVICE_ACCOUNT ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      process.env.FIRESTORE_EMULATOR_HOST ||
      process.env.K_SERVICE // Cloud Run provides ADC
  );

  if (mode === 'memory') {
    console.warn('[store] DATA_STORE=memory: using volatile in-memory storage (data is lost on restart).');
    singleton = new MemoryStore();
    return singleton;
  }

  if (mode === 'firestore' || isProd || hasCreds) {
    try {
      singleton = await createFirestoreStore();
      console.log('[store] Connected to Firestore via Admin SDK.');
      return singleton;
    } catch (err: any) {
      if (mode === 'firestore' || isProd) {
        throw new Error(
          `Firestore Admin connection failed: ${err?.message || err}. ` +
            'Provide FIREBASE_SERVICE_ACCOUNT (JSON or base64) or run with Application Default Credentials ' +
            'and grant the identity the "Cloud Datastore User" role. Set DATA_STORE=memory only for local demos.'
        );
      }
      console.warn(`[store] Firestore unavailable (${err?.message || err}); falling back to in-memory storage.`);
    }
  }

  console.warn('[store] No Firestore credentials configured: using volatile in-memory storage (development only).');
  singleton = new MemoryStore();
  return singleton;
}
