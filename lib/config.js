const { parseBoolean } = require('./parsers');

// ─── Configuração de ambiente ─────────────────────────────
// Lida uma única vez no boot. `Object.freeze` evita mutação acidental em
// runtime — qualquer módulo que precise de config recebe este objeto único.
const config = Object.freeze({
  requestTimeoutMs: Number.parseInt(process.env.REQUEST_TIMEOUT_MS || '15000', 10),
  trustProxy: parseBoolean(process.env.TRUST_PROXY, false),
  enableHsts: parseBoolean(process.env.ENABLE_HSTS, false),

  enableAdminRateLimit: parseBoolean(process.env.ENABLE_ADMIN_RATE_LIMIT, false),
  adminRateWindowMs: Number.parseInt(process.env.ADMIN_RATE_WINDOW_MS || '60000', 10),
  adminRateMaxRequests: Number.parseInt(process.env.ADMIN_RATE_MAX_REQUESTS || '120', 10),

  loginRateWindowMs: Number.parseInt(process.env.LOGIN_RATE_WINDOW_MS || '60000', 10),
  loginRateMaxAttempts: Number.parseInt(process.env.LOGIN_RATE_MAX_ATTEMPTS || '10', 10),

  corsOptions: {
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
      : false,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  },

  cookieSecure: process.env.COOKIE_SECURE === 'true',
});

module.exports = { config };
