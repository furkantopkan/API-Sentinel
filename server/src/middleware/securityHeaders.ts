import type { RequestHandler } from 'express';
import { AppError } from '../errors/AppError';

/**
 * The page and the API only ever load from this server. The page has no
 * inline scripts, so script-src 'self' holds; React sets style attributes,
 * hence 'unsafe-inline' for styles only. Routes may set a stricter policy
 * (the downloadable HTML report does).
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  // No other site may show this app in a frame and trick the user into clicks.
  "frame-ancestors 'none'",
].join('; ');

export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  next();
};

const LOCAL_NAMES = new Set(['localhost', '127.0.0.1', '[::1]']);
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Cross-site request forgery: any web page can make the browser send a POST
 * to this local app (a form, or fetch without a body), and the Host header
 * still says localhost. Browsers mark such requests with the page's Origin,
 * so a change is accepted only from a local page or from no browser at all
 * (scripts and tests send no Origin).
 */
export const sameOriginChanges: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = req.headers.origin;
  if (origin === undefined) return next();
  let host = '';
  try {
    host = new URL(origin).hostname.toLowerCase();
  } catch {
    // "null" (a sandboxed frame or file) or anything unreadable: not a local page.
  }
  // URL keeps the brackets of an IPv6 host: "[::1]".
  if (!LOCAL_NAMES.has(host)) {
    throw new AppError('FORBIDDEN_ORIGIN', 'Changes are accepted only from this app.', 403);
  }
  next();
};
