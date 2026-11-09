/**
 * Outbound email (server-side only).
 *
 *  - Every message is stored in the `emails` log (scoped by landlordId / recipient so users can only
 *    read their own).
 *  - There is NO public "send arbitrary email" endpoint any more; callers are server code or
 *    authorised routes that build the message from trusted templates.
 *  - OTP e-mails are never written to the readable log (the code would otherwise be visible to anyone
 *    who can read the log).
 */
import { sendPersonalizedEmail, generateUniqueSerialNumber } from '../lib/emailService.js';
import { saveEmailToDb } from './db.js';
import { newId, escapeHtml } from '../lib/security.js';
import type { EmailLog } from '../types.js';

export interface DispatchOptions {
  recipientEmail: string;
  recipientName: string;
  subject: string;
  bodyHtml: string;
  emailType: EmailLog['emailType'];
  prefix?: 'INV' | 'RCT' | 'OTP' | 'SEC' | 'QTE' | 'WLC' | 'MNT' | 'SUB';
  documentId?: string;
  serialNumber?: string;
  landlordId?: string;
  attachments?: Array<{ filename: string; content?: any; path?: string; contentType?: string; encoding?: string }>;
  /** When true the body is NOT stored in the log (OTPs, secrets). */
  sensitive?: boolean;
}

export interface DispatchResult {
  success: boolean;
  serialNumber: string;
  externalDelivered: boolean;
  emailLog: EmailLog;
}

export async function dispatchSystemEmail(options: DispatchOptions): Promise<DispatchResult> {
  const serial = options.serialNumber || generateUniqueSerialNumber(options.prefix || 'SEC');
  const delivery = await sendPersonalizedEmail({
    recipientEmail: options.recipientEmail,
    recipientName: options.recipientName,
    subject: options.subject,
    bodyHtml: options.bodyHtml,
    emailType: options.emailType,
    serialNumber: serial,
    documentId: options.documentId,
    attachments: options.attachments
  });

  const emailLog: EmailLog = {
    id: newId('email'),
    landlordId: options.landlordId,
    serialNumber: serial,
    recipientEmail: options.recipientEmail.toLowerCase(),
    recipientName: options.recipientName,
    subject: options.subject,
    bodyHtml: options.sensitive ? '<p>Security message (content withheld from the in-app log).</p>' : options.bodyHtml,
    emailType: options.emailType,
    sentAt: new Date().toISOString(),
    readStatus: false,
    documentId: options.documentId,
    externalDeliveryStatus: delivery.externalDelivered ? 'delivered' : 'simulated_fallback',
    deliveryMessageId: delivery.messageId,
    deliveryError: delivery.error ? String(delivery.error).slice(0, 200) : undefined
  };
  try {
    await saveEmailToDb(emailLog);
  } catch (err) {
    console.warn('[mailer] could not persist email log:', (err as any)?.message);
  }
  return { success: true, serialNumber: serial, externalDelivered: delivery.externalDelivered, emailLog };
}

/** OTP email. In development with no SMTP the code is printed to the server console ONLY (never returned to the client). */
export async function sendOtpEmail(opts: {
  to: string; name: string; otp: string; purpose: string; minutes?: number; landlordId?: string;
}): Promise<boolean> {
  const serial = generateUniqueSerialNumber('OTP');
  const mins = opts.minutes ?? 5;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px">
      <p>Your EstateMaster verification code for <strong>${escapeHtml(opts.purpose)}</strong> is:</p>
      <p style="font-size:30px;letter-spacing:6px;font-weight:700;font-family:monospace">${escapeHtml(opts.otp)}</p>
      <p style="color:#475569;font-size:13px">It expires in ${mins} minutes and can be used once. EstateMaster staff will never ask you for this code.
      If you did not request it, change your password immediately.</p>
    </div>`;
  const r = await dispatchSystemEmail({
    recipientEmail: opts.to,
    recipientName: opts.name,
    subject: `Your EstateMaster verification code`,
    bodyHtml: html,
    emailType: 'Security OTP',
    serialNumber: serial,
    prefix: 'OTP',
    landlordId: opts.landlordId,
    sensitive: true
  });
  if (!r.externalDelivered && process.env.NODE_ENV !== 'production') {
    console.log(`[dev-otp] ${opts.purpose} code for ${opts.to}: ${opts.otp}  (SMTP not configured; shown only in server console)`);
  }
  return r.externalDelivered;
}
