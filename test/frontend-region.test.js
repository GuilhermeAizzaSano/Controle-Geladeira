const test = require('node:test');
const assert = require('node:assert/strict');

test('registerRegion recusa um target que hospeda input de busca', async () => {
  const { registerRegion } = await import('../public/js/lib/region.js');

  assert.throws(
    () => registerRegion('screen-shop-inteiro', {
      target: '#screen-shop',
      loading: () => '',
      error:   () => '',
      empty:   () => '',
      data:    () => '',
    }),
    /alvo não permitido/
  );
});

test('registerRegion aceita um target da lista permitida', async () => {
  const { registerRegion } = await import('../public/js/lib/region.js');

  assert.doesNotThrow(() =>
    registerRegion('teste-produtos-body', {
      target: '#produtos-body',
      loading: () => ({ __raw: 'loading' }),
      error:   () => ({ __raw: 'error' }),
      empty:   () => ({ __raw: 'empty' }),
      data:    () => ({ __raw: 'data' }),
    })
  );
});

test('renderRegionHtml despacha para o handler do status correto', async () => {
  const { registerRegion, renderRegionHtml } = await import('../public/js/lib/region.js');

  registerRegion('teste-usuarios-body', {
    target: '#usuarios-body',
    loading: () => ({ __raw: '<tr>loading</tr>' }),
    error:   (err) => ({ __raw: `<tr>erro: ${err.message}</tr>` }),
    empty:   (ctx) => ({ __raw: `<tr>vazio filtrando=${ctx.isFiltering}</tr>` }),
    data:    (rows) => ({ __raw: `<tr>${rows.length} linhas</tr>` }),
  });

  assert.equal(
    renderRegionHtml('teste-usuarios-body', { status: 'loading' }),
    '<tr>loading</tr>'
  );
  assert.equal(
    renderRegionHtml('teste-usuarios-body', { status: 'error', error: new Error('falhou') }),
    '<tr>erro: falhou</tr>'
  );
  assert.equal(
    renderRegionHtml('teste-usuarios-body', { status: 'empty', ctx: { isFiltering: true } }),
    '<tr>vazio filtrando=true</tr>'
  );
  assert.equal(
    renderRegionHtml('teste-usuarios-body', { status: 'data', data: [1, 2, 3] }),
    '<tr>3 linhas</tr>'
  );
});

test('renderRegionHtml lança erro para região não registrada', async () => {
  const { renderRegionHtml } = await import('../public/js/lib/region.js');

  assert.throws(
    () => renderRegionHtml('regiao-inexistente', { status: 'loading' }),
    /não registrada/
  );
});

test('renderRegionHtml lança erro para status sem handler', async () => {
  const { registerRegion, renderRegionHtml } = await import('../public/js/lib/region.js');

  registerRegion('teste-produtos-body-2', {
    target: '#produtos-body',
    loading: () => ({ __raw: '' }),
    error:   () => ({ __raw: '' }),
    empty:   () => ({ __raw: '' }),
    data:    () => ({ __raw: '' }),
  });

  assert.throws(
    () => renderRegionHtml('teste-produtos-body-2', { status: 'inexistente' }),
    /não implementa/
  );
});
