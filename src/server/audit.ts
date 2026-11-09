/**
 * Security / audit logging (server-side). Never throws into the request path.
 */
import { newId } from '../lib/security.js';
import { clientIp } from './auth.js';
import { saveSecurityLogToDb } from './db.js';
import type { SecurityLog, SecurityEventType } from '../types.js';

export type AuditFn = (
  eventType: SecurityEventType,
  severity: SecurityLog['severity'],
  description: string,
  req: any,
  userEmail: string,
  userId?: string,
  role?: SecurityLog['role']
) => Promise<SecurityLog>;

export const logSecurityEvent: AuditFn = async (eventType, severity, description, req, userEmail, userId, role = 'system') => {
  const log: SecurityLog = {
    id: newId('sec'),
    userId,
    userEmail,
    role,
    eventType,
    severity,
    description: String(description).slice(0, 500),
    ipAddress: req ? clientIp(req) : '0.0.0.0',
    userAgent: req?.headers ? String(req.headers['user-agent'] || 'unknown').slice(0, 200) : undefined,
    timestamp: new Date().toISOString()
  };
  try {
    await saveSecurityLogToDb(log);
  } catch (err) {
    console.warn('[audit] could not persist security log:', (err as any)?.message);
  }
  if (severity === 'HIGH' || severity === 'CRITICAL') {
    console.warn(`[SecurityEvent] ${eventType} (${severity}) ${userEmail}: ${log.description}`);
  }
  return log;
};
