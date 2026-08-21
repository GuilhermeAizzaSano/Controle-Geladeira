const crypto = require('crypto');

const ADMIN_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const ADMIN_CHALLENGE_MAX_ATTEMPTS = 5;

/**
 * Fábrica dos middlewares/estado de sessão e autenticação.
 *
 * @param {{ pool: import('pg').Pool, sessionStore: object, cookieHelpers: object, logError: Function }} deps
 */
function createAuth({ pool, sessionStore, cookieHelpers, logError }) {
  const adminChallenges = new Map();

  function generateToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  // Varre challenges de admin expirados e sessões expiradas a cada hora.
  const sweepInterval = setInterval(async () => {
    const now = Date.now();
    for (const [ch, data] of adminChallenges.entries()) {
      if (now - data.createdAt > ADMIN_CHALLENGE_TTL_MS) adminChallenges.delete(ch);
    }
    try {
      await sessionStore.sweepExpiredSessions();
    } catch (err) {
      logError('sweepExpiredSessions', err);
    }
  }, 60 * 60 * 1000);

  async function requireAuth(req, res, next) {
    const raw = cookieHelpers.parseSessionTokenFromCookie(req);
    if (!raw) return res.status(401).json({ error: 'Não autenticado.' });
    try {
      const sess = await sessionStore.getSession(raw);
      if (!sess) return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
      req.session = sess;
      next();
    } catch (err) {
      logError('requireAuth', err, req);
      res.status(500).json({ error: 'Erro interno.' });
    }
  }

  async function requireAdmin(req, res, next) {
    const raw = cookieHelpers.parseSessionTokenFromCookie(req);
    if (!raw) return res.status(401).json({ error: 'Não autenticado.' });
    try {
      const sess = await sessionStore.getSession(raw);
      if (!sess) return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
      if (!sess.isAdmin) return res.status(403).json({ error: 'Acesso negado.' });
      req.session = sess;
      next();
    } catch (err) {
      logError('requireAdmin', err, req);
      res.status(500).json({ error: 'Erro interno.' });
    }
  }

  function requireCsrf(req, res, next) {
    const header = req.headers['x-csrf-token'];
    const cookie = cookieHelpers.parseCsrfTokenFromCookie(req);
    if (
      !header || !cookie ||
      header.length !== cookie.length ||
      !crypto.timingSafeEqual(Buffer.from(header), Buffer.from(cookie))
    ) {
      return res.status(403).json({ error: 'CSRF token inválido.' });
    }
    next();
  }

  return {
    adminChallenges,
    ADMIN_CHALLENGE_TTL_MS,
    ADMIN_CHALLENGE_MAX_ATTEMPTS,
    generateToken,
    requireAuth,
    requireAdmin,
    requireCsrf,
    sweepInterval,
  };
}

module.exports = { createAuth, ADMIN_CHALLENGE_TTL_MS, ADMIN_CHALLENGE_MAX_ATTEMPTS };
