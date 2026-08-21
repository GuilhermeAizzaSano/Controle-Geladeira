const { Pool } = require('pg');

// ─── Conexão PostgreSQL ───────────────────────────────────
function createPool() {
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
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
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
