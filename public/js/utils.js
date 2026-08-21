// ── UTILS ────────────────────────────────────────────────────
// Fonte única dos utilitários compartilhados entre os módulos do frontend.
// Carregado antes dos demais scripts no index.html.

// Re-exportado de lib/html.js para manter uma única implementação —
// escapeHtml continua importável de './utils.js' como antes (sem quebrar
// os módulos existentes), mas quem escreve markup novo deve preferir a
// tagged template `html` de './lib/html.js', que escapa automaticamente.
export { escapeHtml } from './lib/html.js';

/** Formata um número como moeda BRL. */
export const fmtBRL = v => 'R$ ' + Number(v).toFixed(2).replace('.', ',');

/** Formata uma string ISO como data/hora local (pt-BR). */
export const fmtDate = iso => {
  const d = new Date(iso);
  return (
    d.toLocaleDateString('pt-BR') +
    ' ' +
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  );
};

/**
 * Monta o markup de um ícone do sprite inline (public/index.html).
 *
 * @param {string} name  nome do símbolo, sem o prefixo "i-"
 * @param {number} [size=16]
 * @returns {string}
 */
export function icon(name, size = 16) {
  return `<svg class="ic" width="${size}" height="${size}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

/**
 * Exibe um toast de notificação.
 * Prepends "✓ " for success and "✗ " for error automatically.
 *
 * @param {string} msg
 * @param {'success'|'error'} type
 */
export function showToast(msg, type = 'success') {
  const prefix = type === 'success' ? '✓ ' : type === 'error' ? '✗ ' : '';
  const el = document.getElementById('bc-toast');
  el.className = `toast bc-toast align-items-center border-0 ${type}`;
  document.getElementById('toast-body').textContent = prefix + msg;
  bootstrap.Toast.getOrCreateInstance(el, { delay: 3000 }).show();
}

/**
 * Alterna o estado de loading do botão salvar de um modal.
 *
 * @param {'produto'|'usuario'} prefix
 * @param {boolean} loading
 */
export function setSaveLoading(prefix, loading) {
  document.getElementById(`save-${prefix}-text`).classList.toggle('d-none', loading);
  document.getElementById(`save-${prefix}-loader`).classList.toggle('d-none', !loading);
}

/**
 * Atrasa a execução de `fn` até `ms` milissegundos após o último chamado.
 * Reduz o número de operações disparadas durante digitação contínua.
 *
 * @param {Function} fn
 * @param {number} ms
 * @returns {Function}
 */
export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/**
 * Toggles the loading state of any button.
 * Saves original text in `data-original-text` so it can be restored.
 *
 * @param {HTMLElement} btn
 * @param {boolean} loading
 * @param {string} [loadingText='...']
 */
export function setBtnLoading(btn, loading, loadingText = '...') {
  if (loading) {
    if (!btn.dataset.originalText) btn.dataset.originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = loadingText;
  } else {
    btn.disabled = false;
    btn.textContent = btn.dataset.originalText ?? btn.textContent;
    delete btn.dataset.originalText;
  }
}
