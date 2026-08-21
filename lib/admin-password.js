'use strict';
const crypto = require('crypto');

function getDefaultAdminPassword() {
  if (process.env.ADMIN_DEFAULT_PASSWORD) return process.env.ADMIN_DEFAULT_PASSWORD;
  const generated = crypto.randomBytes(16).toString('hex');
  console.warn(`[admin-password] ADMIN_DEFAULT_PASSWORD not set — generated ephemeral password: ${generated}`);
  return generated;
}

const DEFAULT_ADMIN_PASSWORD = getDefaultAdminPassword();

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;

function hashAdminPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(plain, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${salt}$${hash.toString('hex')}`;
}

function verifyAdminPassword(plain, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, hashHex] = parts;
  try {
    const hashBuf = Buffer.from(hashHex, 'hex');
    const derived = crypto.scryptSync(plain, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
    if (derived.length !== hashBuf.length) return false;
    return crypto.timingSafeEqual(derived, hashBuf);
  } catch {
    return false;
  }
}

function validateAdminPasswordStrength(plain) {
  if (!plain || typeof plain !== 'string') return false;
  return plain.length >= 6 && plain.length <= 100;
}

module.exports = { hashAdminPassword, verifyAdminPassword, validateAdminPasswordStrength, DEFAULT_ADMIN_PASSWORD };
