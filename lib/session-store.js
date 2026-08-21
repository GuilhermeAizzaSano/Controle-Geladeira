// lib/session-store.js
'use strict';
const crypto = require('crypto');
const { createSchema } = require('./schema');
const { logError } = require('./log');

const SESSION_TTL_MIN  = 15;
const IDLE_EXTEND_MIN  = 15;
const IDLE_THRESH_MS   = 2 * 60 * 1000;
const CACHE_TTL_MS   = 30 * 1000;

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function createSessionStore(pool) {
  const cache = new Map();

  // DDL da tabela vive em lib/schema.js junto com o resto do schema do projeto —
  // este módulo só consome a tabela (CRUD de sessões), não é dono do DDL.
  async function ensureSessionsTable() {
    await createSchema({ pool, logError }).ensureSessionsSchema();
  }

  async function createSession({ userId, isAdmin }) {
    const raw  = crypto.randomBytes(32).toString('hex');
    const hash = hashToken(raw);
    await pool.query(
      `INSERT INTO sessions (token_hash, user_id, is_admin, expires_at)
       VALUES ($1, $2, $3, now() + interval '${SESSION_TTL_MIN} minutes')`,
      [hash, userId, isAdmin]
    );
    return raw;
  }

  async function getSession(raw) {
    const hash = hashToken(raw);
    const now  = Date.now();
    const cached = cache.get(hash);
    if (cached && now < cached.validUntil) return cached.sess;

    const result = await pool.query(
      `SELECT user_id, is_admin, created_at, last_seen_at
       FROM sessions
       WHERE token_hash = $1 AND expires_at > now()`,
      [hash]
    );
    if (!result.rows.length) { cache.delete(hash); return null; }

    const row  = result.rows[0];
    const sess = { userId: row.user_id, isAdmin: row.is_admin, createdAt: row.created_at };

    const lastSeen = new Date(row.last_seen_at).getTime();
    if (now - lastSeen > IDLE_THRESH_MS) {
      await pool.query(
        `UPDATE sessions
         SET last_seen_at = now(),
             expires_at   = LEAST(created_at + interval '${SESSION_TTL_MIN} minutes',
                                  now()       + interval '${IDLE_EXTEND_MIN} minutes')
         WHERE token_hash = $1`,
        [hash]
      );
    }

    cache.set(hash, { sess, validUntil: now + CACHE_TTL_MS });
    return sess;
  }

  async function destroySession(raw) {
    const hash = hashToken(raw);
    cache.delete(hash);
    await pool.query('DELETE FROM sessions WHERE token_hash = $1', [hash]);
  }

  async function destroyUserSessions(userId) {
    for (const [h, entry] of cache.entries()) {
      if (entry.sess.userId === userId) cache.delete(h);
    }
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
  }

  async function sweepExpiredSessions() {
    await pool.query("DELETE FROM sessions WHERE expires_at < now()");
  }

  return { ensureSessionsTable, createSession, getSession, destroySession, destroyUserSessions, sweepExpiredSessions };
}

module.exports = { createSessionStore };
