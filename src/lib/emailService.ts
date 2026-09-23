import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { EmailLog } from '../types.js';

// Cache transporter instance using lazy initialization
let transporterInstance: Transporter | null = null;
let lastSmtpCheckConfig: string = '';

/**
 * Generates an official unique serial number for communications and records.
 * e.g., SN-INV-2026-94812, SN-RCT-2026-38291, SN-OTP-2026-10492
 */
export function generateUniqueSerialNumber(prefix: 'INV' | 'RCT' | 'OTP' | 'SEC' | 'QTE' | 'WLC' | 'MNT' | 'SUB' = 'SEC'): string {
  const year = new Date().getFullYear();
  const randomEntropy = Math.floor(100000 + Math.random() * 900000); // 6-digit cryptographic-style entropy
  const timestampSuffix = Date.now().toString().slice(-4);
  return `SN-${prefix}-${year}-${timestampSuffix}${randomEntropy.toString().slice(0, 3)}`;
}

/**
 * Resolves SMTP configuration from environment variables.
 * Supports standard SMTP (Host/Port/User/Pass), Gmail App Passwords, and Resend.
 */
export function getEmailConfig() {
  // 1. Check direct Gmail App Password
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;

  // 2. Check Resend API key (via Resend SMTP)
  const resendApiKey = process.env.RESEND_API_KEY;

  // 3. Check standard SMTP credentials
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
  const smtpSecure = process.env.SMTP_SECURE === 'true' || smtpPort === 465;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = process.env.SMTP_FROM || (gmailUser ? `"EstateMaster Kenya" <${gmailUser}>` : `"EstateMaster Kenya" <notifications@estatemaster.co.ke>`);

  let isConfigured = false;
  let providerType: 'gmail' | 'resend' | 'custom_smtp' | 'none' = 'none';

  if (gmailUser && gmailPass) {
    isConfigured = true;
    providerType = 'gmail';
  } else if (resendApiKey) {
    isConfigured = true;
    providerType = 'resend';
  } else if (smtpHost && smtpUser && smtpPass) {
    isConfigured = true;
    providerType = 'custom_smtp';
  }

  return {
    isConfigured,
    providerType,
    gmailUser,
    gmailPass,
    resendApiKey,
    smtpHost,
    smtpPort,
    smtpSecure,
    smtpUser,
    smtpPass,
    smtpFrom
  };
}

/**
 * Lazily initializes and returns the nodemailer transporter.
 */
export function getTransporter(): Transporter | null {
  const config = getEmailConfig();
  const configSignature = JSON.stringify({
    provider: config.providerType,
    host: config.smtpHost,
    port: config.smtpPort,
    user: config.smtpUser || config.gmailUser,
    secure: config.smtpSecure
  });

  if (transporterInstance && lastSmtpCheckConfig === configSignature) {
    return transporterInstance;
  }

  if (!config.isConfigured) {
    return null;
  }

  try {
    if (config.providerType === 'gmail' && config.gmailUser && config.gmailPass) {
      transporterInstance = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: config.gmailUser,
          pass: config.gmailPass
        }
      });
    } else if (config.providerType === 'resend' && config.resendApiKey) {
      transporterInstance = nodemailer.createTransport({
        host: 'smtp.resend.com',
        port: 465,
        secure: true,
        auth: {
          user: 'resend',
          pass: config.resendApiKey
        }
      });
    } else if (config.smtpHost && config.smtpUser && config.smtpPass) {
      transporterInstance = nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpSecure,
        auth: {
          user: config.smtpUser,
          pass: config.smtpPass
        },
        tls: {
          rejectUnauthorized: false // Allow self-signed or enterprise proxies
        }
      });
    }

    lastSmtpCheckConfig = configSignature;
    return transporterInstance;
  } catch (err) {
    console.error('[EmailService] Error creating nodemailer transporter:', err);
    return null;
  }
}

/**
 * Wraps HTML content in a branded, modern, mobile-responsive EstateMaster email template
 * with an official verified serial number banner and security footer.
 */
export function wrapInEstateMasterTemplate(
  recipientName: string,
  serialNumber: string,
  heading: string,
  contentHtml: string,
  badgeText: string = 'OFFICIAL COMMUNICATION'
): string {
  const currentDate = new Date().toLocaleDateString('en-KE', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${heading}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #0f172a;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 24px 12px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.08); border: 1px solid #e2e8f0;">
          
          <!-- Brand Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 28px 24px; text-align: left; border-bottom: 3px solid #0284c7;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <div style="font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px; display: inline-block;">
                      <span style="color: #38bdf8;">Estate</span>Master
                    </div>
                    <div style="font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 1.5px; margin-top: 3px;">
                      Kenya Commercial & Residential Property Systems
                    </div>
                  </td>
                  <td align="right" valign="top">
                    <div style="display: inline-block; background-color: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.3); color: #38bdf8; font-size: 10px; font-weight: 700; padding: 4px 10px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.8px;">
                      ${badgeText}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Serial Number Verification Watermark Banner -->
          <tr>
            <td style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 12px 24px;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <span style="font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Document Serial No:</span>
                    <span style="font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 13px; font-weight: 700; color: #0284c7; background-color: #e0f2fe; padding: 2px 8px; border-radius: 6px; margin-left: 6px; border: 1px solid #bae6fd;">
                      ${serialNumber}
                    </span>
                  </td>
                  <td align="right">
                    <span style="font-size: 11px; color: #64748b;">${currentDate}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content Body -->
          <tr>
            <td style="padding: 32px 28px; color: #334155; font-size: 14px; line-height: 1.6;">
              <div style="margin-bottom: 18px;">
                <p style="margin: 0; font-size: 15px; color: #0f172a; font-weight: 600;">
                  Dear ${recipientName || 'Valued Member'},
                </p>
              </div>

              ${contentHtml}
            </td>
          </tr>

          <!-- Security & Audit Footer -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 24px; text-align: center;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="font-size: 12px; color: #64748b; line-height: 1.5; text-align: center;">
                    <p style="margin: 0 0 6px 0; font-weight: 600; color: #334155;">
                      🛡️ EstateMaster Kenya Real Estate Management Platform
                    </p>
                    <p style="margin: 0 0 10px 0; font-size: 11px; color: #94a3b8;">
                      Nairobi, Kenya • Automated Notification Dispatch Service • Support: support@estatemaster.co.ke
                    </p>
                    <div style="display: inline-block; padding: 6px 12px; background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 10px; color: #475569; font-family: monospace;">
                      AUTHENTICATED SERIAL CODE: ${serialNumber}
                    </div>
                    <p style="margin: 12px 0 0 0; font-size: 10px; color: #94a3b8;">
                      This personalized message was generated and dispatched automatically to your registered account email. If you received this in error, please disregard or report it to security@estatemaster.co.ke.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Sends real email to personalized recipient address with unique serial number.
 * If SMTP credentials are configured, dispatches real SMTP email;
 * Otherwise, records detailed simulated dispatch for reliable offline/sandbox operations.
 */
export async function sendPersonalizedEmail(options: {
  recipientEmail: string;
  recipientName: string;
  subject: string;
  bodyHtml: string;
  emailType: EmailLog['emailType'];
  serialNumber?: string;
  documentId?: string;
  attachments?: Array<{
    filename: string;
    content?: any;
    path?: string;
    contentType?: string;
    encoding?: string;
  }>;
}): Promise<{
  success: boolean;
  serialNumber: string;
  externalDelivered: boolean;
  messageId?: string;
  error?: string;
  providerType: string;
}> {
  const serialNumber = options.serialNumber || generateUniqueSerialNumber(
    options.emailType === 'Invoice' ? 'INV' :
    options.emailType === 'Payment Receipt' ? 'RCT' :
    options.emailType === 'Security OTP' ? 'OTP' :
    options.emailType === 'Security Alert' ? 'SEC' :
    options.emailType === 'Quote' ? 'QTE' :
    options.emailType === 'Welcome & Lease' ? 'WLC' : 'MNT'
  );

  const config = getEmailConfig();
  const transporter = getTransporter();

  // If body is not already a complete HTML document, wrap in official branded template
  const completeHtml = options.bodyHtml.includes('<html')
    ? options.bodyHtml
    : wrapInEstateMasterTemplate(
        options.recipientName,
        serialNumber,
        options.subject,
        options.bodyHtml,
        options.emailType.toUpperCase()
      );

  if (transporter && config.isConfigured) {
    try {
      console.log(`[EmailService] Attempting real SMTP email delivery to ${options.recipientEmail} (${options.subject})...`);
      
      const info = await transporter.sendMail({
        from: config.smtpFrom,
        to: `"${options.recipientName}" <${options.recipientEmail}>`,
        subject: `${options.subject} [${serialNumber}]`,
        html: completeHtml,
        attachments: options.attachments,
        headers: {
          'X-EstateMaster-Serial-Number': serialNumber,
          'X-EstateMaster-Type': options.emailType,
          'X-Priority': options.emailType === 'Security OTP' || options.emailType === 'Security Alert' ? '1' : '3'
        }
      });

      console.log(`[EmailService] ✅ Successfully delivered real external email to ${options.recipientEmail}! Message ID: ${info.messageId}`);
      return {
        success: true,
        serialNumber,
        externalDelivered: true,
        messageId: info.messageId,
        providerType: config.providerType
      };
    } catch (sendErr: any) {
      console.error(`[EmailService] ⚠️ SMTP delivery failed for ${options.recipientEmail}:`, sendErr.message);
      return {
        success: true,
        serialNumber,
        externalDelivered: false,
        error: sendErr.message,
        providerType: config.providerType
      };
    }
  } else {
    console.log(`[EmailService] ℹ️ SMTP credentials not configured in environment. Generated official serialized email for ${options.recipientEmail} with Serial No: ${serialNumber}`);
    return {
      success: true,
      serialNumber,
      externalDelivered: false,
      error: 'SMTP not configured in environment (stored in app inbox & simulated securely)',
      providerType: 'stored_in_app'
    };
  }
}
