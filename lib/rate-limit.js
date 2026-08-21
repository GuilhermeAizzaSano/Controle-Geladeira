/**
 * Fábrica do rate limiting de login e de rotas admin.
 *
 * @param {{ loginRateWindowMs: number, loginRateMaxAttempts: number,
 *           enableAdminRateLimit: boolean, adminRateWindowMs: number,
 *           adminRateMaxRequests: number, trustProxy: boolean }} config
 */
function createRateLimit(config) {
  const loginAttempts = new Map();
  const adminRateTracker = new Map();

  function getClientIp(req) {
    if (config.trustProxy) {
      return req.ip || 'unknown';
    }
    return req.socket?.remoteAddress || 'unknown';
  }

  function loginRateState(ip) {
    const now = Date.now();
    const current = loginAttempts.get(ip);
    if (!current || now >= current.resetAt) {
      const next = { count: 0, resetAt: now + config.loginRateWindowMs };
      loginAttempts.set(ip, next);
      return next;
    }
    return current;
  }

  function isLoginRateLimited(ip) {
    return loginRateState(ip).count >= config.loginRateMaxAttempts;
  }

  function registerLoginAttempt(ip, success) {
    if (success) {
      loginAttempts.delete(ip);
      return;
    }
    const state = loginRateState(ip);
    state.count += 1;
    if (loginAttempts.size > 5000) {
      const now = Date.now();
      for (const [key, value] of loginAttempts.entries()) {
        if (now >= value.resetAt) loginAttempts.delete(key);
      }
    }
  }

  function adminRateState(ip) {
    const now = Date.now();
    const current = adminRateTracker.get(ip);
    if (!current || now >= current.resetAt) {
      const next = { count: 0, resetAt: now + config.adminRateWindowMs };
      adminRateTracker.set(ip, next);
      return next;
    }
    return current;
  }

  function adminRateLimitMiddleware(req, res, next) {
    if (!config.enableAdminRateLimit) return next();
    const ip = getClientIp(req);
    const state = adminRateState(ip);
    if (state.count >= config.adminRateMaxRequests) {
      return res
        .status(429)
        .json({ error: 'Muitas requisições administrativas. Tente novamente em instantes.' });
    }
    state.count += 1;
    next();
  }

  return {
    getClientIp,
    isLoginRateLimited,
    registerLoginAttempt,
    adminRateLimitMiddleware,
  };
}

module.exports = { createRateLimit };
