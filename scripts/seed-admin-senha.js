require('dotenv').config();
const { Pool } = require('pg');
const { hashAdminPassword, DEFAULT_ADMIN_PASSWORD } = require('../lib/admin-password');
const { createSchema } = require('../lib/schema');
const { logError } = require('../lib/log');

async function main() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'bebidas_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'sua_senha_aqui',
  });

  try {
    await createSchema({ pool, logError }).ensureUsuariosAdminSenhaColumn();

    const hash = hashAdminPassword(DEFAULT_ADMIN_PASSWORD);
    const result = await pool.query(
      'UPDATE usuarios SET admin_senha_hash = $1 WHERE is_admin = TRUE AND admin_senha_hash IS NULL',
      [hash]
    );

    console.log(`${result.rowCount} admin(s) atualizados com a senha padrão (${DEFAULT_ADMIN_PASSWORD}).`);
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('Erro:', err.message);
  process.exit(1);
});
