// ── NAVEGAÇÃO ────────────────────────────────────────────────

import './modal-stack.js';
import { apiCall } from './api.js';
import {
  onAdminTheadClick, filterAdminReport, loadAdmin, startAdminAutoRefresh, stopAdminAutoRefresh,
  onAdminBodyClick, onDetailBodyClick, openZerarTodosModal, openZerarFromDetail, confirmZerar,
  confirmRemoveConsumo, openOcultosModal, onOcultosBodyClick, confirmRestoreConsumo,
} from './admin.js';
import { initAlterarCodigoModal, openAlterarCodigoModal, hideAlterarCodigoModal } from './alterar-codigo.js';
import { initAlterarSenhaAdminModal, openAlterarSenhaAdminModal, hideAlterarSenhaAdminModal } from './alterar-senha-admin.js';
import {
  filterProducts, loadProducts, onProductGridClick, loadHistory,
  getBuyQty, setBuyQty, stepBuyQty, onBuyQtyInput, confirmBuy,
} from './shop.js';
import { filterProdutosAdmin, loadProdutosAdmin, onProdutosBodyClick, openProdutoModal, saveProduto } from './produtos.js';
import { filterUsuariosAdmin, loadUsuariosAdmin, onUsuariosBodyClick, openUsuarioModal, saveUsuario } from './usuarios.js';
import { state, resetState } from './state.js';
import { showToast, debounce } from './utils.js';
import { applyNavVisibility, applyScreen } from './lib/view-state.js';

let adminChallenge = null;

function resetLoginUI() {
  adminChallenge = null;
  const codeInput = document.getElementById('login-code');
  if (codeInput) {
    codeInput.removeAttribute('readonly');
    codeInput.value = '';
  }
  document.getElementById('login-code-wrap')?.classList.remove('d-none');
  document.getElementById('login-admin-wrap')?.classList.add('d-none');
  const pwInput = document.getElementById('login-admin-password');
  if (pwInput) pwInput.value = '';
  const hint = document.getElementById('login-hint');
  if (hint) hint.textContent = 'Digite seu código de acesso';
  const btnText = document.getElementById('login-btn-text');
  if (btnText) btnText.textContent = 'ENTRAR →';
  const steps = document.getElementById('login-steps');
  if (steps) steps.style.display = 'none';
}

function _applyPostLoginUI() {
  const navUser = document.getElementById('nav-user');
  navUser.textContent = state.currentUser.nome;
  navUser.classList.remove('d-none');
  document.getElementById('app-nav').classList.remove('d-none');

  applyNavVisibility(state.currentUser);
  showTab(state.currentUser.is_admin ? 'admin' : 'shop');
}

function showTab(tab) {
  applyScreen(tab);

  // Para o auto-refresh ao sair da aba de controle
  if (tab !== 'admin') stopAdminAutoRefresh();

  if (tab === 'shop') { loadProducts(); loadHistory(1); }
  if (tab === 'admin') { loadAdmin(); startAdminAutoRefresh(); }
  if (tab === 'produtos') { loadProdutosAdmin(); }
  if (tab === 'usuarios') { loadUsuariosAdmin(); }
}

// ── SESSÃO EXPIRADA ──────────────────────────────────────────
// Disparado por apiCall() quando o servidor retorna 401.
// Exibe aviso e redireciona para o login após 1,5s.
document.addEventListener('session-expired', () => {
  showToast('Sessão expirada. Redirecionando para o login...', 'error');
  setTimeout(() => logout(), 1500);
});

// ── RATE LIMIT COUNTDOWN ─────────────────────────────────────
// Desabilita o botão de login por 60s após receber 429 do servidor.

/**
 * Disables `btn` for `seconds` seconds, updating `errorEl` with a countdown.
 * The messageTemplate must contain `{s}` which is replaced with seconds remaining.
 *
 * @param {HTMLElement} btn
 * @param {HTMLElement} errorEl
 * @param {number} seconds
 * @param {string} [messageTemplate]
 */
function startCountdown(btn, errorEl, seconds, messageTemplate = 'Aguarde {s} segundos.') {
  let remaining = seconds;
  btn.disabled = true;
  errorEl.textContent = messageTemplate.replace('{s}', remaining);
  errorEl.classList.remove('d-none');

  const iv = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(iv);
      btn.disabled = false;
      errorEl.classList.add('d-none');
      return;
    }
    errorEl.textContent = messageTemplate.replace('{s}', remaining);
  }, 1000);
}

function startRateLimitCountdown() {
  startCountdown(
    document.getElementById('login-btn'),
    document.getElementById('login-error'),
    60,
    '✗ Muitas tentativas. Aguarde {s} segundos.'
  );
}

// ── LOGIN ────────────────────────────────────────────────────

async function doLogin() {
  const errEl = document.getElementById('login-error');

  if (adminChallenge) {
    const senha = document.getElementById('login-admin-password').value;
    if (!senha) {
      errEl.textContent = '✗ Informe a senha de administrador.';
      errEl.classList.remove('d-none');
      return;
    }

    document.getElementById('login-btn-text').classList.add('d-none');
    document.getElementById('login-loader').classList.remove('d-none');
    errEl.classList.add('d-none');

    try {
      const data = await apiCall('POST', '/login/admin', { challenge: adminChallenge, senha }, { skipSessionExpiredHandling: true });
      window._sessionExpired = false;
      state.currentUser = data.usuario;
      resetLoginUI();
      _applyPostLoginUI();
    } catch (err) {
      if (err.status === 429) {
        startRateLimitCountdown();
      } else {
        errEl.textContent = '✗ ' + err.message;
        errEl.classList.remove('d-none');
        document.getElementById('login-admin-password').value = '';
        document.getElementById('login-admin-password').focus();
      }
    } finally {
      document.getElementById('login-btn-text').classList.remove('d-none');
      document.getElementById('login-loader').classList.add('d-none');
    }
    return;
  }

  const code = document.getElementById('login-code').value.trim();
  if (!/^\d{6}$/.test(code)) {
    errEl.textContent = '✗ Informe um código de 6 dígitos.';
    errEl.classList.remove('d-none');
    document.getElementById('login-code').select();
    return;
  }

  document.getElementById('login-btn-text').classList.add('d-none');
  document.getElementById('login-loader').classList.remove('d-none');
  errEl.classList.add('d-none');

  try {
    const data = await apiCall('POST', '/login', { codigo_acesso: code }, { skipSessionExpiredHandling: true });

    if (data.requiresAdminPassword) {
      adminChallenge = data.challenge;
      document.getElementById('login-code-wrap')?.classList.add('d-none');
      document.getElementById('login-admin-wrap').classList.remove('d-none');
      document.getElementById('login-admin-password').focus();
      document.getElementById('login-hint').textContent = 'segunda verificação';
      document.getElementById('login-btn-text').textContent = 'CONFIRMAR →';
      const steps = document.getElementById('login-steps');
      if (steps) steps.style.display = 'flex';
      return;
    }

    window._sessionExpired = false;
    state.currentUser = data.usuario;
    _applyPostLoginUI();
  } catch (err) {
    if (err.status === 429) {
      startRateLimitCountdown();
    } else {
      errEl.textContent = '✗ ' + err.message;
      errEl.classList.remove('d-none');
      document.getElementById('login-code').select();
    }
  } finally {
    document.getElementById('login-btn-text').classList.remove('d-none');
    document.getElementById('login-loader').classList.add('d-none');
  }
}

// ── LOGOUT ───────────────────────────────────────────────────

function logout() {
  [
    state.buyModal, state.zerarModal, state.detailModal, state.produtoModal,
    state.usuarioModal, state.removeConsumoModal,
    state.ocultosModal, state.restoreConsumoModal,
  ].forEach(m => {
    try { m?.hide(); } catch (_) { }
  });

  hideAlterarCodigoModal();
  hideAlterarSenhaAdminModal();

  // Para o auto-refresh antes de limpar o estado
  stopAdminAutoRefresh();

  apiCall('POST', '/logout').catch(() => {});

  resetState();
  window._sessionExpired = false;

  document.getElementById('app-nav').classList.add('d-none');
  document.getElementById('nav-user').classList.add('d-none');
  applyNavVisibility(null);

  // Limpa campos de busca
  const shopSearch = document.getElementById('shop-search');
  if (shopSearch) shopSearch.value = '';

  const adminSearch = document.getElementById('admin-search');
  if (adminSearch) adminSearch.value = '';

  const produtosSearch = document.getElementById('produtos-search');
  if (produtosSearch) produtosSearch.value = '';

  const usuariosSearch = document.getElementById('usuarios-search');
  if (usuariosSearch) usuariosSearch.value = '';

  // Esconde a barra de resumo do admin — evita dados obsoletos visíveis na próxima sessão.
  // O conteúdo é recomputado do zero na próxima vez que loadAdmin() rodar.
  document.getElementById('admin-summary-bar')?.classList.add('d-none');

  resetLoginUI();
  document.getElementById('login-code').value = '';
  document.getElementById('login-error').classList.add('d-none');
  applyScreen('login');
  setTimeout(() => document.getElementById('login-code').focus(), 100);
}

// ── INIT ─────────────────────────────────────────────────────

/**
 * Called at page load. Checks if a valid session cookie exists via GET /me.
 * Restores the UI if session is valid; shows login screen if not.
 */
async function initSession() {
  try {
    const data = await apiCall('GET', '/me', null, { skipSessionExpiredHandling: true });
    state.currentUser = data.usuario;
    window._sessionExpired = false;
    _applyPostLoginUI();
  } catch (err) {
    applyScreen('login');
  }
}

/**
 * Liga toda a UI aos elementos do DOM e inicia a sessão.
 * Chamado por boot.js depois que mountPartials() injeta o HTML dos parciais
 * — não pode mais depender de DOMContentLoaded, que já terá disparado.
 */
export function initApp() {
  state.buyModal = new bootstrap.Modal(document.getElementById('buyModal'));
  state.zerarModal = new bootstrap.Modal(document.getElementById('zerarModal'));
  state.detailModal = new bootstrap.Modal(document.getElementById('detailModal'));
  state.produtoModal = new bootstrap.Modal(document.getElementById('produtoModal'));
  state.usuarioModal = new bootstrap.Modal(document.getElementById('usuarioModal'));
  state.removeConsumoModal = new bootstrap.Modal(document.getElementById('removeConsumoModal'));
  state.ocultosModal = new bootstrap.Modal(document.getElementById('ocultosModal'));
  state.restoreConsumoModal = new bootstrap.Modal(document.getElementById('restoreConsumoModal'));

  // ── Botão de refresh da loja ──────────────────────────────────────────────
  document.getElementById('btn-refresh-shop')?.addEventListener('click', () => {
    loadProducts();
    loadHistory(1);
  });
  
  initAlterarCodigoModal();
  initAlterarSenhaAdminModal();

  // ── Delegação de sort no cabeçalho da tabela de controle ──────────────────
  // Usa delegação no <thead> para funcionar mesmo após re-render do innerHTML
  document.querySelector('#screen-admin .admin-table thead')
    ?.addEventListener('click', onAdminTheadClick);

  document.querySelector('#screen-admin .admin-table thead')
    ?.addEventListener('keydown', e => {
      const th = e.target.closest('th[data-sort]');
      if (th && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        th.click();
      }
    });

  // ── Enter no campo de login ───────────────────────────────────────────────
  document.getElementById('login-code').addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });

  document.getElementById('login-admin-password')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });

  // ── Botão de login ────────────────────────────────────────────────────────
  document.getElementById('login-btn')?.addEventListener('click', e => {
    e.preventDefault();
    doLogin();
  });

  // ── Delegation: tabs, alterar código e logout na navbar ───────────────────
  document.getElementById('app-nav')?.addEventListener('click', e => {
    const tabLink = e.target.closest('[data-action="tab"]');
    if (tabLink) {
      e.preventDefault();
      const tab = tabLink.dataset.tab;
      if (tab) showTab(tab);
      return;
    }

    const alterarLink = e.target.closest('[data-action="alterar-codigo"]');
    if (alterarLink) {
      e.preventDefault();
      openAlterarCodigoModal();
      return;
    }

    const alterarSenhaAdminLink = e.target.closest('[data-action="alterar-senha-admin"]');
    if (alterarSenhaAdminLink) {
      e.preventDefault();
      openAlterarSenhaAdminModal();
      return;
    }

    const logoutBtn = e.target.closest('[data-action="logout"]');
    if (logoutBtn) {
      e.preventDefault();
      logout();
    }
  });

  // ── Seletor de quantidade do modal de compra ──────────────────────────────
  document.getElementById('btn-qty-minus')?.addEventListener('click', e => stepBuyQty(-1, e.currentTarget));
  document.getElementById('btn-qty-plus')?.addEventListener('click', e => stepBuyQty(1, e.currentTarget));
  document.getElementById('buy-qty')?.addEventListener('input', onBuyQtyInput);
  // Campo vazio ou inválido volta para 1 ao perder o foco.
  document.getElementById('buy-qty')?.addEventListener('blur', () => setBuyQty(getBuyQty()));
  document.getElementById('buy-qty')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      confirmBuy();
    }
  });

  // ── Confirmações de modais ────────────────────────────────────────────────
  document.getElementById('btn-confirm-buy')?.addEventListener('click', confirmBuy);
  document.getElementById('btn-confirm-zerar')?.addEventListener('click', confirmZerar);
  document.getElementById('btn-confirm-remove-consumo')?.addEventListener('click', confirmRemoveConsumo);
  document.getElementById('btn-confirm-restore-consumo')?.addEventListener('click', confirmRestoreConsumo);
  document.getElementById('btn-save-produto')?.addEventListener('click', saveProduto);
  document.getElementById('btn-save-usuario')?.addEventListener('click', saveUsuario);

  // ── Botões do modal de detalhes ───────────────────────────────────────────
  document.getElementById('detail-btn-zerar')?.addEventListener('click', openZerarFromDetail);
  document.getElementById('detail-btn-ocultos')?.addEventListener('click', openOcultosModal);

  // ── Botões de cabeçalho das seções admin ──────────────────────────────────
  document.getElementById('btn-refresh-admin')?.addEventListener('click', loadAdmin);
  document.getElementById('btn-zerar-todos')?.addEventListener('click', openZerarTodosModal);
  document.getElementById('btn-new-produto')?.addEventListener('click', () => openProdutoModal());
  document.getElementById('btn-new-usuario')?.addEventListener('click', () => openUsuarioModal());

  // ── Buscas com debounce de 150ms ──────────────────────────────────────────
  // Debounce reduz o número de operações de filtragem durante digitação contínua.
  // filterProducts/filterAdminReport/etc. já usam campos pré-normalizados, então
  // o overhead por chamada é mínimo — o debounce evita renders desnecessários de DOM.
  document.getElementById('shop-search')
    ?.addEventListener('input', debounce(filterProducts, 150));

  document.getElementById('admin-search')
    ?.addEventListener('input', debounce(filterAdminReport, 150));

  document.getElementById('produtos-search')
    ?.addEventListener('input', debounce(filterProdutosAdmin, 150));

  document.getElementById('usuarios-search')
    ?.addEventListener('input', debounce(filterUsuariosAdmin, 150));

  // ── Delegation: cliques nas grades e tabelas ──────────────────────────────
  document.getElementById('product-grid')?.addEventListener('click', onProductGridClick);
  document.getElementById('product-grid-fav')?.addEventListener('click', onProductGridClick);
  document.getElementById('admin-body')?.addEventListener('click', onAdminBodyClick);
  document.getElementById('admin-body')?.addEventListener('keydown', e => {
    const tr = e.target.closest('tr[data-action="open-detail"]');
    if (tr && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      tr.click();
    }
  });
  document.getElementById('detail-body')?.addEventListener('click', onDetailBodyClick);
  document.getElementById('ocultos-body')?.addEventListener('click', onOcultosBodyClick);
  document.getElementById('produtos-body')?.addEventListener('click', onProdutosBodyClick);
  document.getElementById('usuarios-body')?.addEventListener('click', onUsuariosBodyClick);

  initSession();
}
