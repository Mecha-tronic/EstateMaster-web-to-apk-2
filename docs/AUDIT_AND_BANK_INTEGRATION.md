# EstateMaster — Security audit, payment audit and Kenyan bank integration

Scope: `Mecha-tronic/EstateMaster-web-to-apk-2` (React 19 / Vite / Capacitor Android, Express server, Firestore, M-Pesa Daraja).
Result: the app now runs behind a server that owns all data and all money movement. 101 automated tests pass and the server and UI type-check clean. The parts that need real credentials or real packages are listed under "What was not run".

---

## 1. Executive audit summary

### 1.1 Critical security findings (all fixed)

| # | Finding | Root cause | Remedy |
|---|---------|-----------|--------|
| S1 | Anyone could read or change every tenant's and landlord's data | The browser talked to Firestore directly and the rules were open; the "API" client also fell back to local records | `firestore.rules` is deny-all. All data goes through the Express API using the Admin SDK. The browser holds no database access. |
| S2 | Accounts could be taken over: passwords were stored in readable form and checked in the browser | Client-side login against stored records, plaintext `password` fields, fabricated local logins | Passwords are scrypt-hashed on the server (legacy records are verified once and upgraded). Login is server-side only. Existing plaintext values are removed by the startup migration. |
| S3 | A landlord could mark their own subscription as paid | Subscription screens wrote `subscriptionStatus: Active` from the browser | Activation happens only on the server after Safaricom or the bank confirms the money. Lock screen, renewal modal and registration no longer claim a payment. |
| S4 | A tenant could record a payment by typing any reference | `recordPayment` was callable by tenants and trusted the typed reference | Tenants get `403 USE_VERIFICATION`. They use `/api/banks/verify-transaction`, which only succeeds when the bank's signed notification or live query confirms the reference. |
| S5 | Fake M-Pesa payments were possible | Simulate endpoints and an open, unauthenticated callback | Simulate endpoints removed. Callbacks live on a secret path and are confirmed with a Daraja STK Query before posting. |
| S6 | Cross-account access (IDOR) and mass assignment | Handlers trusted ids and body fields from the client | Every record is checked against the session's landlord or tenant id. Writes use field allow-lists. The role is pinned to the session. |
| S7 | Session theft and brute force | Long-lived tokens, no lockout | Opaque tokens stored as SHA-256 hashes, 30 min idle and 12 h absolute expiry, per-email lockout stored in the database (unknown emails too), generic login errors, rate limits. |
| S8 | No second factor, weak reset flow | — | Email OTP 2FA (hashed, single use, attempt-limited), step-up for sensitive actions, forgot/reset password with a decoy handle so existence of an email is not revealed, forced password change for old or demo passwords. |
| S9 | Receipt and statement PDFs reachable without proof of ownership | Plain URLs | Signed, expiring links; a bad link returns 404. Ownership is checked on every download. |
| S10 | Wildcard CORS, Android backups and cleartext traffic allowed | Defaults | CORS is an allow-list (never `*`). `allowBackup=false`, `usesCleartextTraffic=false`. The server refuses to start in production without required secrets. |
| S11 | The Firebase web config (project id and API key) was committed and was the entry point for S1 | The browser SDK needed it; with open rules it gave anyone full database access | No code uses the browser SDK any more and the rules deny all client access. Delete `firebase-applet-config.json` and its `.bak` from the repo, and rotate the web API key in the Firebase console. All other credentials (bank, Daraja, SMTP, Gemini) are read only from server environment variables; the browser only receives configured / not-configured flags. |

### 1.2 Payment and record-adjustment findings (all fixed)

| # | Finding | Root cause | Remedy |
|---|---------|-----------|--------|
| P1 | The same bank deposit could be recorded twice | References were compared as typed. `FT-26301-ABC`, `ft26301abc` and a look-alike Unicode version counted as different | Reference identity is normalised (NFKC, upper case, letters and digits only). Non-ASCII look-alikes are rejected. A claim document is created atomically per reference, so only one request can ever win, even under concurrency. |
| P2 | Re-uploading a bank statement double-posted every row | The CSV parser invented a random reference when a row had none | Rows without a genuine bank reference are blocked in the UI and rejected by the server. Parsing is deterministic. |
| P3 | Debits could be read as credits | The parser scanned columns backwards for any positive number | With a header row only the Credit column is read. Without one, the last column is the credit. Covered by tests. |
| P4 | Arrears were counted twice | Unpaid balances were added to the next invoice while the old invoice still showed as owing | Carry-forward is computed on the server in a transaction. The old invoice shows status "Carried Forward" with nothing owing. One invoice per tenant per period. |
| P5 | Two tenants with the same name shared one ledger | Grouping and matching by name in the payment tracker, tenant portal and Excel export | Everything is keyed by tenant id. |
| P6 | Overpayment and wrong-invoice posting | Amount was not checked against the balance | The server rejects amounts above the balance. Deposits that are ambiguous or too large go to the Unaccounted queue instead of being guessed. |
| P7 | Unaccounted queue could be used to create money | A "log received payment" form let a landlord invent a deposit and then assign it | Removed. Entries only come from signed bank/M-Pesa notifications and statement uploads. Landlords can assign or dismiss (with a reason). |
| P8 | Reversals were unaudited | — | Reversal needs the landlord's password and a reason, restores the invoice balance, keeps the reference permanently used, and writes to the audit log. |
| P9 | The reconciler reported success for every selected row | The UI counted selected rows, not outcomes | Each row now shows what the server did: posted, queued, already recorded or rejected, with the reason. |
| P10 | Hard-coded phone number and demo shortcuts in payment screens | Development leftovers | Removed. No sandbox PIN simulation. |

### 1.3 Algorithmic bottlenecks

- Matching used name fragments only. It now ranks by invoice reference (highest), unit number with corroboration, then phone number. It auto-posts only with a clear winner and an amount not above the balance.
- Webhooks are verified on the raw request body, within a replay window, behind a rate limit and an optional IP/CIDR allow-list.
- Statement uploads are capped (2,000 rows parsed, 500 sent per run, 1.5 MB).

---

## 2. Bank integration architecture

```
Bank webhook ─► raw-body signature check ─► normaliser ─┐
M-Pesa Daraja callback (secret path + STK Query) ───────┤
M-Pesa C2B confirmation ────────────────────────────────┤──► NormalizedBankTxn ─► matcher ─► ledger (atomic, one claim per reference)
Tenant verify-transaction (live query by reference) ────┤                              │
Statement upload (landlord) ────────────────────────────┘                              ├─► Payment (with bankAudit trail)
                                                                                         └─► UnaccountedPayment queue
```

### 2.1 Endpoints

| Method and path | Purpose |
|-----------------|---------|
| `POST /api/banks/equity/callback` | Equity Jenga IPN (Equity account, Paybill, Equitel) |
| `POST /api/banks/kcb/callback` | KCB Buni notification |
| `POST /api/banks/coop/callback` | Co-op account notification |
| `POST /api/banks/pesalink/callback` | PesaLink / IPSL credit relay |
| `POST /api/banks/verify-transaction` | Verify one reference for one invoice (tenant or landlord) |
| `GET /api/banks/verifications/:id` | Live progress for a verification |
| `GET /api/banks/status` | Credentials, OAuth handshake, webhook-security and live-query health per bank (landlords see flags only; platform admins see diagnostics) |
| `GET /api/banks/rails` | Which settlement options a tenant can use and the landlord's receiving details |
| `GET /api/banks/subscription-instructions` | Licence payment channels and the landlord's `SUB-XXXXXXXX` reference |
| `GET /api/payments/unaccounted`, `POST …/:id/assign`, `POST …/:id/ignore` | Manual assignment queue |
| `POST /api/payments/reconcile-statement` | Statement rows through the same engine |
| `POST /api/payments/:id/reverse` | Audited reversal |
| `POST /api/mpesa/stk-push`, `GET /api/mpesa/query/:id` | Rent STK prompt and status |

### 2.2 Security rules for webhooks

- Verified on the **raw body**: HMAC-SHA256 (hex or base64), RSA-SHA256 public key, or Basic credentials. At least one must be configured per bank, otherwise the endpoint answers 503 and posts nothing.
- Optional timestamp header with a maximum skew; optional IP/CIDR allow-list; request size limit.
- `BANK_WEBHOOKS_ALLOW_UNSIGNED_DEV` exists for local curl testing and is refused in production.
- A bank reference can be redeemed once (see P1). A reversed payment keeps its reference burned.

### 2.3 Frontend

| Component | Change |
|-----------|--------|
| `BankVerificationPanel` (new) | Tenant or landlord picks Equity, KCB, Co-op, PesaLink or M-Pesa, sees the invoice reference to quote and the receiving details, enters the bank reference, and watches a live step-by-step verification. Receipt download when verified. |
| `PaymentReceiptAuditCard` (new) | Shows the bank audit trail (bank, reference, channel, how verified, signature check, bank time, matched by) and downloads the PDF receipt. Landlord-typed payments are labelled "Recorded by landlord (not bank-verified)". |
| `BankConnectionsStatus` (new) | Live health of each bank connection plus the webhook addresses to register. |
| `SubscriptionPaymentPanel` (new) | Licence payment by M-Pesa prompt or bank. Only the server can activate. |
| `TenantPortalView` | Payment modal rebuilt: M-Pesa prompt with live confirmation, or direct bank settlement with live verification. Audit card on every payment. Carried-forward invoices are not payable. |
| `PaymentTrackerView` | New Bank Connections tab, Verify Bank / M-Pesa Payment modal, Proof column on every payment, audited reversal, carried-forward status, tenants keyed by id. |
| `BankStatementReconciler` | Deterministic parsing, rows without a reference blocked, per-row server outcome and summary. |
| `UnaccountedPaymentsQueue` | Server-backed assign and dismiss; manual-entry form removed. |

---

## 3. Files

New server code: `server.ts` (bootstrap), `src/server/*` (store, auth, accounts, billing, M-Pesa, bank routes, ledger, migration, config), `src/lib/bankService.ts` (Jenga, KCB, Co-op drivers, PesaLink, normaliser), `src/lib/security.ts`.
Client: `src/lib/api.ts` (thin client, no local fallbacks), the components above, `ForgotPasswordPanel`, `ForcedPasswordChange`, and updates to `App.tsx`, `SignInView`, `TwoFactorModal`, `LandlordRegistrationModal`, `SecurityShieldDashboard`.
Infra: `firestore.rules`, `package.json` (firebase-admin replaces the client SDK), `AndroidManifest.xml`, `.env.example`.
Tests: `tests/core.test.ts`, `tests/routes.test.ts`, `tests/arrears.test.ts`, `tests/reconciliation.test.ts` (101 tests).

## 4. New environment variables

See `.env.example` for the complete annotated list. The ones you must set:

| Variable | Needed for |
|----------|-----------|
| `NODE_ENV=production`, `APP_URL`, `LINK_SIGNING_SECRET` (32+ chars) | Server start in production |
| `DATA_STORE=firestore`, `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT` (or `GOOGLE_APPLICATION_CREDENTIALS`) | Database |
| `JENGA_MERCHANT_CODE`, `JENGA_CONSUMER_SECRET`, `JENGA_API_KEY`, `JENGA_ACCOUNT_NUMBER`, `JENGA_PRIVATE_KEY_PEM`; `JENGA_WEBHOOK_HMAC_SECRET` or `JENGA_WEBHOOK_PUBLIC_KEY` or Basic user/pass | Equity |
| `KCB_APP_KEY`, `KCB_APP_SECRET`, `KCB_ACCOUNT_NUMBER`; `KCB_WEBHOOK_*` | KCB Buni |
| `COOP_CONSUMER_KEY`, `COOP_CONSUMER_SECRET`, `COOP_ACCOUNT_NUMBER`; `COOP_WEBHOOK_*` | Co-op |
| `PESALINK_WEBHOOK_*` | PesaLink relay |
| `BANKS_ENVIRONMENT` (`sandbox` or `production`) | Default bank base URLs |
| `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_PASSKEY`, `MPESA_SHORTCODE`, `MPESA_CALLBACK_SECRET` (16+ chars) | Daraja |
| `PLATFORM_ADMIN_EMAILS`, `PLATFORM_SUBSCRIPTION_AMOUNT`, `PLATFORM_*_PAYBILL/ACCOUNT` | Licence payments |
| `SMTP_*` or `GMAIL_*` or `RESEND_API_KEY`; `GEMINI_API_KEY` | E-mail OTP and receipts; AI features |

## 5. Breaking changes and migration

1. The server is now required. The old standalone/local-storage mode is gone.
2. Run `npm install` (adds `firebase-admin`, removes the client Firebase SDK).
3. On first start the migration hashes legacy passwords. Accounts that used weak or demo passwords must use **Forgot password**.
4. Records whose owner cannot be determined are hidden rather than shown to the wrong person.
5. M-Pesa STK prompts settle to the platform shortcode configured in `MPESA_*`.
6. Android no longer allows cleartext HTTP; the server must be on HTTPS.
7. `firebase-applet-config.json` and its `.bak` are unused by the code. Delete them and rotate the Firebase web API key (it is in the repo history).

## 6. What was not run

- The Express server, Vite build, React rendering, `firebase-admin`, `nodemailer` and `pdfkit` could not be executed in the review environment (no package registry access). The server logic is covered by tests through an in-memory store and a fake router; the UI was type-checked against stub React types only. The production server bundle compiles with esbuild.
- Bank connections have **not** been exercised against live bank sandboxes. The OAuth flows, field names and signature schemes follow each bank's public developer documentation but every path, header name and signature format is overridable through environment variables because each merchant onboarding pack differs. Confirm them against your own pack and test in the bank sandboxes before going live.
- Run `npm test`, `npm run lint` and `npm run build` after `npm install`, then walk through: register landlord → pay licence → add property/unit → register tenant → tenant pays by STK and by bank reference → reverse a payment.
