const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  hashAdminPassword,
  verifyAdminPassword,
  validateAdminPasswordStrength,
  DEFAULT_ADMIN_PASSWORD,
} = require('../lib/admin-password');

test('hashAdminPassword retorna formato scrypt$salt$hash', () => {
  const hash = hashAdminPassword('abc123!');
  const parts = hash.split('$');
  assert.equal(parts.length, 3);
  assert.equal(parts[0], 'scrypt');
  assert.ok(parts[1].length > 0);
  assert.ok(parts[2].length > 0);
});

test('hashAdminPassword produz hashes distintos (salt aleatório)', () => {
  const h1 = hashAdminPassword('abc123!');
  const h2 = hashAdminPassword('abc123!');
  assert.notEqual(h1, h2);
});

test('verifyAdminPassword retorna true para senha correta', () => {
  const hash = hashAdminPassword('SenhaCorreta!1');
  assert.equal(verifyAdminPassword('SenhaCorreta!1', hash), true);
});

test('verifyAdminPassword retorna false para senha errada', () => {
  const hash = hashAdminPassword('SenhaCorreta!1');
  assert.equal(verifyAdminPassword('SenhaErrada', hash), false);
});

test('verifyAdminPassword retorna false para stored null', () => {
  assert.equal(verifyAdminPassword('qualquer', null), false);
});

test('verifyAdminPassword retorna false para stored malformado', () => {
  assert.equal(verifyAdminPassword('qualquer', 'malformado'), false);
  assert.equal(verifyAdminPassword('qualquer', 'a$b'), false);
  assert.equal(verifyAdminPassword('qualquer', 'outro$salt$hash'), false);
});

test('validateAdminPasswordStrength aceita senhas válidas', () => {
  assert.equal(validateAdminPasswordStrength('abc123'), true);
  assert.equal(validateAdminPasswordStrength('SenhaValida!9'), true);
  assert.equal(validateAdminPasswordStrength('a'.repeat(100)), true);
});

test('validateAdminPasswordStrength rejeita vazio e curto demais', () => {
  assert.equal(validateAdminPasswordStrength(''), false);
  assert.equal(validateAdminPasswordStrength('abc12'), false);
  assert.equal(validateAdminPasswordStrength(null), false);
});

test('validateAdminPasswordStrength rejeita longo demais', () => {
  assert.equal(validateAdminPasswordStrength('a'.repeat(101)), false);
});

test('DEFAULT_ADMIN_PASSWORD passa validação de força', () => {
  assert.equal(validateAdminPasswordStrength(DEFAULT_ADMIN_PASSWORD), true);
});

test('DEFAULT_ADMIN_PASSWORD é verificável após hash', () => {
  const hash = hashAdminPassword(DEFAULT_ADMIN_PASSWORD);
  assert.equal(verifyAdminPassword(DEFAULT_ADMIN_PASSWORD, hash), true);
});
