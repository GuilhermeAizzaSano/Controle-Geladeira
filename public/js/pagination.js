// ── PAGINAÇÃO ────────────────────────────────────────────────

import { icon } from './utils.js';
import { html, raw } from './lib/html.js';

// Registro explícito de callbacks permitidos na paginação.
// Impede que data-callback manipulado invoque funções arbitrárias:
// só os callbacks explicitamente registrados pelos donos podem ser invocados.
const paginationCallbacks = new Map();

/**
 * Registra um callback de paginação para ser invocável via data-callback.
 * Deve ser chamado pelo módulo dono da função assim que ela é definida.
 *
 * @param {string} name
 * @param {Function} fn
 */
export function registerPaginationCallback(name, fn) {
  paginationCallbacks.set(name, fn);
}

/**
 * Renderiza o componente de paginação dentro de um container.
 *
 * @param {string} containerId - ID do elemento HTML do container
 * @param {{ page: number, limit: number, total: number, totalPages: number }} pag
 * @param {string} callbackName - Nome da função global a chamar ao trocar de página
 */
export function renderPagination(containerId, pag, callbackName) {
  const el = document.getElementById(containerId);
  if (!el) return;

  if (pag.totalPages <= 1) {
    el.classList.add('d-none');
    return;
  }

  el.classList.remove('d-none');
  el.dataset.callback = callbackName;

  const from = (pag.page - 1) * pag.limit + 1;
  const to = Math.min(pag.page * pag.limit, pag.total);
  const pageButtons = buildPageButtons(pag.page, pag.totalPages);

  el.innerHTML = html`
    <span class="pag-info">
      Exibindo <strong>${from}–${to}</strong> de <strong>${pag.total}</strong>
    </span>
    <div class="pag-controls">
      <button class="btn-pag" data-page="1"
        ${raw(pag.page === 1 ? 'disabled' : '')} aria-label="Primeira página" title="Primeira página">«</button>
      <button class="btn-pag" data-page="${pag.page - 1}"
        ${raw(pag.page === 1 ? 'disabled' : '')} aria-label="Página anterior" title="Página anterior">${raw(icon('chevron-left', 13))}</button>

      ${pageButtons.map(p =>
        p === '…'
          ? html`<span class="pag-ellipsis" aria-hidden="true">…</span>`
          : html`<button class="btn-pag ${p === pag.page ? 'active' : ''}"
                data-page="${p}">${p}</button>`
      )}

      <button class="btn-pag" data-page="${pag.page + 1}"
        ${raw(pag.page === pag.totalPages ? 'disabled' : '')} aria-label="Próxima página" title="Próxima página">${raw(icon('chevron-right', 13))}</button>
      <button class="btn-pag" data-page="${pag.totalPages}"
        ${raw(pag.page === pag.totalPages ? 'disabled' : '')} aria-label="Última página" title="Última página">»</button>
    </div>
  `.__raw;
}

/**
 * Gera a lista de números de página com reticências onde necessário.
 *
 * @param {number} current
 * @param {number} total
 * @returns {(number|'…')[]}
 */
function buildPageButtons(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages = new Set([1, total, current]);
  for (let d = -2; d <= 2; d++) {
    const p = current + d;
    if (p >= 1 && p <= total) pages.add(p);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const result = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push('…');
    result.push(sorted[i]);
  }
  return result;
}

// Delegation global da paginação.
// Usa o registro explícito para garantir que apenas callbacks conhecidos sejam invocados.
document.addEventListener('click', e => {
  const btn = e.target.closest('.bc-pagination .btn-pag[data-page]');
  if (!btn) return;

  const container = btn.closest('.bc-pagination');
  const callback = container?.dataset?.callback;
  const page = parseInt(btn.dataset.page, 10);

  if (!callback || !Number.isFinite(page)) return;

  const fn = paginationCallbacks.get(callback);
  if (typeof fn !== 'function') {
    console.warn(`[paginação] Callback não permitido: "${callback}"`);
    return;
  }
  fn(page);
});