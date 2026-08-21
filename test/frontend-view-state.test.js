const test = require('node:test');
const assert = require('node:assert/strict');

test('computeNavVisibility: sem usuário, tudo escondido', async () => {
  const { computeNavVisibility } = await import('../public/js/lib/view-state.js');

  const { visible, hidden } = computeNavVisibility(null);

  assert.deepEqual(visible, []);
  assert.ok(hidden.includes('nav-item-shop'));
  assert.ok(hidden.includes('nav-item-admin'));
});

test('computeNavVisibility: usuário comum vê loja e alterar-código', async () => {
  const { computeNavVisibility } = await import('../public/js/lib/view-state.js');

  const { visible, hidden } = computeNavVisibility({ is_admin: false });

  assert.deepEqual(visible, ['nav-item-shop', 'nav-item-alterar-codigo']);
  assert.ok(hidden.includes('nav-item-admin'));
  assert.ok(!hidden.includes('nav-item-shop'));
});

test('computeNavVisibility: admin vê controle/produtos/usuários/senha-admin', async () => {
  const { computeNavVisibility } = await import('../public/js/lib/view-state.js');

  const { visible, hidden } = computeNavVisibility({ is_admin: true });

  assert.deepEqual(visible, ['nav-item-admin', 'nav-item-produtos', 'nav-item-usuarios', 'nav-item-alterar-senha-admin']);
  assert.ok(hidden.includes('nav-item-shop'));
  assert.ok(!hidden.includes('nav-item-admin'));
});

test('computeTabClassName: abas administrativas ganham admin-mode', async () => {
  const { computeTabClassName } = await import('../public/js/lib/view-state.js');

  assert.equal(computeTabClassName('admin'), 'nav bc-tabs admin-mode');
  assert.equal(computeTabClassName('produtos'), 'nav bc-tabs admin-mode');
  assert.equal(computeTabClassName('usuarios'), 'nav bc-tabs admin-mode');
  assert.equal(computeTabClassName('shop'), 'nav bc-tabs');
});

test('computeDetailHeaderView: sem itens desabilita zerar e some com favorito/ocultos', async () => {
  const { computeDetailHeaderView } = await import('../public/js/lib/view-state.js');

  const v = computeDetailHeaderView({ total_itens: 0, favorito: null, total_ocultos: 0 });

  assert.equal(v.zerarDisabled, true);
  assert.equal(v.favVisible, false);
  assert.equal(v.ocultosDisabled, true);
  assert.equal(v.ocultosCount, 0);
});

test('computeDetailHeaderView: com itens e favorito, mostra tudo', async () => {
  const { computeDetailHeaderView } = await import('../public/js/lib/view-state.js');

  const v = computeDetailHeaderView({
    total_itens: 5,
    favorito: { produto: 'Água', freq: 3 },
    total_ocultos: 2,
  });

  assert.equal(v.zerarDisabled, false);
  assert.equal(v.favVisible, true);
  assert.equal(v.favoritoText, 'Água (3x)');
  assert.equal(v.ocultosDisabled, false);
  assert.equal(v.ocultosCount, 2);
});

test('computeDetailHeaderView: total_ocultos ausente/NaN vira 0', async () => {
  const { computeDetailHeaderView } = await import('../public/js/lib/view-state.js');

  const v = computeDetailHeaderView({ total_itens: 1, favorito: null, total_ocultos: undefined });

  assert.equal(v.ocultosCount, 0);
  assert.equal(v.ocultosDisabled, true);
});

test('isFavSectionVisible: verdadeiro só quando há favoritos', async () => {
  const { isFavSectionVisible } = await import('../public/js/lib/view-state.js');

  assert.equal(isFavSectionVisible(0), false);
  assert.equal(isFavSectionVisible(3), true);
});
