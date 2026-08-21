const { parseBoolean } = require('./parsers');

/**
 * Middleware que atribui um request id e aplica os headers de segurança
 * (CSP, X-Frame-Options, HSTS condicional, etc).
 *
 * @param {{ enableHsts: boolean }} config
 */
function securityHeaders(config) {
  return (req, res, next) => {
    const requestId =
      req.headers['x-request-id'] ||
      `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    req.requestId = String(requestId);

    res.setHeader('X-Request-Id', req.requestId);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; " +
      "script-src 'self'; " +
      "style-src 'self' 'unsafe-inline'; " +
      "font-src 'self'; " +
      "img-src 'self' data:; " +
      "connect-src 'self'; " +
      "base-uri 'self'; " +
      "form-action 'self'; " +
      "frame-ancestors 'self'; " +
      "object-src 'none'"
    );

    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
    if (parseBoolean(config.enableHsts, false) && isHttps) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  };
}

/**
 * Middleware que aplica timeout de request/response.
 *
 * @param {{ requestTimeoutMs: number }} config
 */
function requestTimeout(config) {
  return (req, res, next) => {
    req.setTimeout(config.requestTimeoutMs);
    res.setTimeout(config.requestTimeoutMs);
    next();
  };
}

module.exports = { securityHeaders, requestTimeout };
