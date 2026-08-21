const test = require('node:test');
const assert = require('node:assert/strict');

test('normalizeSearchText remove acentos, ignora caixa e apara espaços', async () => {
  const { normalizeSearchText } = await import('../public/js/lib/filter.js');

  assert.equal(normalizeSearchText('João Ávila'), 'joao avila');
  assert.equal(normalizeSearchText('  CAFÉ  '), 'cafe');
});

test('normalizeSearchText trata valores nulos/indefinidos como string vazia', async () => {
  const { normalizeSearchText } = await import('../public/js/lib/filter.js');

  assert.equal(normalizeSearchText(null), '');
  assert.equal(normalizeSearchText(undefined), '');
});
