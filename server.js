const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const os = require('os');
const {
  parseBoolean,
  parseCodigoAcesso,
  parsePositiveInt,
  parseNonNegativeNumber,
  parsePagination,
  parseQuantidade,
  MAX_QUANTIDADE,
} = require('./lib/parsers');
const { createPublicRouter } = require('./routes/public-routes');
const { createAdminRouter } = require('./routes/admin-routes');
const { createSessionStore } = require('./lib/session-store');
const cookieHelpers = require('./lib/cookie-helpers');
const {
  hashAdminPassword,
  verifyAdminPassword,
  validateAdminPasswordStrength,
  DEFAULT_ADMIN_PASSWORD,
} = require('./lib/admin-password');

const { logError } = require('./lib/log');
const { Q } = require('./lib/queries');
const { config } = require('./lib/config');
const { createPool, withTransaction } = require('./lib/db');
const { createSchema } = require('./lib/schema');
const { createRateLimit } = require('./lib/rate-limit');
const { createRelatorio } = require('./lib/relatorio-cache');
const { createAuth } = require('./lib/auth');
const { securityHeaders, requestTimeout } = require('./lib/security-headers');

const app = express();
const PORT = process.env.PORT || 3000;

if (config.trustProxy) {
  app.set('trust proxy', 1);
}

app.disable('x-powered-by');

app.use(securityHeaders(config));
app.use(requestTimeout(config));

app.use(cors(config.corsOptions));
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h', etag: true }));

const pool = createPool();
const sessionStore = createSessionStore(pool);
const COOKIE_SECURE = config.cookieSecure;

const schema = createSchema({ pool, logError });
const rateLimit = createRateLimit(config);
const relatorio = createRelatorio({ pool, Q });
const auth = createAuth({ pool, sessionStore, cookieHelpers, logError });
const { requireAuth, requireAdmin, requireCsrf, generateToken, adminChallenges } = auth;

app.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, nome FROM usuarios WHERE id = $1',
      [req.session.userId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Usuário não encontrado.' });
    const { id, nome } = result.rows[0];
    res.json({ usuario: { id, nome, is_admin: req.session.isAdmin } });
  } catch (err) {
    logError('GET /me', err, req);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

app.use(createPublicRouter({
  pool,
  Q,
  requireAuth,
  logError,
  ensureUsuariosIsAdminColumn: schema.ensureUsuariosIsAdminColumn,
  ensureUsuariosAdminSenhaColumn: schema.ensureUsuariosAdminSenhaColumn,
  tableHasColumn: schema.tableHasColumn,
  ensureConsumoPrecoColumn: schema.ensureConsumoPrecoColumn,
  ensureConsumosOcultosTable: schema.ensureConsumosOcultosTable,
  ensureFavoritosTable: schema.ensureFavoritosTable,
  invalidateAndRefreshRelatorio: relatorio.invalidateAndRefreshRelatorio,
  parseCodigoAcesso,
  parsePositiveInt,
  parsePagination,
  parseQuantidade,
  MAX_QUANTIDADE,
  getClientIp: rateLimit.getClientIp,
  isLoginRateLimited: rateLimit.isLoginRateLimited,
  registerLoginAttempt: rateLimit.registerLoginAttempt,
  generateToken,
  sessionStore,
  cookieHelpers,
  cookieSecure: COOKIE_SECURE,
  requireCsrf,
  adminChallenges,
  adminChallengeTtlMs: auth.ADMIN_CHALLENGE_TTL_MS,
  adminChallengeMaxAttempts: auth.ADMIN_CHALLENGE_MAX_ATTEMPTS,
  verifyAdminPassword,
}));

app.use('/admin', createAdminRouter({
  pool,
  Q,
  requireAdmin,
  adminRateLimitMiddleware: rateLimit.adminRateLimitMiddleware,
  logError,
  tableHasColumn: schema.tableHasColumn,
  ensureUsuariosAtivoColumn: schema.ensureUsuariosAtivoColumn,
  ensureUsuariosAdminSenhaColumn: schema.ensureUsuariosAdminSenhaColumn,
  ensureConsumosOcultosTable: schema.ensureConsumosOcultosTable,
  invalidateAndRefreshRelatorio: relatorio.invalidateAndRefreshRelatorio,
  getAdminRelatorioRows: relatorio.getAdminRelatorioRows,
  zerarTodosElegiveis: relatorio.zerarTodosElegiveis,
  withTransaction,
  parseBoolean,
  parseCodigoAcesso,
  parsePositiveInt,
  parseNonNegativeNumber,
  parsePagination,
  relatorioCacheRef: relatorio.relatorioCacheRef,
  verifyAdminPassword,
  hashAdminPassword,
  validateAdminPasswordStrength,
  DEFAULT_ADMIN_PASSWORD,
  requireCsrf,
  sessionStore,
  cookieHelpers,
  cookieSecure: COOKIE_SECURE,
}));

// ─── 404 e erro genérico ───────────────────────────────────
// Precisam vir depois de montar todos os routers para funcionar.
app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada.' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  logError('Erro não tratado', err, req);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: 'Erro interno.' });
});

pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Erro ao conectar:', err.message);
    return;
  }
  release();
  console.log('✅ Conectado ao PostgreSQL!');
  sessionStore.ensureSessionsTable()
    .then(() => console.log('Tabela sessions verificada/criada.'))
    .catch(err => console.error('Erro ao criar tabela sessions:', err.message));
  schema.ensureBaseSchema()
    .then(() => console.log('Schema do banco verificado/criado.'))
    .catch(err => console.error('❌ Erro ao garantir o schema do banco:', err.message))
    .finally(() => {
      schema.checkRequiredIndexes();
      relatorio.checkMvRelatorioExists().then(exists => {
        if (exists) {
          console.log('✅ Materialized view mv_relatorio encontrada.');
        } else {
          console.log('ℹ️ Materialized view mv_relatorio não encontrada. Usando query padrão.');
        }
      });
    });
});

// ─── Start ────────────────────────────────────────────────
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
}

const httpServer = app.listen(PORT, () => {
  const localIP = getLocalIP();
  console.log('Servidor rodando!');
  console.log(`Local:   http://localhost:${PORT}`);
  console.log(`Rede:    http://${localIP}:${PORT}`);
});

// ─── Robustez do processo ─────────────────────────────────
process.on('unhandledRejection', err => {
  console.error('❌ unhandledRejection:', err && err.stack ? err.stack : err);
});

process.on('uncaughtException', err => {
  console.error('❌ uncaughtException:', err && err.stack ? err.stack : err);
});

const SHUTDOWN_TIMEOUT_MS = 10000;

function shutdown(signal) {
  console.log(`\n${signal} recebido. Encerrando com segurança...`);

  const forceExitTimer = setTimeout(() => {
    console.error('⚠️  Timeout no encerramento gracioso. Forçando saída.');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExitTimer.unref();

  httpServer.close(() => {
    pool.end()
      .then(() => {
        console.log('✅ Conexões encerradas. Até logo!');
        clearTimeout(forceExitTimer);
        process.exit(0);
      })
      .catch(err => {
        console.error('❌ Erro ao encerrar o pool do Postgres:', err.message);
        clearTimeout(forceExitTimer);
        process.exit(1);
      });
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
