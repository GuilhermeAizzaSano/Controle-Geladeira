const test = require('node:test');
const assert = require('node:assert/strict');

test('html`` escapa interpolações de string por padrão', async () => {
  const { html } = await import('../public/js/lib/html.js');

  const nome = '<script>alert(1)</script>';
  const out = html`<div>${nome}</div>`;

  assert.equal(out.__raw, '<div>&lt;script&gt;alert(1)&lt;/script&gt;</div>');
});

test('html`` escapa aspas para uso seguro em atributos', async () => {
  const { html } = await import('../public/js/lib/html.js');

  const nome = 'a" onclick="alert(1)';
  const out = html`<div data-nome="${nome}"></div>`;

  assert.equal(out.__raw, '<div data-nome="a&quot; onclick=&quot;alert(1)"></div>');
});

test('html`` não escapa duas vezes valores marcados com raw()', async () => {
  const { html, raw } = await import('../public/js/lib/html.js');

  const icone = raw('<svg><use href="#i-star"></use></svg>');
  const out = html`<button>${icone}</button>`;

  assert.equal(out.__raw, '<button><svg><use href="#i-star"></use></svg></button>');
});

test('html`` compõe com outro html`` aninhado sem duplo-escape', async () => {
  const { html } = await import('../public/js/lib/html.js');

  const linha = html`<td>${'<b>x</b>'}</td>`;
  const out = html`<table>${linha}</table>`;

  assert.equal(out.__raw, '<table><td>&lt;b&gt;x&lt;/b&gt;</td></table>');
});

test('html`` junta arrays de valores (listas de linhas) sem separador', async () => {
  const { html } = await import('../public/js/lib/html.js');

  const linhas = [html`<li>a</li>`, html`<li>b</li>`];
  const out = html`<ul>${linhas}</ul>`;

  assert.equal(out.__raw, '<ul><li>a</li><li>b</li></ul>');
});

test('html`` trata null e undefined como string vazia', async () => {
  const { html } = await import('../public/js/lib/html.js');

  const out = html`<span>${null}${undefined}</span>`;

  assert.equal(out.__raw, '<span></span>');
});

test('html`` converte números normalmente sem escapar', async () => {
  const { html } = await import('../public/js/lib/html.js');

  const out = html`<span>${42}</span>`;

  assert.equal(out.__raw, '<span>42</span>');
});
