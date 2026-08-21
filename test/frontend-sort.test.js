const test = require('node:test');
const assert = require('node:assert/strict');

test('sortByField ordena numéricos desc', async () => {
  const { sortByField } = await import('../public/js/lib/sort.js');
  const data = [{ v: 3 }, { v: 1 }, { v: 2 }];

  const sorted = sortByField(data, 'v', 'desc');

  assert.deepEqual(sorted.map(r => r.v), [3, 2, 1]);
});

test('sortByField ordena strings asc sem diferenciar caixa', async () => {
  const { sortByField } = await import('../public/js/lib/sort.js');
  const data = [{ nome: 'bruno' }, { nome: 'Ana' }, { nome: 'carla' }];

  const sorted = sortByField(data, 'nome', 'asc');

  assert.deepEqual(sorted.map(r => r.nome), ['Ana', 'bruno', 'carla']);
});

test('sortByField não muta o array original', async () => {
  const { sortByField } = await import('../public/js/lib/sort.js');
  const data = [{ v: 3 }, { v: 1 }];

  sortByField(data, 'v', 'asc');

  assert.deepEqual(data.map(r => r.v), [3, 1]);
});
