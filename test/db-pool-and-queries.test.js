const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPool } = require('../lib/db');
const { Q } = require('../lib/queries');
const { REQUIRED_INDEXES } = require('../lib/schema');

test('lib/db: createPool configura statement_timeout e opções de pool', () => {
  process.env.DB_PASSWORD = 'dummy_password_for_test';
  process.env.DB_POOL_MAX = '15';
  process.env.DB_STATEMENT_TIMEOUT_MS = '5000';

  const pool = createPool();
  assert.equal(pool.options.max, 15);
  assert.equal(pool.options.statement_timeout, 5000);

  // Fecha o pool de teste para não vazar handles
  pool.end();
  delete process.env.DB_POOL_MAX;
  delete process.env.DB_STATEMENT_TIMEOUT_MS;
});

test('lib/queries: CONSUMOS_ATIVOS_STATS agrega consumo diretamente sem JOIN produtos', () => {
  const query = Q.CONSUMOS_ATIVOS_STATS;
  assert.equal(query.name, 'consumos-ativos-stats');
  assert.ok(query.text.includes('COALESCE(SUM(c.preco), 0)'));
  assert.ok(!query.text.includes('JOIN produtos'), 'CONSUMOS_ATIVOS_STATS não deve conter JOIN produtos');
});

test('lib/schema: REQUIRED_INDEXES inclui novos índices parciais de consumo', () => {
  const indexNames = REQUIRED_INDEXES.map(i => i.name);
  assert.ok(
    indexNames.includes('idx_consumo_usuario_data_ativos'),
    'Deve conter idx_consumo_usuario_data_ativos'
  );
  assert.ok(
    indexNames.includes('idx_consumo_usuario_data_ocultos'),
    'Deve conter idx_consumo_usuario_data_ocultos'
  );
});
