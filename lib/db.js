const { Pool } = require('pg');

// ─── Conexão PostgreSQL ───────────────────────────────────
function createPool() {
  const max = Number.parseInt(process.env.DB_POOL_MAX, 10) || 20;
  const idleTimeoutMillis = Number.parseInt(process.env.DB_IDLE_TIMEOUT_MS, 10) || 30000;
  const connectionTimeoutMillis = Number.parseInt(process.env.DB_CONN_TIMEOUT_MS, 10) || 2000;
  const statementTimeoutMillis = Number.parseInt(process.env.DB_STATEMENT_TIMEOUT_MS, 10) || 10000;

  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'bebidas_db',
    user: process.env.DB_USER || 'postgres',
    password: (() => {
      const pw = process.env.DB_PASSWORD;
      if (!pw) throw new Error('DB_PASSWORD env var is required but not set');
      return pw;
    })(),
    max,
    idleTimeoutMillis,
    connectionTimeoutMillis,
    statement_timeout: statementTimeoutMillis,
  });

  // O `pg` emite 'error' em clientes ociosos quando o Postgres cai/reinicia.
  // Sem este handler, o EventEmitter derruba o processo Node inteiro.
  pool.on('error', err => {
    console.error('❌ Erro inesperado no pool do Postgres (cliente ocioso):', err.message);
  });

  return pool;
}

/**
 * Executa `fn` dentro de uma transação (BEGIN/COMMIT), fazendo ROLLBACK
 * automático se `fn` lançar. `fn` recebe o client dedicado da transação —
 * use `client.query(...)` dentro dela, não `pool.query(...)`.
 *
 * @param {import('pg').Pool} pool
 * @param {(client: import('pg').PoolClient) => Promise<T>} fn
 * @returns {Promise<T>}
 * @template T
 */
async function withTransaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { createPool, withTransaction };
