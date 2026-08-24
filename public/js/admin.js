// ── ADMIN — RELATÓRIO ────────────────────────────────────────

import { apiCall } from './api.js';
import { renderPagination, registerPaginationCallback } from './pagination.js';
import { loadHistory } from './shop.js';
import { state, registerResetHook } from './state.js';
import { icon, showToast, setBtnLoading, fmtBRL, fmtDate } from './utils.js';
import { normalizeSearchText } from './lib/filter.js';
import { sortByField } from './lib/sort.js';
import { html, raw } from './lib/html.js';
import { registerRegion, setRegion } from './lib/region.js';
import { applyDetailHeaderView } from './lib/view-state.js';

let allAdminReport = [];

// ── Estado de ordenação ───────────────────────────────────────
// Padrão: total_gasto DESC (comportamento original do servidor)
let adminSortField = 'total_gasto';
let adminSortDir   = 'desc';

// Dados de admin não podem sobreviver a um logout/troca de sessão.
registerResetHook(() => {
  allAdminReport = [];
  adminSortField = 'total_gasto';
  adminSortDir   = 'desc';
});

// ── Auto-refresh ──────────────────────────────────────────────
let adminAutoRefreshId    = null;
const ADMIN_AUTO_REFRESH_MS = 60_000; // 60 segundos

// Pausa o auto-refresh enquanto qualquer modal Bootstrap estiver aberto
let _modalOpenCount = 0;
function _onAnyModalShow()   { _modalOpenCount += 1; stopAdminAutoRefresh(); }
function _onAnyModalHidden() { _modalOpenCount = Math.max(0, _modalOpenCount - 1); if (_modalOpenCount === 0) startAdminAutoRefresh(); }
document.addEventListener('show.bs.modal',   _onAnyModalShow);
document.addEventListener('hidden.bs.modal', _onAnyModalHidden);

function updateBulkResetButtonState() {
  const btn = document.getElementById('btn-zerar-todos');
  if (!btn) return;

  const totalElegiveis = allAdminReport.filter(r => Number(r.total_gasto) > 0).length;
  btn.disabled = totalElegiveis === 0;
  btn.innerHTML = (totalElegiveis > 0
    ? html`${raw(icon('close'))} Zerar todos (${totalElegiveis})`
    : html`${raw(icon('close'))} Zerar todos`).__raw;
  btn.title = totalElegiveis > 0
    ? 'Zera o saldo atual dos usuários com consumo no relatório'
    : 'Nenhum usuário com saldo atual para zerar';
}

/**
 * Pré-computa os campos de busca normalizados ao carregar os dados.
 * O(n) uma vez — elimina o normalize() a cada keystroke durante a busca.
 *
 * @param {object[]} rows
 * @returns {object[]}
 */
function preNormalizeAdminReport(rows) {
  return rows.map(r => ({
    ...r,
    _nomeIdx:   normalizeSearchText(r.nome),
    _codigoIdx: normalizeSearchText(String(r.codigo_acesso)),
  }));
}

/**
 * Atualiza o cabeçalho da tabela com indicadores de ordenação.
 * Usa delegação no <thead> — funciona mesmo após re-render do tbody.
 */
function updateAdminThead() {
  const tr = document.querySelector('#screen-admin .admin-table thead tr');
  if (!tr) return;

  const cols = [
    { field: 'codigo_acesso', label: 'CÓDIGO'      },
    { field: 'nome',          label: 'USUÁRIO'     },
    { field: 'total_itens',   label: 'ITENS'       },
    { field: 'total_gasto',   label: 'TOTAL GASTO' },
    { field: null,            label: 'AÇÕES'       },
  ];

  tr.innerHTML = cols.map(c => {
    if (!c.field) return html`<th>${c.label}</th>`.__raw;

    const isActive = adminSortField === c.field;
    const arrow    = isActive ? (adminSortDir === 'asc' ? '▲' : '▼') : '⇅';
    const color    = isActive ? 'color:var(--bc-amber);' : '';

    return html`
      <th role="columnheader" tabindex="0" data-sort="${c.field}"
          style="cursor:pointer;user-select:none;${raw(color)}">
        ${c.label}
        <span style="margin-left:4px;font-size:.6rem;
                     opacity:${isActive ? 1 : .3};">${arrow}</span>
      </th>`.__raw;
  }).join('');
}

/** Trata clique no cabeçalho para alternar ordenação. */
export function onAdminTheadClick(e) {
  const th = e.target.closest('th[data-sort]');
  if (!th) return;

  const field = th.dataset.sort;
  if (adminSortField === field) {
    adminSortDir = adminSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    adminSortField = field;
    // Nome e código: padrão ASC; numéricos: padrão DESC
    adminSortDir   = (field === 'nome' || field === 'codigo_acesso') ? 'asc' : 'desc';
  }

  updateAdminThead();
  filterAdminReport();
}

// ── Barra de resumo ───────────────────────────────────────────

registerRegion('admin-summary-bar', {
  target: '#admin-summary-bar',
  empty: () => raw(''),
  data: ({ count, totalItens, totalGeral, ticketMedio }) => html`
    <span>
      <strong class="metric-value" style="color:var(--bc-text)">${count}</strong>
      <span class="metric-label"> usuários</span>
    </span>
    <span>
      <strong class="metric-value" style="color:var(--bc-accent)">${totalItens}</strong>
      <span class="metric-label"> itens consumidos</span>
    </span>
    <span>
      <strong class="metric-value" style="color:var(--bc-amber)">${fmtBRL(totalGeral)}</strong>
      <span class="metric-label"> total geral</span>
    </span>
    <span>
      <strong class="metric-value" style="color:var(--bc-green)">${fmtBRL(ticketMedio)}</strong>
      <span class="metric-label"> ticket médio</span>
    </span>
  `,
});

/** Esconde a barra de resumo. Chamada durante loading — evita números desatualizados visíveis. */
function hideAdminSummary() {
  document.getElementById('admin-summary-bar')?.classList.add('d-none');
}

/**
 * Renderiza (ou esconde) a barra de estatísticas acima da tabela.
 * Sempre usa allAdminReport (dataset completo), independente de filtros ativos.
 */
function renderAdminSummary() {
  const bar = document.getElementById('admin-summary-bar');
  if (!bar) return;

  if (!allAdminReport.length) {
    bar.classList.add('d-none');
    setRegion('admin-summary-bar', { status: 'empty' });
    return;
  }

  const totalGeral  = allAdminReport.reduce((s, r) => s + Number(r.total_gasto), 0);
  const totalItens  = allAdminReport.reduce((s, r) => s + Number(r.total_itens), 0);
  const comConsumo  = allAdminReport.filter(r => Number(r.total_gasto) > 0).length;
  const ticketMedio = comConsumo > 0 ? totalGeral / comConsumo : 0;

  bar.classList.remove('d-none');
  setRegion('admin-summary-bar', {
    status: 'data',
    data: { count: allAdminReport.length, totalItens, totalGeral, ticketMedio },
  });
}

// ── Render ─────────────────────────────────────────────────────

registerRegion('admin-body', {
  target: '#admin-body',

  loading: () => html`
    <tr>
      <td colspan="5">
        <div class="empty-state">
          <div class="bc-loader mx-auto"></div>
          <div class="mt-2">Carregando...</div>
        </div>
      </td>
    </tr>`,

  error: () => html`
    <tr>
      <td colspan="5"
          style="text-align:center;color:var(--bc-red);
                 font-family:var(--bc-mono);font-size:.8rem;">
        ✗ Erro ao carregar
      </td>
    </tr>`,

  empty: ({ isFiltering }) => html`
    <tr>
      <td colspan="5">
        <div class="empty-state">
          <div class="empty-icon">${raw(icon(isFiltering ? 'search' : 'users', 28))}</div>
          <div>${isFiltering ? 'Nenhum usuário encontrado' : 'Nenhum usuário para exibir'}</div>
        </div>
      </td>
    </tr>`,

  data: sorted => html`${sorted.map(r => html`
        <tr class="admin-row-clickable" role="row" tabindex="0"
            data-action="open-detail"
            data-id="${r.id}"
            data-nome="${r.nome}"
            data-codigo="${r.codigo_acesso}"
            data-total-gasto="${Number(r.total_gasto)}"
            data-total-itens="${Number(r.total_itens)}">
          <td data-label="CÓDIGO"
              style="font-family:var(--bc-mono);color:var(--bc-muted);">
            ${String(r.codigo_acesso).padStart(6, '0')}
          </td>
          <td data-label="USUÁRIO">
            <div class="user-name-link">
              ${r.nome}
              <span class="click-hint">→ ver consumos</span>
            </div>
          </td>
          <td data-label="ITENS" style="font-family:var(--bc-mono);">${r.total_itens}</td>
          <td data-label="TOTAL">
            <span class="total-badge ${Number(r.total_gasto) === 0 ? 'zero-total' : ''}">
              ${fmtBRL(r.total_gasto)}
            </span>
          </td>
          <td data-label="">
            <button class="btn-zerar"
                    data-action="open-zerar"
                    data-id="${r.id}"
                    data-nome="${r.nome}"
                    ${raw(Number(r.total_gasto) === 0 ? 'disabled' : '')}>
              ${raw(icon('close'))} Zerar
            </button>
          </td>
        </tr>`)}`,
});

export function filterAdminReport() {
  const searchInput = document.getElementById('admin-search');

  let filtered = allAdminReport;
  let isFiltering = false;

  if (searchInput) {
    // Normaliza o termo uma vez — compara com campos pré-computados (_nomeIdx, _codigoIdx)
    const term = normalizeSearchText(searchInput.value);
    filtered = allAdminReport.filter(r =>
      r._nomeIdx.includes(term) || r._codigoIdx.includes(term)
    );
    isFiltering = term.length > 0;
  }

  // Resumo sempre reflete o dataset completo, independente do filtro ativo
  renderAdminSummary();

  if (!filtered.length) {
    setRegion('admin-body', { status: 'empty', ctx: { isFiltering } });
    return;
  }

  const sorted = sortByField(filtered, adminSortField, adminSortDir);
  setRegion('admin-body', { status: 'data', data: sorted });
}

export async function loadAdmin() {
  setRegion('admin-body', { status: 'loading' });

  // Esconde o resumo durante loading para evitar números desatualizados visíveis
  hideAdminSummary();
  _setRefreshBtnState('loading');

  try {
    const rows     = await apiCall('GET', '/admin/relatorio');
    allAdminReport = preNormalizeAdminReport(rows);
    updateAdminThead();
    updateBulkResetButtonState();
    filterAdminReport();
    _setRefreshBtnState('done');
  } catch (err) {
    allAdminReport = [];
    updateBulkResetButtonState();
    setRegion('admin-body', { status: 'error', error: err });
    _setRefreshBtnState('error');
  }
}

/** Atualiza o texto acima do botão de refresh com o horário da última atualização. */
function _setRefreshBtnState(state) {
  const btn = document.getElementById('btn-refresh-admin');
  const updatedAt = document.getElementById('admin-updated-at');
  if (!btn) return;

  btn.innerHTML = html`${raw(icon('refresh'))} Atualizar`.__raw;

  if (state === 'loading') {
    if (updatedAt) updatedAt.textContent = 'Atualizando...';
  } else if (state !== 'error' && updatedAt) {
    const hhmm = new Date().toLocaleTimeString('pt-BR', {
      hour: '2-digit', minute: '2-digit',
    });
    updatedAt.textContent = `Atualizado ${hhmm}`;
  }
}

// ── Auto-refresh ──────────────────────────────────────────────

/** Inicia o auto-refresh de 60s. Chame ao entrar na aba de controle. */
export function startAdminAutoRefresh() {
  stopAdminAutoRefresh();
  adminAutoRefreshId = setInterval(() => {
    // Só atualiza se a tela de admin estiver visível — evita requisições desnecessárias
    if (document.getElementById('screen-admin')?.classList.contains('active')) {
      loadAdmin();
    }
  }, ADMIN_AUTO_REFRESH_MS);
}

/** Para o auto-refresh. Chame no logout ou ao sair da aba. */
export function stopAdminAutoRefresh() {
  if (adminAutoRefreshId !== null) {
    clearInterval(adminAutoRefreshId);
    adminAutoRefreshId = null;
  }
}

// ── Delegation cliques ────────────────────────────────────────

export function onAdminBodyClick(e) {
  const zerarBtn = e.target.closest('[data-action="open-zerar"]');
  if (zerarBtn) {
    e.stopPropagation();
    openZerarModal(
      parseInt(zerarBtn.dataset.id, 10),
      zerarBtn.dataset.nome || ''
    );
    return;
  }

  const row = e.target.closest('tr[data-action="open-detail"]');
  if (!row) return;

  openDetailModal(
    parseInt(row.dataset.id, 10),
    row.dataset.nome || '',
    parseInt(row.dataset.codigo, 10),
    Number(row.dataset.totalGasto),
    parseInt(row.dataset.totalItens, 10)
  );
}

// ── MODAL DE DETALHES ─────────────────────────────────────────

async function openDetailModal(id, nome, codigo, totalGasto, totalItens) {
  state.detailUserId = id;
  // Estado dedicado para o nome — evita parsing frágil do DOM em openZerarFromDetail
  state.detailUserNome = nome;

  state.pagState.detail = { page: 1, limit: 20, total: 0, totalPages: 1 };

  document.getElementById('detail-title').textContent = nome;
  document.getElementById('detail-subtitle').textContent = `Código de acesso: ${codigo}`;
  document.getElementById('detail-total').textContent = fmtBRL(totalGasto);
  document.getElementById('detail-count').textContent = totalItens;
  document.getElementById('detail-avg').textContent =
    totalItens > 0 ? fmtBRL(totalGasto / totalItens) : fmtBRL(0);
  // total_ocultos real só chega em loadDetailPage → updateDetailStats
  applyDetailHeaderView({ total_itens: totalItens, favorito: null, total_ocultos: 0 });

  state.detailModal.show();
  await loadDetailPage();
}

function updateDetailStats(stats) {
  const { total_gasto, total_itens } = stats;

  document.getElementById('detail-total').textContent = fmtBRL(total_gasto);
  document.getElementById('detail-count').textContent = total_itens;
  document.getElementById('detail-avg').textContent =
    total_itens > 0 ? fmtBRL(total_gasto / total_itens) : fmtBRL(0);

  applyDetailHeaderView(stats);
}

registerRegion('detail-body', {
  target: '#detail-body',

  loading: () => html`
    <tr>
      <td colspan="5">
        <div class="empty-state">
          <div class="bc-loader mx-auto"></div>
        </div>
      </td>
    </tr>`,

  error: () => html`
    <tr>
      <td colspan="5"
          style="text-align:center;color:var(--bc-red);
                 font-family:var(--bc-mono);font-size:.8rem;">
        ✗ Erro
      </td>
    </tr>`,

  empty: () => html`
    <tr>
      <td colspan="5">
        <div class="empty-state">
          <div class="empty-icon">${raw(icon('receipt', 28))}</div>
          <div>Nenhum consumo registrado</div>
        </div>
      </td>
    </tr>`,

  data: (items, { offset }) => html`${items.map((item, i) => html`
      <tr id="consumo-row-${item.id}">
        <td data-label="#"
            style="color:var(--bc-muted);font-family:var(--bc-mono);">
          ${String(offset + i + 1).padStart(2, '0')}
        </td>
        <td data-label="PRODUTO">${item.produto}</td>
        <td data-label="VALOR"
            style="color:var(--bc-green);font-family:var(--bc-mono);font-weight:600;">
          ${fmtBRL(item.preco)}
        </td>
        <td data-label="DATA/HORA"
            style="color:var(--bc-muted);font-family:var(--bc-mono);font-size:.82rem;">
          ${fmtDate(item.data_hora)}
        </td>
        <td data-label="">
          <button class="btn-remove"
                  data-action="estornar-consumo"
                  data-id="${item.id}"
                  data-produto="${item.produto}"
                  data-preco="${Number(item.preco)}">
            ${raw(icon('trash'))} Remover
          </button>
        </td>
      </tr>`)}`,
});

export async function loadDetailPage(pageNum = null) {
  if (!state.detailUserId) return;
  if (pageNum !== null) state.pagState.detail.page = pageNum;

  const { page, limit } = state.pagState.detail;
  const pagEl = document.getElementById('detail-pagination');

  setRegion('detail-body', { status: 'loading' });
  pagEl.classList.add('d-none');

  try {
    const res = await apiCall(
      'GET',
      `/admin/detalhes/${state.detailUserId}?page=${page}&limit=${limit}`
    );
    const { data, pagination, stats } = res;

    state.pagState.detail = { ...state.pagState.detail, ...pagination };
    updateDetailStats(stats);

    if (!data.length) {
      setRegion('detail-body', { status: 'empty' });
      return;
    }

    const offset = (page - 1) * limit;
    setRegion('detail-body', { status: 'data', data, ctx: { offset } });

    renderPagination('detail-pagination', state.pagState.detail, 'loadDetailPage');
  } catch (err) {
    setRegion('detail-body', { status: 'error', error: err });
  }
}

registerPaginationCallback('loadDetailPage', loadDetailPage);

export function onDetailBodyClick(e) {
  const btn = e.target.closest('[data-action="estornar-consumo"], [data-action="remove-consumo"]');
  if (!btn) return;

  removeConsumoItem(
    parseInt(btn.dataset.id, 10),
    btn.dataset.produto || '',
    Number(btn.dataset.preco)
  );
}

// ── ZERAGEM DE SALDO (INDIVIDUAL & EM MASSA) ─────────────────

export function openZerarIndividualModal(id, nome) {
  state.zerarAllUsers = false;
  state.zerarUserId = id;
  document.getElementById('zerar-title').textContent = 'Zerar saldo';
  document.getElementById('zerar-prompt').textContent = 'Confirma zerar o saldo atual de';
  document.getElementById('zerar-nome').textContent = nome;
  document.getElementById('zerar-description').innerHTML =
    'Os consumos anteriores deixarão de contar no saldo atual.<br>Os dados serão preservados no banco.';
  document.getElementById('btn-confirm-zerar').textContent = 'Zerar saldo';
  state.zerarModal.show();
}

// Mantém compatibilidade com nome anterior
export const openZerarModal = openZerarIndividualModal;

export function openZerarEmMassaModal() {
  const totalElegiveis = allAdminReport.filter(r => Number(r.total_gasto) > 0).length;
  if (totalElegiveis === 0) {
    showToast('Nenhum usuário com saldo atual para zerar.', 'error');
    return;
  }

  state.zerarAllUsers = true;
  state.zerarUserId = null;
  document.getElementById('zerar-title').textContent = 'Zerar todos os saldos';
  document.getElementById('zerar-prompt').textContent = 'Confirma zerar o saldo atual dos usuários abaixo?';
  document.getElementById('zerar-nome').textContent =
    `${totalElegiveis} usuário${totalElegiveis > 1 ? 's' : ''} com saldo atual`;
  document.getElementById('zerar-description').innerHTML =
    'Será aplicada a mesma regra da zeragem individual do relatório geral.<br>Os dados serão preservados no banco.';
  document.getElementById('btn-confirm-zerar').textContent = 'Zerar todos';
  state.zerarModal.show();
}

// Mantém compatibilidade com nome anterior
export const openZerarTodosModal = openZerarEmMassaModal;

export function openZerarFromDetail() {
  if (!state.detailUserId || !state.detailUserNome) return;

  openZerarIndividualModal(state.detailUserId, state.detailUserNome);
  state.detailModal.hide();
}

async function executarZeragemEmMassa() {
  const res = await apiCall('POST', '/admin/zerar-em-massa');
  state.zerarModal.hide();
  showToast(res.message, 'success');
  state.zerarAllUsers = false;
  loadAdmin();
}

async function executarZeragemIndividual(userId) {
  await apiCall('POST', `/admin/zerar-individual/${userId}`);
  state.zerarModal.hide();
  showToast('Saldo zerado com sucesso!', 'success');
  state.zerarUserId = null;
  state.zerarAllUsers = false;
  loadAdmin();
}

export async function confirmZerar() {
  if (!state.zerarAllUsers && !state.zerarUserId) return;
  const btn = document.getElementById('btn-confirm-zerar');
  setBtnLoading(btn, true, 'Aguarde...');
  try {
    if (state.zerarAllUsers) {
      await executarZeragemEmMassa();
    } else {
      await executarZeragemIndividual(state.zerarUserId);
    }
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    setBtnLoading(btn, false);
  }
}

// ── REMOVER ITEM DE CONSUMO ───────────────────────────────────

function removeConsumoItem(id, produto, preco) {
  state.removeConsumoId    = id;
  document.getElementById('remove-consumo-nome').textContent  = produto;
  document.getElementById('remove-consumo-preco').textContent = fmtBRL(preco);
  state.removeConsumoModal.show();
}

export async function confirmRemoveConsumo() {
  if (!state.removeConsumoId) return;
  const btn = document.getElementById('btn-confirm-remove-consumo');
  setBtnLoading(btn, true, 'Aguarde...');
  try {
    await apiCall('POST', `/admin/consumo/${state.removeConsumoId}/ocultar`);
    state.removeConsumoModal.hide();
    showToast('Item estornado com sucesso!', 'success');
    state.removeConsumoId    = null;

    await loadDetailPage();
    loadAdmin();

    if (state.currentUser && !state.currentUser.is_admin && state.currentUser.id === state.detailUserId) {
      loadHistory();
    }
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    setBtnLoading(btn, false);
  }
}

// ── ITENS OCULTOS (arquivo / auditoria) ───────────────────────

export async function openOcultosModal() {
  if (!state.detailUserId) return;

  state.pagState.ocultos = { page: 1, limit: 20, total: 0, totalPages: 1 };
  document.getElementById('ocultos-title').textContent = `Histórico e estornos — ${state.detailUserNome || ''}`;

  state.ocultosModal.show();
  await loadOcultosPage();
}

registerRegion('ocultos-body', {
  target: '#ocultos-body',

  loading: () => html`
    <tr>
      <td colspan="5">
        <div class="empty-state">
          <div class="bc-loader mx-auto"></div>
        </div>
      </td>
    </tr>`,

  error: () => html`
    <tr>
      <td colspan="5"
          style="text-align:center;color:var(--bc-red);
                 font-family:var(--bc-mono);font-size:.8rem;">
        ✗ Erro
      </td>
    </tr>`,

  empty: () => html`
    <tr>
      <td colspan="5">
        <div class="empty-state">
          <div class="empty-icon">${raw(icon('archive', 28))}</div>
          <div>Nenhum item oculto</div>
        </div>
      </td>
    </tr>`,

  data: (items, { offset }) => html`${items.map((item, i) => {
    let auditoria;
    if (item.oculto_manual) {
      const por = item.ocultado_por
        ? html`<span class="ocultos-audit-by">${item.ocultado_por}</span>`
        : html`<span class="ocultos-audit-by">—</span>`;
      auditoria = html`ocultado por ${por}<br>${fmtDate(item.ocultado_em || item.data_hora)}`;
    } else {
      auditoria = html`<span class="ocultos-audit-by">arquivado (zeragem)</span><br>${fmtDate(item.data_hora)}`;
    }

    const acao = html`
      <button class="btn-restore"
              data-action="restore-consumo"
              data-id="${item.id}"
              data-produto="${item.produto}"
              data-preco="${Number(item.preco)}">
        ${raw(icon('restore'))} Voltar ao saldo
      </button>`;
    return html`
      <tr id="oculto-row-${item.id}">
        <td data-label="#"
            style="color:var(--bc-muted);font-family:var(--bc-mono);">
          ${String(offset + i + 1).padStart(2, '0')}
        </td>
        <td data-label="PRODUTO">${item.produto}</td>
        <td data-label="VALOR"
            style="color:var(--bc-text-dim);font-family:var(--bc-mono);font-weight:600;">
          ${fmtBRL(item.preco)}
        </td>
        <td data-label="AUDITORIA">
          <div class="ocultos-audit">
            ${auditoria}
          </div>
        </td>
        <td data-label="">${acao}</td>
      </tr>`;
  })}`,
});

export async function loadOcultosPage(pageNum = null) {
  if (!state.detailUserId) return;
  if (pageNum !== null) state.pagState.ocultos.page = pageNum;

  const { page, limit } = state.pagState.ocultos;
  const pagEl = document.getElementById('ocultos-pagination');

  setRegion('ocultos-body', { status: 'loading' });
  pagEl.classList.add('d-none');

  try {
    const res = await apiCall(
      'GET',
      `/admin/ocultos/${state.detailUserId}?page=${page}&limit=${limit}`
    );
    const { data, pagination } = res;

    state.pagState.ocultos = { ...state.pagState.ocultos, ...pagination };

    if (!data.length) {
      setRegion('ocultos-body', { status: 'empty' });
      return;
    }

    const offset = (page - 1) * limit;
    setRegion('ocultos-body', { status: 'data', data, ctx: { offset } });

    renderPagination('ocultos-pagination', state.pagState.ocultos, 'loadOcultosPage');
  } catch (err) {
    setRegion('ocultos-body', { status: 'error', error: err });
  }
}

export function onOcultosBodyClick(e) {
  const btn = e.target.closest('[data-action="restore-consumo"]');
  if (!btn) return;

  restoreConsumoItem(
    parseInt(btn.dataset.id, 10),
    btn.dataset.produto || '',
    Number(btn.dataset.preco)
  );
}

registerPaginationCallback('loadOcultosPage', loadOcultosPage);

function restoreConsumoItem(id, produto, preco) {
  state.restoreConsumoId    = id;
  document.getElementById('restore-consumo-nome').textContent  = produto;
  document.getElementById('restore-consumo-preco').textContent = fmtBRL(preco);
  state.restoreConsumoModal.show();
}

export async function confirmRestoreConsumo() {
  if (!state.restoreConsumoId) return;
  const btn = document.getElementById('btn-confirm-restore-consumo');
  setBtnLoading(btn, true, 'Aguarde...');
  try {
    await apiCall('POST', `/admin/consumo/${state.restoreConsumoId}/restaurar`);
    state.restoreConsumoModal.hide();
    showToast('Item retornado ao saldo com sucesso!', 'success');
    state.restoreConsumoId    = null;

    await loadOcultosPage();
    await loadDetailPage();
    loadAdmin();

    if (state.currentUser && !state.currentUser.is_admin && state.currentUser.id === state.detailUserId) {
      loadHistory();
    }
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    setBtnLoading(btn, false);
  }
}

export const confirmEstornarConsumo = confirmRemoveConsumo;
export const confirmReativarConsumo = confirmRestoreConsumo;
export const openEstornarConsumoModal = removeConsumoItem;
export const openReativarConsumoModal = restoreConsumoItem;
