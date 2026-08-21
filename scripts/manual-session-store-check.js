// scripts/manual-session-store-check.js
//
// Script manual (NÃO é parte da suíte `npm test`, propositalmente fora do
// glob de `test/`) — exige um Postgres vivo configurado via .env e GRAVA
// linhas reais na tabela `sessions`. Rodar manualmente com `node
// scripts/manual-session-store-check.js` quando quiser validar o
// session-store contra um banco de verdade.
const assert = require('node:assert/strict');
const { Pool } = require('pg');
require('dotenv').config();
const { createSessionStore } = require('../lib/session-store');

async function main() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'bebidas_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
  });

  const store = createSessionStore(pool);

  // 1. Table creation is idempotent
  await store.ensureSessionsTable();
  await store.ensureSessionsTable();

  // 2. create -> get round-trip
  const token = await store.createSession({ userId: 999, isAdmin: false });
  assert.equal(typeof token, 'string');
  assert.equal(token.length, 64);

  const sess = await store.getSession(token);
  assert.ok(sess, 'session must exist');
  assert.equal(sess.userId, 999);
  assert.equal(sess.isAdmin, false);

  // 3. Read cache: second getSession returns same object
  const sess2 = await store.getSession(token);
  assert.deepEqual(sess2, sess);

  // 4. destroy invalidates cache
  await store.destroySession(token);
  const afterDestroy = await store.getSession(token);
  assert.equal(afterDestroy, null);

  // 5. destroyUserSessions removes all sessions for a user
  const t1 = await store.createSession({ userId: 888, isAdmin: false });
  const t2 = await store.createSession({ userId: 888, isAdmin: true });
  await store.destroyUserSessions(888);
  assert.equal(await store.getSession(t1), null);
  assert.equal(await store.getSession(t2), null);

  // 6. sweepExpiredSessions runs without error
  await store.sweepExpiredSessions();

  console.log('ALL TESTS PASSED');
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
