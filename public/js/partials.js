// ── CARREGAMENTO DE PARCIAIS ────────────────────────────────────
// O index.html é um shell com um placeholder <div data-partial="..."></div>
// para cada seção. Aqui buscamos os arquivos de public/partials/ e
// substituímos cada placeholder pelo elemento real (outerHTML), preservando
// a estrutura original — sem wrapper extra no DOM final.
//
// Chamado por boot.js ANTES de importar app.js: como o fetch é assíncrono,
// se app.js ainda dependesse de DOMContentLoaded, o evento já teria disparado
// e o bind nunca rodaria. Por isso app.js exporta initApp() e é importado
// dinamicamente só depois que mountPartials() resolve.

import { html } from './lib/html.js';

const MANIFEST = [
  ['icon-sprite',              '/partials/icon-sprite.html'],
  ['navbar',                   '/partials/navbar.html'],
  ['screen-login',              '/partials/screen-login.html'],
  ['screen-shop',                '/partials/screen-shop.html'],
  ['screen-admin',                '/partials/screen-admin.html'],
  ['screen-produtos',              '/partials/screen-produtos.html'],
  ['screen-usuarios',               '/partials/screen-usuarios.html'],
  ['modal-buy',                     '/partials/modals/buy.html'],
  ['modal-zerar',                   '/partials/modals/zerar.html'],
  ['modal-detail',                  '/partials/modals/detail.html'],
  ['modal-produto',                 '/partials/modals/produto.html'],
  ['modal-usuario',                 '/partials/modals/usuario.html'],
  ['modal-remove-consumo',          '/partials/modals/remove-consumo.html'],
  ['modal-ocultos',                 '/partials/modals/ocultos.html'],
  ['modal-restore-consumo',         '/partials/modals/restore-consumo.html'],
  ['modal-alterar-codigo',          '/partials/modals/alterar-codigo.html'],
  ['modal-alterar-senha-admin',     '/partials/modals/alterar-senha-admin.html'],
  ['modal-confirm',                 '/partials/modals/confirm.html'],
  ['toast',                         '/partials/toast.html'],
];

async function fetchPartial(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

/**
 * Busca todos os parciais em paralelo e monta o DOM.
 * Lança em caso de falha — quem chama decide como exibir o erro.
 */
export async function mountPartials() {
  const markups = await Promise.all(MANIFEST.map(([, url]) => fetchPartial(url)));

  markups.forEach((markup, i) => {
    const [name] = MANIFEST[i];
    const placeholder = document.querySelector(`[data-partial="${name}"]`);
    if (!placeholder) return;
    placeholder.outerHTML = markup;
  });
}

/** Mensagem de fallback visível caso o carregamento dos parciais falhe. */
export function renderMountError(err) {
  document.body.innerHTML = html`
    <div style="padding:2rem;font-family:var(--bc-mono, monospace);color:#f66;">
      Falha ao carregar a interface. Recarregue a página.<br>
      ${err.message}
    </div>`.__raw;
}
