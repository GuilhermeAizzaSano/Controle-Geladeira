// lib/cookie-helpers.js
'use strict';

const SESSION_COOKIE = 'session';
const CSRF_COOKIE    = 'csrf';

function parseCookies(req) {
  const header = req.headers?.cookie;
  const map = new Map();
  if (!header) return map;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) map.set(key, decodeURIComponent(val));
  }
  return map;
}

function _buildCookieString(name, value, { httpOnly, secure, maxAge }) {
  let s = `${name}=${encodeURIComponent(value)}; SameSite=Strict; Path=/`;
  if (httpOnly)             s += '; HttpOnly';
  if (secure)               s += '; Secure';
  if (maxAge !== undefined) s += `; Max-Age=${maxAge}`;
  return s;
}

function setSessionCookie(res, token, cookieSecure) {
  res.append('Set-Cookie',
    _buildCookieString(SESSION_COOKIE, token, { httpOnly: true, secure: !!cookieSecure }));
}

function clearSessionCookie(res, cookieSecure) {
  res.append('Set-Cookie',
    _buildCookieString(SESSION_COOKIE, '', { httpOnly: true, secure: !!cookieSecure, maxAge: 0 }));
}

function setCsrfCookie(res, token, cookieSecure) {
  res.append('Set-Cookie',
    _buildCookieString(CSRF_COOKIE, token, { httpOnly: false, secure: !!cookieSecure }));
}

function parseSessionTokenFromCookie(req) {
  return parseCookies(req).get(SESSION_COOKIE) || null;
}

function parseCsrfTokenFromCookie(req) {
  return parseCookies(req).get(CSRF_COOKIE) || null;
}

module.exports = {
  parseCookies, setSessionCookie, clearSessionCookie,
  setCsrfCookie, parseCsrfTokenFromCookie, parseSessionTokenFromCookie,
};
