// ── ALTERAR CÓDIGO ───────────────────────────────────────────
// Arquivo: public/js/alterar-codigo.js

import { apiCall } from './api.js';
import { showToast } from './utils.js';

let alterarCodigoModal;

// Chamado por initApp() em app.js
export function initAlterarCodigoModal() {
  const el = document.getElementById('alterarCodigoModal');
  if (!el) return;
  alterarCodigoModal = new bootstrap.Modal(el);

  document.getElementById('btn-save-alterar-codigo')
    ?.addEventListener('click', submitAlterarCodigo);

  // Limpa campos e erro toda vez que o modal abre
  el.addEventListener('show.bs.modal', () => {
    document.getElementById('codigo-atual').value     = '';
    document.getElementById('codigo-novo').value      = '';
    document.getElementById('codigo-confirmar').value = '';
    document.getElementById('alterar-codigo-error').classList.add('d-none');
    setAlterarCodigoLoading(false);
  });

  // Foca no primeiro campo ao abrir
  el.addEventListener('shown.bs.modal', () => {
    document.getElementById('codigo-atual').focus();
  });

  // Enter em qualquer campo dispara o envio
  ['codigo-atual', 'codigo-novo', 'codigo-confirmar'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') submitAlterarCodigo();
    });
  });
}

export function openAlterarCodigoModal() {
  alterarCodigoModal?.show();
}

export function hideAlterarCodigoModal() {
  try { alterarCodigoModal?.hide(); } catch (_) { }
}

function setAlterarCodigoLoading(on) {
  const btnText   = document.getElementById('alterar-codigo-btn-text');
  const btnLoader = document.getElementById('alterar-codigo-loader');
  const btn       = document.getElementById('btn-save-alterar-codigo');

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

async function submitAlterarCodigo() {
  const errEl     = document.getElementById('alterar-codigo-error');
  const atual     = document.getElementById('codigo-atual').value.trim();
  const novo      = document.getElementById('codigo-novo').value.trim();
  const confirmar = document.getElementById('codigo-confirmar').value.trim();

  // ── Validações client-side ───────────────────────────────
  const showErr = msg => {
    errEl.textContent = '✗ ' + msg;
    errEl.classList.remove('d-none');
  };

  if (!/^\d{6}$/.test(atual))     return showErr('Código atual deve ter exatamente 6 dígitos.');
  if (!/^\d{6}$/.test(novo))      return showErr('Novo código deve ter exatamente 6 dígitos.');
  if (!/^\d{6}$/.test(confirmar)) return showErr('Confirmação deve ter exatamente 6 dígitos.');
  if (novo !== confirmar)          return showErr('Novo código e confirmação não coincidem.');
  if (atual === novo)              return showErr('O novo código deve ser diferente do atual.');

  errEl.classList.add('d-none');
  setAlterarCodigoLoading(true);

  try {
    await apiCall('PUT', '/alterar-codigo', {
      codigo_atual: atual,
      codigo_novo:  novo,
    });

    alterarCodigoModal.hide();
    showToast('Código alterado com sucesso!', 'success');
  } catch (err) {
    showErr(err.message);
  } finally {
    setAlterarCodigoLoading(false);
  }
}