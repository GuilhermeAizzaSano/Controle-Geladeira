const test = require('node:test');
const assert = require('node:assert/strict');

test('resetState limpa os campos básicos do estado compartilhado', async () => {
  const { state, resetState } = await import('../public/js/state.js');

  state.currentUser = { id: 1, nome: 'Teste' };
  state.detailUserId = 5;

  resetState();

  assert.equal(state.currentUser, null);
  assert.equal(state.detailUserId, null);
});

test('registerResetHook faz resetState chamar o callback registrado', async () => {
  const { resetState, registerResetHook } = await import('../public/js/state.js');

  let called = false;
  registerResetHook(() => { called = true; });

  resetState();

  assert.equal(called, true);
});

test('registerResetHook suporta múltiplos módulos independentes', async () => {
  const { resetState, registerResetHook } = await import('../public/js/state.js');

  let a = 0;
  let b = 0;
  registerResetHook(() => { a += 1; });
  registerResetHook(() => { b += 1; });

  resetState();

  assert.equal(a, 1);
  assert.equal(b, 1);
});

test('um hook que lança erro não impede os demais hooks de rodar', async () => {
  const { resetState, registerResetHook } = await import('../public/js/state.js');

  let ranAfter = false;
  registerResetHook(() => { throw new Error('hook quebrado'); });
  registerResetHook(() => { ranAfter = true; });

  assert.doesNotThrow(() => resetState());
  assert.equal(ranAfter, true);
});
