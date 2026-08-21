const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseBoolean,
  parseCodigoAcesso,
  parsePositiveInt,
  parseNonNegativeNumber,
  parsePagination,
  parseQuantidade,
  MAX_QUANTIDADE,
} = require('../lib/parsers');

test('parseBoolean handles booleans, strings and fallback', () => {
  assert.equal(parseBoolean(true), true);
  assert.equal(parseBoolean(false), false);
  assert.equal(parseBoolean('true'), true);
  assert.equal(parseBoolean('false'), false);
  assert.equal(parseBoolean(undefined, true), true);
  assert.equal(parseBoolean('anything'), true);
});

test('parseCodigoAcesso accepts exactly 6 digits', () => {
  assert.equal(parseCodigoAcesso('123456'), 123456);
  assert.equal(parseCodigoAcesso('001234'), 1234);
  assert.equal(parseCodigoAcesso('12345'), null);
  assert.equal(parseCodigoAcesso('1234567'), null);
  assert.equal(parseCodigoAcesso('12a456'), null);
});

test('parsePositiveInt and parseNonNegativeNumber validate numeric values', () => {
  assert.equal(parsePositiveInt('9'), 9);
  assert.equal(parsePositiveInt('0'), null);
  assert.equal(parsePositiveInt('-1'), null);
  assert.equal(parseNonNegativeNumber('7.5'), 7.5);
  assert.equal(parseNonNegativeNumber('-2'), null);
  assert.equal(parseNonNegativeNumber('abc'), null);
});

test('parseQuantidade assume 1 quando o campo está ausente', () => {
  assert.equal(parseQuantidade(undefined), 1);
  assert.equal(parseQuantidade(null), 1);
  assert.equal(parseQuantidade(''), 1);
});

test('parseQuantidade aceita inteiros de 1 até o limite', () => {
  assert.equal(parseQuantidade('1'), 1);
  assert.equal(parseQuantidade('3'), 3);
  assert.equal(parseQuantidade(3), 3);
  assert.equal(parseQuantidade(MAX_QUANTIDADE), MAX_QUANTIDADE);
});

test('parseQuantidade rejeita valores inválidos e acima do limite', () => {
  assert.equal(parseQuantidade('0'), null);
  assert.equal(parseQuantidade('-1'), null);
  assert.equal(parseQuantidade('abc'), null);
  assert.equal(parseQuantidade('2.5'), null);
  assert.equal(parseQuantidade(MAX_QUANTIDADE + 1), null);
  assert.equal(parseQuantidade('9999'), null);
});

test('parsePagination clamps page and limit', () => {
  assert.deepEqual(
    parsePagination({ page: '0', limit: '999' }, 10, 100),
    { page: 1, limit: 100, offset: 0 }
  );

  assert.deepEqual(
    parsePagination({ page: '3', limit: '20' }, 10, 100),
    { page: 3, limit: 20, offset: 40 }
  );
});
