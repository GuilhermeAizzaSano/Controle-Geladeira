// Registro de "regiões" — containers cujo innerHTML inteiro é escrito a partir
// do estado, com os 4 casos (loading/error/empty/data) declarados num só lugar.
//
// REGRA DE SEGURANÇA: o target de uma região nunca pode ser um container que
// hospeda um <input> de busca (#screen-shop, #screen-admin, #screen-produtos,
// #screen-usuarios) — substituir o innerHTML deles a cada busca destrói o
// input e o usuário perde o foco/cursor no meio da digitação. Os alvos abaixo
// são os containers "folha" que nunca contêm um campo de texto.
const ALLOWED_TARGETS = new Set([
  '#admin-body',
  '#admin-summary-bar',
  '#detail-body',
  '#ocultos-body',
  '#history-body',
  '#product-grid',
  '#product-grid-fav',
  '#produtos-body',
  '#usuarios-body',
  '#history-pagination',
  '#detail-pagination',
  '#ocultos-pagination',
]);

const registry = new Map();

/**
 * @param {string} name
 * @param {{
 *   target: string,
 *   loading: () => {__raw: string},
 *   error: (err: Error) => {__raw: string},
 *   empty: (ctx: object) => {__raw: string},
 *   data: (data: any, ctx: object) => {__raw: string},
 * }} config
 */
export function registerRegion(name, config) {
  if (!ALLOWED_TARGETS.has(config.target)) {
    throw new Error(
      `[region] alvo não permitido: "${config.target}". Containers que hospedam ` +
      `um input de busca não podem virar região (perderiam foco a cada re-render).`
    );
  }
  registry.set(name, config);
}

/** Computa o HTML de uma região para um dado estado — pura, sem tocar o DOM. */
export function renderRegionHtml(name, view) {
  const config = registry.get(name);
  if (!config) throw new Error(`[region] região não registrada: "${name}"`);

  const handler = config[view.status];
  if (typeof handler !== 'function') {
    throw new Error(`[region] "${name}" não implementa o estado "${view.status}"`);
  }

  const result =
    view.status === 'data'  ? handler(view.data, view.ctx) :
    view.status === 'error' ? handler(view.error) :
    handler(view.ctx);

  return result.__raw ?? String(result);
}

/** Aplica o estado ao DOM: computa o HTML da região e escreve no target. */
export function setRegion(name, view) {
  const config = registry.get(name);
  if (!config) throw new Error(`[region] região não registrada: "${name}"`);

  const el = document.querySelector(config.target);
  if (!el) return;

  el.innerHTML = renderRegionHtml(name, view);
}
