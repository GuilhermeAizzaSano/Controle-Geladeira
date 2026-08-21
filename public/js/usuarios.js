// ── ADMIN — USUÁRIOS ─────────────────────────────────────────

import { apiCall } from './api.js';
import { openConfirm } from './confirm.js';
import { state, registerResetHook } from './state.js';
import { icon, showToast, setSaveLoading } from './utils.js';
import { normalizeSearchText } from './lib/filter.js';
import { html, raw } from './lib/html.js';
import { registerRegion, setRegion } from './lib/region.js';

let allUsuariosAdmin = [];

registerResetHook(() => { allUsuariosAdmin = []; });

/**
 * Pré-computa os campos de busca normalizados ao carregar os dados.
 * O(n) uma vez — elimina o normalize() a cada keystroke durante a busca.
 *
 * @param {object[]} rows
 * @returns {object[]}
 */
function preNormalizeUsuarios(rows) {
  return rows.map(u => ({
    ...u,
    _nomeIdx:   normalizeSearchText(u.nome),
    _codigoIdx: normalizeSearchText(String(u.codigo_acesso)),
  }));
}

registerRegion('usuarios-body', {
  target: '#usuarios-body',

  loading: () => html`
    <tr>
      <td colspan="4">
        <div class="empty-state">
          <div class="bc-loader mx-auto"></div>
          <div class="mt-2">Carregando...</div>
        </div>
      </td>
    </tr>`,

  error: () => html`
    <tr>
      <td colspan="4"
          style="text-align:center;color:var(--bc-red);
                 font-family:var(--bc-mono);font-size:.8rem;">
        ✗ Erro ao carregar
      </td>
    </tr>`,

  empty: ({ isFiltering }) => html`
    <tr>
      <td colspan="4">
        <div class="empty-state">
          <div class="empty-icon">${raw(icon(isFiltering ? 'search' : 'users', 28))}</div>
          <div>${isFiltering ? 'Nenhum usuário encontrado' : 'Nenhum usuário cadastrado'}</div>
        </div>
      </td>
    </tr>`,

  data: usuarios => html`${usuarios.map(
    u => html`
    <tr class="${u.ativo ? '' : 'row-inativo'}">
      <td data-label="CÓDIGO">
        <span class="code-badge ${u.ativo ? '' : 'code-badge--muted'}">${String(u.codigo_acesso).padStart(6, '0')}</span>
      </td>
      <td data-label="NOME" style="font-weight:600;">
        ${u.nome}${raw(u.is_admin ? ' <span class="role-badge">Admin</span>' : '')}
        ${raw(!u.ativo ? ' <span class="inativo-inline-label">(Inativo)</span>' : '')}
      </td>
      <td data-label="STATUS">
        <span class="status-badge ${u.ativo ? 'status-ativo' : 'status-inativo'}">
          ${u.ativo ? 'Ativo' : 'Inativo'}
        </span>
      </td>
      <td data-label="">
        <div class="actions-cell">
          <button class="btn-edit"
            data-action="edit-usuario"
            data-id="${u.id}"
            data-nome="${u.nome}"
            data-codigo="${u.codigo_acesso}"
            data-isadmin="${u.is_admin ? 'true' : 'false'}">${raw(icon('pencil'))} Editar</button>

          <button class="${u.ativo ? 'btn-zerar' : 'btn-restore'}"
            data-action="toggle-usuario"
            data-id="${u.id}"
            data-nome="${u.nome}"
            data-ativo="${u.ativo ? 'true' : 'false'}">
            ${raw(u.ativo ? icon('close') + ' Inativar' : icon('restore') + ' Reativar')}
          </button>

          <button class="btn-remove"
            data-action="remove-usuario"
            data-id="${u.id}"
            data-nome="${u.nome}">${raw(icon('trash'))} Excluir</button>
        </div>
      </td>
    </tr>`
  )}`,
});

export function filterUsuariosAdmin() {
  const searchInput = document.getElementById('usuarios-search');

  let filtered = allUsuariosAdmin;
  let isFiltering = false;

  if (searchInput) {
    // Normaliza o termo uma vez — compara com campos pré-computados (_nomeIdx, _codigoIdx)
    const term = normalizeSearchText(searchInput.value);
    filtered = allUsuariosAdmin.filter(u =>
      u._nomeIdx.includes(term) || u._codigoIdx.includes(term)
    );
    isFiltering = term.length > 0;
  }

  setRegion('usuarios-body', filtered.length
    ? { status: 'data', data: filtered }
    : { status: 'empty', ctx: { isFiltering } });
}

export async function loadUsuariosAdmin() {
  setRegion('usuarios-body', { status: 'loading' });

  try {
    const rows      = await apiCall('GET', '/admin/usuarios');
    // Pré-normaliza ao carregar — O(n) uma vez, não a cada busca
    allUsuariosAdmin = preNormalizeUsuarios(rows);
    filterUsuariosAdmin();
  } catch (err) {
    setRegion('usuarios-body', { status: 'error', error: err });
  }
}

export function onUsuariosBodyClick(e) {
  const edit = e.target.closest('[data-action="edit-usuario"]');
  if (edit) {
    openUsuarioModal(
      parseInt(edit.dataset.id, 10),
      edit.dataset.nome || '',
      edit.dataset.codigo || '',
      edit.dataset.isadmin === 'true'
    );
    return;
  }

  const toggle = e.target.closest('[data-action="toggle-usuario"]');
  if (toggle) {
    openToggleUsuarioModal(
      parseInt(toggle.dataset.id, 10),
      toggle.dataset.nome || '',
      toggle.dataset.ativo === 'true'
    );
    return;
  }

  const rm = e.target.closest('[data-action="remove-usuario"]');
  if (rm) {
    openRemoveUsuarioModal(parseInt(rm.dataset.id, 10), rm.dataset.nome || '');
  }
}

export function openUsuarioModal(id = null, nome = '', codigo = '', isAdmin = false) {
  document.getElementById('usuario-id').value       = id || '';
  document.getElementById('usuario-nome').value     = nome;
  // Garante que o código seja sempre exibido com zeros à esquerda (6 dígitos)
  document.getElementById('usuario-codigo').value   = codigo
    ? String(codigo).padStart(6, '0')
    : '';
  document.getElementById('usuario-is-admin').value = String(isAdmin);
  document.getElementById('usuario-modal-title').textContent =
    id ? 'Editar usuário' : 'Novo usuário';
  document.getElementById('usuario-codigo').disabled =
    !!(id && parseInt(id) === state.currentUser?.id);
  state.usuarioModal.show();
}

export async function saveUsuario() {
  const id        = document.getElementById('usuario-id').value;
  const nome      = document.getElementById('usuario-nome').value.trim();
  const codigoRaw = document.getElementById('usuario-codigo').value.trim();
  const isAdmin   = document.getElementById('usuario-is-admin').value === 'true';

  if (!nome) return showToast('Informe o nome do usuário.', 'error');

  // Valida exatamente 6 dígitos — envia como string para preservar zeros à esquerda
  if (!/^\d{6}$/.test(codigoRaw)) {
    return showToast('Código de acesso deve ter exatamente 6 dígitos.', 'error');
  }

  setSaveLoading('usuario', true);
  try {
    if (id) {
      await apiCall('PUT', `/admin/usuarios/${id}`, {
        nome,
        codigo_acesso: codigoRaw,   // string — backend converte via parseCodigoAcesso
        is_admin: isAdmin,
      });
      showToast('Usuário atualizado!', 'success');
    } else {
      await apiCall('POST', '/admin/usuarios', {
        nome,
        codigo_acesso: codigoRaw,   // string — backend converte via parseCodigoAcesso
        is_admin: isAdmin,
      });
      showToast('Usuário criado!', 'success');
    }
    state.usuarioModal.hide();
    loadUsuariosAdmin();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    setSaveLoading('usuario', false);
  }
}

function openToggleUsuarioModal(id, nome, ativoAtual) {
  openConfirm({
    title: ativoAtual ? 'Inativar usuário' : 'Ativar usuário',
    message: ativoAtual
      ? `Inativar "${nome}"? Poderá reativar o usuário a qualquer momento.`
      : `Ativar "${nome}"? O usuário voltará a aparecer como ativo.`,
    variant: ativoAtual ? 'warning' : 'success',
    confirmLabel: ativoAtual ? 'Inativar' : 'Ativar',
    onConfirm: async () => {
      const acao = ativoAtual ? 'inativar' : 'ativar';
      try {
        await apiCall('DELETE', `/admin/usuarios/${id}?acao=${acao}`);
        showToast(acao === 'inativar' ? 'Usuário inativado!' : 'Usuário ativado!', 'success');
        loadUsuariosAdmin();
      } catch (err) {
        showToast(err.message, 'error');
      }
    },
  });
}

function openRemoveUsuarioModal(id, nome) {
  state.removeUsuarioId = id;
  openConfirm({
    title: 'Excluir usuário',
    message: `Tem certeza que deseja excluir "${nome}"? Esta ação não pode ser desfeita.`,
    variant: 'danger',
    confirmLabel: 'Excluir',
    onConfirm: async () => {
      try {
        await apiCall('DELETE', `/admin/usuarios/${id}?acao=excluir`);
        showToast('Usuário excluído!', 'success');
        loadUsuariosAdmin();
      } catch (err) {
        showToast(err.message, 'error');
      }
    },
  });
}
