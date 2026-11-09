/**
 * Tiny structural HTTP types + helpers so route modules do not depend on Express
 * (they are unit-tested with a fake router in tests/).
 */
import type { ReqLike, ResLike } from './auth.js';

export type Handler = (req: ReqLike, res: ResLike, next?: (err?: any) => void) => any;

export interface App {
  get: (path: any, ...handlers: any[]) => any;
  post: (path: any, ...handlers: any[]) => any;
  patch: (path: any, ...handlers: any[]) => any;
  put?: (path: any, ...handlers: any[]) => any;
  delete: (path: any, ...handlers: any[]) => any;
}

/** Wraps an async handler: unexpected errors become a generic 500 (no internals leaked). */
export function h(fn: (req: ReqLike, res: ResLike) => Promise<any>): Handler {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err: any) {
      console.error(`[api] ${req.method} ${req.path} failed:`, err?.stack || err);
      if (!(res as any).headersSent) res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  };
}

export const body = (req: ReqLike): Record<string, any> => {
  const b = (req as any).body;
  return b && typeof b === 'object' && !Array.isArray(b) ? b : {};
};

export const str = (v: unknown, max = 200): string =>
  typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max) : '';

export const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
};

/** Picks only allow-listed keys (defence against mass assignment). */
export function pick<T extends Record<string, any>>(src: Record<string, any>, keys: readonly (keyof T & string)[]): Partial<T> {
  const out: Record<string, any> = {};
  for (const k of keys) if (src[k] !== undefined) out[k] = src[k];
  return out as Partial<T>;
}
