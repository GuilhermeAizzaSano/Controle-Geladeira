// ── ALTERAR SENHA ADMIN ──────────────────────────────────────

import { apiCall } from './api.js';
import { showToast } from './utils.js';

let alterarSenhaAdminModal;

export function initAlterarSenhaAdminModal() {
  const el = document.getElementById('alterarSenhaAdminModal');
  if (!el) return;
  alterarSenhaAdminModal = new bootstrap.Modal(el);

  document.getElementById('btn-save-alterar-senha-admin')
    ?.addEventListener('click', submitAlterarSenhaAdmin);

  el.addEventListener('show.bs.modal', () => {
    document.getElementById('senha-admin-atual').value     = '';
    document.getElementById('senha-admin-nova').value      = '';
    document.getElementById('senha-admin-confirmar').value = '';
    document.getElementById('alterar-senha-admin-error').classList.add('d-none');
    setAlterarSenhaAdminLoading(false);
  });

  el.addEventListener('shown.bs.modal', () => {
    document.getElementById('senha-admin-atual').focus();
  });

  ['senha-admin-atual', 'senha-admin-nova', 'senha-admin-confirmar'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') submitAlterarSenhaAdmin();
    });
  });
}

export function openAlterarSenhaAdminModal() {
  alterarSenhaAdminModal?.show();
}

export function hideAlterarSenhaAdminModal() {
  try { alterarSenhaAdminModal?.hide(); } catch (_) { }
}

function setAlterarSenhaAdminLoading(on) {
  const btnText   = document.getElementById('alterar-senha-admin-btn-text');
  const btnLoader = document.getElementById('alterar-senha-admin-loader');
  const btn       = document.getElementById('btn-save-alterar-senha-admin');

  if (on) {
    btnText?.classList.add('d-none');
    btnLoader?.classList.remove('d-none');
    if (btn) btn.disabled = true;
  } else {
    btnText?.classList.remove('d-none');
    btnLoader?.classList.add('d-none');
    if (btn) btn.disabled = false;
  }
}

async function submitAlterarSenhaAdmin() {
  const errEl     = document.getElementById('alterar-senha-admin-error');
  const atual     = document.getElementById('senha-admin-atual').value;
  const nova      = document.getElementById('senha-admin-nova').value;
  const confirmar = document.getElementById('senha-admin-confirmar').value;

  const showErr = msg => {
    errEl.textContent = '✗ ' + msg;
    errEl.classList.remove('d-none');
  };

  if (!atual)             return showErr('Senha atual é obrigatória.');
  if (!nova)              return showErr('Nova senha é obrigatória.');
  if (nova.length < 6)    return showErr('Nova senha deve ter pelo menos 6 caracteres.');
  if (nova !== confirmar) return showErr('Nova senha e confirmação não coincidem.');

  errEl.classList.add('d-none');
  setAlterarSenhaAdminLoading(true);

  try {
    await apiCall('PUT', '/admin/senha', { senha_atual: atual, senha_nova: nova });
    alterarSenhaAdminModal.hide();
    showToast('Senha de administrador alterada com sucesso!', 'success');
  } catch (err) {
    showErr(err.message);
  } finally {
    setAlterarSenhaAdminLoading(false);
  }
}
