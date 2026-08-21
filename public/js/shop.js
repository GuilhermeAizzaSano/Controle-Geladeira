// ── LOJA ─────────────────────────────────────────────────────

import { apiCall } from './api.js';
import { renderPagination, registerPaginationCallback } from './pagination.js';
import { state } from './state.js';
import { icon, showToast, setBtnLoading, fmtBRL, fmtDate } from './utils.js';
import { normalizeSearchText } from './lib/filter.js';
import { html, raw } from './lib/html.js';
import { registerRegion, setRegion } from './lib/region.js';
import { isFavSectionVisible } from './lib/view-state.js';

/**
 * Pré-computa o campo de busca normalizado para cada produto.
 * Chamado uma única vez no carregamento — evita recalcular a cada keystroke.
 *
 * @param {object[]} rows
 * @returns {object[]}
 */
function preNormalizeProducts(rows) {
  return rows.map(p => ({
    ...p,
    _nomeIdx: normalizeSearchText(p.nome),
  }));
}

function _productCardHtml(p) {
  return html`
    <div class="product-card"
         data-action="buy"
         data-id="${p.id}"
         data-nome="${p.nome}"
         data-preco="${Number(p.preco)}">
      <button type="button" class="fav-btn${p.favorito ? ' is-fav' : ''}"
              data-action="toggle-fav" data-id="${p.id}"
              aria-pressed="${p.favorito ? 'true' : 'false'}"
              aria-label="${p.favorito ? 'Desfavoritar' : 'Favoritar'} ${p.nome}"
              title="${p.favorito ? 'Desfavoritar' : 'Favoritar'}">${raw(icon('star', 15))}</button>
      <div class="product-name">${p.nome}</div>
      <div class="product-price">${fmtBRL(p.preco)}</div>
    </div>`.__raw;
}

registerRegion('product-grid-fav', {
  target: '#product-grid-fav',
  empty: () => raw(''),
  data: favoritos => raw(favoritos.map(_productCardHtml).join('')),
});

registerRegion('product-grid', {
  target: '#product-grid',

  loading: () => html`
    <div class="empty-state" style="grid-column:1/-1;">
      <div class="bc-loader mx-auto"></div>
      <div class="mt-2">Carregando...</div>
    </div>`,

  error: () => html`
    <div class="empty-state" style="grid-column:1/-1;color:var(--bc-red);">
      ✗ Erro ao carregar produtos
    </div>`,

  // ctx.reason distingue duas situações vazias diferentes: nenhum produto
  // disponível (respeita isFiltering) vs. todos os produtos que restaram
  // já estão favoritados (mensagem fixa, sempre a mesma).
  empty: (ctx) => ctx.reason === 'all-favorited'
    ? html`
      <div class="empty-state" style="grid-column:1/-1;">
        <div class="empty-icon">${raw(icon('search', 28))}</div>
        <div>Nenhuma outra bebida encontrada</div>
      </div>`
    : html`
      <div class="empty-state" style="grid-column:1/-1;">
        <div class="empty-icon">${raw(icon(ctx.isFiltering ? 'search' : 'package', 28))}</div>
        <div>${ctx.isFiltering ? 'Nenhuma bebida encontrada' : 'Nenhum produto disponível'}</div>
      </div>`,

  data: produtos => raw(produtos.map(_productCardHtml).join('')),
});

/** Grades separadas: favoritos em uma seção própria, o resto em outra. */
export function renderProducts(produtos, isFiltering = false) {
  const favSection = document.getElementById('shop-fav-section');

  if (!produtos.length) {
    favSection.classList.toggle('d-none', !isFavSectionVisible(0));
    setRegion('product-grid-fav', { status: 'empty' });
    setRegion('product-grid', { status: 'empty', ctx: { isFiltering, reason: 'none' } });
    return;
  }

  const favoritos = produtos.filter(p => p.favorito);
  const outros = produtos.filter(p => !p.favorito);

  favSection.classList.toggle('d-none', !isFavSectionVisible(favoritos.length));
  setRegion('product-grid-fav', favoritos.length
    ? { status: 'data', data: favoritos }
    : { status: 'empty' });

  setRegion('product-grid', outros.length
    ? { status: 'data', data: outros }
    : { status: 'empty', ctx: { reason: 'all-favorited' } });
}

export function filterProducts() {
  const searchInput = document.getElementById('shop-search');
  if (!searchInput) return;

  // Normaliza o termo uma vez — compara com campos pré-computados
  const term = normalizeSearchText(searchInput.value);
  const filtered = state.allProducts.filter(p => p._nomeIdx.includes(term));

  renderProducts(filtered, term.length > 0);
}

function _setShopRefreshBtnState(refreshState) {
  const btn = document.getElementById('btn-refresh-shop');
  const updatedAt = document.getElementById('shop-updated-at');
  if (!btn) return;

  btn.innerHTML = html`${raw(icon('refresh'))} Atualizar`.__raw;

  if (refreshState === 'loading') {
    btn.disabled = true;
    if (updatedAt) updatedAt.textContent = 'Atualizando...';
  } else if (refreshState === 'error') {
    btn.disabled = false;
  } else {
    btn.disabled = false;
    if (updatedAt) {
      const hhmm = new Date().toLocaleTimeString('pt-BR', {
        hour: '2-digit', minute: '2-digit',
      });
      updatedAt.textContent = `Atualizado ${hhmm}`;
    }
  }
}

export async function loadProducts() {
  setRegion('product-grid', { status: 'loading' });
  _setShopRefreshBtnState('loading');

  try {
    const rows = await apiCall('GET', '/produtos');
    // Pré-normaliza ao carregar — O(n) uma vez, não a cada busca
    state.allProducts = preNormalizeProducts(rows);
    state.productsById = new Map(state.allProducts.map(p => [p.id, p]));
    filterProducts();
    _setShopRefreshBtnState('done');
  } catch (err) {
    setRegion('product-grid', { status: 'error', error: err });
    _setShopRefreshBtnState('error');
  }
}

export function onProductGridClick(e) {
  const fav = e.target.closest('[data-action="toggle-fav"]');
  if (fav) {
    toggleFavorito(parseInt(fav.dataset.id, 10), fav);
    return;
  }

  const card = e.target.closest('[data-action="buy"]');
  if (!card) return;
  openBuyModal(
    parseInt(card.dataset.id, 10),
    card.dataset.nome || '',
    Number(card.dataset.preco)
  );
}

/**
 * Pinta o estado visual do botão de favorito e mantém o objeto do produto em
 * `state.allProducts`/`state.productsById` em sincronia — é o que faz a estrela
 * sobreviver a um `filterProducts()` (busca) sem precisar reconsultar o servidor.
 */
function _applyFavState(btn, produto, favorito) {
  produto.favorito = favorito;
  btn.classList.toggle('is-fav', favorito);
  btn.setAttribute('aria-pressed', favorito ? 'true' : 'false');
  const label = `${favorito ? 'Desfavoritar' : 'Favoritar'} ${produto.nome}`;
  btn.setAttribute('aria-label', label);
  btn.title = favorito ? 'Desfavoritar' : 'Favoritar';
}

/**
 * Toggle otimista: pinta a estrela na hora e, assim que o servidor confirma,
 * recarrega a grade — o item favoritado já sobe para o topo na hora, sem
 * esperar a próxima troca de aba.
 */
async function toggleFavorito(id, btn) {
  if (btn.disabled) return;
  const produto = state.productsById.get(id);
  if (!produto) return;

  const novoEstado = !produto.favorito;
  // Aplicação otimista: `btn` é o nó vivo no momento do clique (síncrono,
  // antes de qualquer await), então tocá-lo diretamente aqui é seguro.
  _applyFavState(btn, produto, novoEstado);
  btn.disabled = true;

  try {
    await apiCall(novoEstado ? 'POST' : 'DELETE', `/favoritos/${id}`);
    await loadProducts();
  } catch (err) {
    // Reverte a partir do estado e redesenha a região — não toca em `btn`.
    // Durante o await acima, qualquer re-render concorrente (ex: o usuário
    // digitou na busca) já pode ter substituído `btn` por um nó novo;
    // mexer no nó antigo faria o rollback visual não aparecer para o usuário.
    produto.favorito = !novoEstado;
    filterProducts();
    showToast(err.message || 'Não foi possível atualizar o favorito.', 'error');
  }
}

export async function loadHistory(pageNum = null) {
  if (!state.currentUser) return;
  if (pageNum !== null) state.pagState.history.page = pageNum;

  const { page, limit } = state.pagState.history;
  const tbody = document.getElementById('history-body');

  tbody.innerHTML = html`
    <tr>
      <td colspan="4">
        <div class="empty-state">
          <div class="bc-loader mx-auto"></div>
          <div class="mt-2">Carregando...</div>
        </div>
      </td>
    </tr>`.__raw;
  document.getElementById('history-pagination').classList.add('d-none');

  try {
    const res = await apiCall('GET', `/historico?page=${page}&limit=${limit}`);
    const { data, pagination } = res;

    state.pagState.history = { ...state.pagState.history, ...pagination };
    document.getElementById('my-total').textContent = fmtBRL(pagination.total_valor);

    if (!data.length) {
      tbody.innerHTML = html`
        <tr>
          <td colspan="4">
            <div class="empty-state">
              <div class="empty-icon">${raw(icon('receipt', 28))}</div>
              <div>Nenhuma compra ainda</div>
            </div>
          </td>
        </tr>`.__raw;
      return;
    }

    const offset = (page - 1) * limit;
    tbody.innerHTML = data
      .map(
        (h, i) => html`
      <tr>
        <td data-label="#"
            style="color:var(--bc-muted);font-family:var(--bc-mono);">${String(offset + i + 1).padStart(2, '0')}</td>
        <td data-label="PRODUTO">${h.produto}</td>
        <td data-label="VALOR">
          <span class="tag-price-sm">${fmtBRL(h.preco)}</span>
        </td>
        <td data-label="DATA/HORA">
          <span class="tag-time">${fmtDate(h.data_hora)}</span>
        </td>
      </tr>`.__raw
      )
      .join('');

    renderPagination('history-pagination', state.pagState.history, 'loadHistory');
  } catch {
    tbody.innerHTML = html`
      <tr>
        <td colspan="4"
            style="text-align:center;color:var(--bc-red);
                   font-family:var(--bc-mono);font-size:.8rem;">
          ✗ Erro
        </td>
      </tr>`.__raw;
  }
}

registerPaginationCallback('loadHistory', loadHistory);

// Espelha MAX_QUANTIDADE de lib/parsers.js. O servidor é a autoridade — isto
// aqui só evita que o usuário chegue a enviar um valor que seria recusado.
const BUY_QTY_MAX = 20;

/** Lê a quantidade atual do campo; 1 se estiver vazio ou inválido. */
export function getBuyQty() {
  const n = parseInt(document.getElementById('buy-qty').value, 10);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, BUY_QTY_MAX) : 1;
}

/**
 * Única porta de escrita do campo de quantidade: aplica o limite, atualiza o
 * subtotal e desabilita os botões nos extremos.
 */
export function setBuyQty(n) {
  const qty = Math.min(Math.max(Number.isInteger(n) ? n : 1, 1), BUY_QTY_MAX);

  document.getElementById('buy-qty').value = qty;
  document.getElementById('btn-qty-minus').disabled = qty <= 1;
  document.getElementById('btn-qty-plus').disabled  = qty >= BUY_QTY_MAX;

  const preco = state.selectedProduct ? Number(state.selectedProduct.preco) : 0;
  document.getElementById('buy-subtotal').textContent =
    qty > 1 ? `${qty} x ${fmtBRL(preco)} = ${fmtBRL(preco * qty)}` : '';

  return qty;
}

/**
 * Aplica um passo do stepper. O campo vazio conta como zero, senão "+" a partir
 * do vazio saltaria para 2 (`getBuyQty` devolve 1 quando não há valor).
 */
export function stepBuyQty(delta, botao) {
  const input = document.getElementById('buy-qty');
  const atual = input.value.trim() === '' ? 0 : getBuyQty();

  setBuyQty(atual + delta);

  // Chegar no limite desabilita o próprio botão clicado, e o foco cairia no
  // body, fora do modal. Devolve o foco ao campo nesse caso.
  if (botao?.disabled) input.focus();
}

export function openBuyModal(id, nome, preco) {
  state.selectedProduct = { id, nome, preco };
  document.getElementById('modal-name').textContent = nome;
  document.getElementById('modal-price').textContent = fmtBRL(preco);
  setBuyQty(1); // toda compra começa em 1
  state.buyModal.show();
}

/** Descarta não-dígitos enquanto o usuário digita, mantendo o campo coerente. */
export function onBuyQtyInput() {
  const input = document.getElementById('buy-qty');
  const limpo = input.value.replace(/\D/g, '');

  if (limpo === '') {
    // Deixa vazio durante a digitação; o blur normaliza para 1.
    input.value = '';
    document.getElementById('buy-subtotal').textContent = '';
    return;
  }
  setBuyQty(parseInt(limpo, 10));
}

export async function confirmBuy() {
  if (!state.selectedProduct || !state.currentUser) return;

  const quantidade = getBuyQty();
  const nome = state.selectedProduct.nome;
  const btn = document.getElementById('btn-confirm-buy');
  setBtnLoading(btn, true, 'Aguarde...');

  try {
    await apiCall('POST', '/comprar', { id_produto: state.selectedProduct.id, quantidade });
    state.buyModal.hide();
    showToast(
      quantidade > 1 ? `${quantidade}x ${nome} registrados!` : `${nome} registrado!`,
      'success'
    );
    state.selectedProduct = null;
    loadHistory(1);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    setBtnLoading(btn, false);
  }
}
