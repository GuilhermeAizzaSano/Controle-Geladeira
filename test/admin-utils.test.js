const test = require('node:test');
const assert = require('node:assert/strict');

const { getUsersEligibleForBulkReset } = require('../lib/admin-utils');

test('getUsersEligibleForBulkReset returns only users with positive visible balance', () => {
  const rows = [
    { id: 1, total_gasto: 12.5 },
    { id: 2, total_gasto: 0 },
    { id: 3, total_gasto: '7.90' },
    { id: 4, total_gasto: -1 },
    { id: 5, total_gasto: null },
  ];

  assert.deepEqual(getUsersEligibleForBulkReset(rows), [1, 3]);
});

test('getUsersEligibleForBulkReset ignores invalid ids and duplicates', () => {
  const rows = [
    { id: 10, total_gasto: 2 },
    { id: 10, total_gasto: 8 },
    { id: 0, total_gasto: 3 },
    { id: null, total_gasto: 4 },
    { id: 11, total_gasto: 0.01 },
  ];

  assert.deepEqual(getUsersEligibleForBulkReset(rows), [10, 11]);
});
