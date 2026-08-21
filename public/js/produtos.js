// ── ADMIN — PRODUTOS ─────────────────────────────────────────

import { apiCall } from './api.js';
import { openConfirm } from './confirm.js';
import { state, registerResetHook } from './state.js';
import { icon, showToast, setSaveLoading, fmtBRL } from './utils.js';
import { normalizeSearchText } from './lib/filter.js';
import { html, raw } from './lib/html.js';
import { registerRegion, setRegion } from './lib/region.js';

let allProdutosAdmin = [];

registerResetHook(() => { allProdutosAdmin = []; });

/**
 * Pré-computa o campo de busca normalizado ao carregar os dados.
 * O(n) uma vez — elimina o normalize() a cada keystroke durante a busca.
 *
 * @param {object[]} rows
 * @returns {object[]}
 */
function preNormalizeProdutos(rows) {
  return rows.map(p => ({
    ...p,
    _nomeIdx: normalizeSearchText(p.nome),
  }));
}

registerRegion('produtos-body', {
  target: '#produtos-body',

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
          <div class="empty-icon">${raw(icon(isFiltering ? 'search' : 'package', 28))}</div>
          <div>${isFiltering ? 'Nenhum produto encontrado' : 'Nenhum produto cadastrado'}</div>
        </div>
      </td>
    </tr>`,

  data: produtos => html`${produtos.map(
    p => html`
    <tr class="${p.ativo ? '' : 'row-inativo'}">
      <td data-label="ID"
          style="font-family:var(--bc-mono);color:var(--bc-muted);">${p.id}</td>
      <td data-label="NOME"
          style="font-weight:600;">
        ${p.nome}
        ${raw(!p.ativo ? ' <span class="inativo-inline-label">(Inativo)</span>' : '')}
      </td>
      <td data-label="PREÇO"
          style="font-family:var(--bc-mono);color:var(--bc-green);">${fmtBRL(p.preco)}</td>
      <td data-label="STATUS">
        <span class="status-badge ${p.ativo ? 'status-ativo' : 'status-inativo'}">
          ${p.ativo ? 'Ativo' : 'Inativo'}
        </span>
      </td>
      <td data-label="">
        <div class="actions-cell">
          <button class="btn-edit"
            data-action="edit-produto"
            data-id="${p.id}"
            data-nome="${p.nome}"
            data-preco="${Number(p.preco)}"
            data-ativo="${p.ativo ? 'true' : 'false'}">${raw(icon('pencil'))} Editar</button>

          <button class="${p.ativo ? 'btn-zerar' : 'btn-restore'}"
            data-action="toggle-produto"
            data-id="${p.id}"
            data-nome="${p.nome}"
            data-ativo="${p.ativo ? 'true' : 'false'}">
            ${raw(p.ativo ? icon('close') + ' Inativar' : icon('restore') + ' Reativar')}
          </button>

          <button class="btn-remove"
            data-action="remove-produto"
            data-id="${p.id}"
            data-nome="${p.nome}">${raw(icon('trash'))} Excluir</button>
        </div>
      </td>
    </tr>`
  )}`,
});

export function filterProdutosAdmin() {
  const searchInput = document.getElementById('produtos-search');

  let filtered = allProdutosAdmin;
  let isFiltering = false;

  if (searchInput) {
    // Normaliza o termo uma vez — compara com campo pré-computado (_nomeIdx)
    const term = normalizeSearchText(searchInput.value);
    filtered = allProdutosAdmin.filter(p => p._nomeIdx.includes(term));
    isFiltering = term.length > 0;
  }

  setRegion('produtos-body', filtered.length
    ? { status: 'data', data: filtered }
    : { status: 'empty', ctx: { isFiltering } });
}

export async function loadProdutosAdmin() {
  setRegion('produtos-body', { status: 'loading' });

  try {
    const rows      = await apiCall('GET', '/admin/produtos');
    // Pré-normaliza ao carregar — O(n) uma vez, não a cada busca
    allProdutosAdmin = preNormalizeProdutos(rows);
    filterProdutosAdmin();
  } catch (err) {
    setRegion('produtos-body', { status: 'error', error: err });
  }
}

export function onProdutosBodyClick(e) {
  const edit = e.target.closest('[data-action="edit-produto"]');
  if (edit) {
    openProdutoModal(
      parseInt(edit.dataset.id, 10),
      edit.dataset.nome || '',
      Number(edit.dataset.preco),
      edit.dataset.ativo === 'true'
    );
    return;
  }

  const toggle = e.target.closest('[data-action="toggle-produto"]');
  if (toggle) {
    openToggleProdutoModal(
      parseInt(toggle.dataset.id, 10),
      toggle.dataset.nome || '',
      toggle.dataset.ativo === 'true'
    );
    return;
  }

  const rm = e.target.closest('[data-action="remove-produto"]');
  if (rm) {
    openRemoveProdutoModal(parseInt(rm.dataset.id, 10), rm.dataset.nome || '');
  }
}

export function openProdutoModal(id = null, nome = '', preco = '', ativo = true) {
  document.getElementById('produto-id').value    = id || '';
  document.getElementById('produto-nome').value  = nome;
  document.getElementById('produto-preco').value = preco;
  document.getElementById('produto-ativo').value = String(ativo);
  document.getElementById('produto-modal-title').textContent =
    id ? 'Editar produto' : 'Novo produto';
  state.produtoModal.show();
}

export async function saveProduto() {
  const id    = document.getElementById('produto-id').value;
  const nome  = document.getElementById('produto-nome').value.trim();
  const ativo = document.getElementById('produto-ativo').value === 'true';

  if (!nome) return showToast('Informe o nome do produto.', 'error');

  // Number() rejeita strings parcialmente numéricas (ex: "1.5kg" → NaN),
  // ao contrário de parseFloat("1.5kg") que retornaria 1.5 silenciosamente.
  const precoRaw = document.getElementById('produto-preco').value.trim();
  const preco    = precoRaw === '' ? NaN : Number(precoRaw);

  if (!Number.isFinite(preco) || preco < 0) {
    return showToast('Informe um preço válido (ex: 7.50).', 'error');
  }

  setSaveLoading('produto', true);
  try {
    if (id) {
      await apiCall('PUT', `/admin/produtos/${id}`, { nome, preco, ativo });
      showToast('Produto atualizado!', 'success');
    } else {
      await apiCall('POST', '/admin/produtos', { nome, preco, ativo });
      showToast('Produto criado!', 'success');
    }
    state.produtoModal.hide();
    loadProdutosAdmin();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    setSaveLoading('produto', false);
  }
}

function openToggleProdutoModal(id, nome, ativoAtual) {
  openConfirm({
    title: ativoAtual ? 'Inativar produto' : 'Ativar produto',
    message: ativoAtual
      ? `Inativar "${nome}"? O produto não aparecerá na loja. Poderá reativar a qualquer momento.`
      : `Ativar "${nome}"? O produto voltará a aparecer na loja.`,
    variant: ativoAtual ? 'warning' : 'success',
    confirmLabel: ativoAtual ? 'Inativar' : 'Ativar',
    onConfirm: async () => {
      const acao = ativoAtual ? 'inativar' : 'ativar';
      try {
        await apiCall('DELETE', `/admin/produtos/${id}?acao=${acao}`);
        showToast(acao === 'inativar' ? 'Produto inativado!' : 'Produto ativado!', 'success');
        loadProdutosAdmin();
      } catch (err) {
        showToast(err.message, 'error');
      }
    },
  });
}

function openRemoveProdutoModal(id, nome) {
  state.removeProdutoId = id;
  openConfirm({
    title: 'Excluir produto',
    message: `Tem certeza que deseja excluir "${nome}"? Esta ação não pode ser desfeita.`,
    variant: 'danger',
    confirmLabel: 'Excluir',
    onConfirm: async () => {
      try {
        await apiCall('DELETE', `/admin/produtos/${id}?acao=excluir`);
        showToast('Produto excluído!', 'success');
        loadProdutosAdmin();
      } catch (err) {
        showToast(err.message, 'error');
      }
    },
  });
}
