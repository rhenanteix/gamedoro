// src/utils/auth.js
// Centralized authentication helpers (hash, verify, token, code generation)
// The logic mirrors what was previously inline in server.js.
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');

// Resolve secret – same strategy as server.js
let SECRET = process.env.SECRET;
if (!SECRET) {
  const secretPath = path.join(__dirname, '..', '..', 'data', '.secret');
  if (fs.existsSync(secretPath)) {
    SECRET = fs.readFileSync(secretPath, 'utf8');
  } else {
    SECRET = crypto.randomBytes(32).toString('hex');
    // Ensure directory exists
    fs.mkdirSync(path.dirname(secretPath), { recursive: true });
    fs.writeFileSync(secretPath, SECRET, { mode: 0o600 });
  }
}

/**
 * Hash a password using scrypt with a random 16‑byte salt.
 * Returns "salt:hash" in hex.
 */
const hashPass = p => {
  const s = crypto.randomBytes(16);
  return s.toString('hex') + ':' + crypto.scryptSync(p, s, 64).toString('hex');
};

/**
 * Verify a password against a stored "salt:hash" string.
 */
const checkPass = (p, stored) => {
  const [s, h] = stored.split(':');
  const a = crypto.scryptSync(p, Buffer.from(s, 'hex'), 64);
  const b = Buffer.from(h, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

/**
 * HMAC helper used for JWT signing & verification.
 */
const mac = p => crypto.createHmac('sha256', SECRET).update(p).digest('base64url');

/**
 * Sign a JWT containing the user id and a 30‑day expiration.
 */
const sign = uid => {
  const payload = Buffer.from(JSON.stringify({ uid, exp: Date.now() + 30 * 864e5 })).toString('base64url');
  return payload + '.' + mac(payload);
};

/**
 * Verify a JWT, returning the uid if valid, otherwise null.
 */
const verify = t => {
  const [payload, signature] = String(t || '').split('.');
  if (!payload || !signature) return null;
  const expected = mac(payload);
  if (expected.length !== signature.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
    return null;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url'));
    return data.exp > Date.now() ? data.uid : null;
  } catch {
    return null;
  }
};

/**
 * Generate a short, human‑readable invitation code (6 characters).
 * Guarantees uniqueness by checking the users table – callers must supply a DB accessor.
 * The function returns a promise‑free value; the caller should pass a `one` helper.
 */
const newCode = (one) => {
  // `one` is a function that executes a single‑row SELECT returning the row or undefined.
  // It is injected to keep the utils file framework‑agnostic.
  for (;;) {
    const c = Array.from(crypto.randomBytes(6), b => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');
    if (!one('SELECT 1 FROM users WHERE code=?', c)) return c;
  }
};

module.exports = { hashPass, checkPass, mac, sign, verify, newCode };
