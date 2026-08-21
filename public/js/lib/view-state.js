// Visibilidade derivada do estado — funções puras (state → o que deveria estar
// visível), separadas da aplicação no DOM. Substituem os blocos de
// classList.add/remove('d-none') que antes ficavam espalhados e reescritos em
// vários pontos de app.js/admin.js, todos calculando a mesma coisa a partir de
// state.currentUser / stats do usuário.

const ADMIN_NAV_ITEMS = ['nav-item-admin', 'nav-item-produtos', 'nav-item-usuarios', 'nav-item-alterar-senha-admin'];
const USER_NAV_ITEMS  = ['nav-item-shop', 'nav-item-alterar-codigo'];
const ADMIN_TABS      = ['admin', 'produtos', 'usuarios'];

/** @param {{is_admin: boolean}|null} currentUser */
export function computeNavVisibility(currentUser) {
  if (!currentUser) {
    return { visible: [], hidden: [...ADMIN_NAV_ITEMS, ...USER_NAV_ITEMS] };
  }
  return currentUser.is_admin
    ? { visible: ADMIN_NAV_ITEMS, hidden: USER_NAV_ITEMS }
    : { visible: USER_NAV_ITEMS, hidden: ADMIN_NAV_ITEMS };
}

/** Aplica computeNavVisibility ao DOM: toggla `d-none` nos itens da navbar. */
export function applyNavVisibility(currentUser) {
  const { visible, hidden } = computeNavVisibility(currentUser);
  visible.forEach(id => document.getElementById(id)?.classList.remove('d-none'));
  hidden.forEach(id => document.getElementById(id)?.classList.add('d-none'));
}

export function computeTabClassName(tab) {
  return 'nav bc-tabs' + (ADMIN_TABS.includes(tab) ? ' admin-mode' : '');
}

/** Ativa a tela e a aba correspondentes a `tab`, desativando as demais. */
export function applyScreen(tab) {
  const switchDOM = () => {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screen-' + tab)?.classList.add('active');

    document.querySelectorAll('.bc-tabs .nav-link').forEach(l => l.classList.remove('active'));
    const tabsEl = document.getElementById('main-tabs');
    if (tabsEl) tabsEl.className = computeTabClassName(tab);
    document.getElementById('tab-' + tab)?.classList.add('active');
  };

  if (document.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.startViewTransition(() => switchDOM());
  } else {
    switchDOM();
  }
}

function _unusedApplyScreenOriginal(tab) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + tab)?.classList.add('active');

  document.querySelectorAll('.bc-tabs .nav-link').forEach(l => l.classList.remove('active'));
  const tabsEl = document.getElementById('main-tabs');
  if (tabsEl) tabsEl.className = computeTabClassName(tab);
  document.getElementById('tab-' + tab)?.classList.add('active');
}

/** @param {number} favoritosCount */
export function isFavSectionVisible(favoritosCount) {
  return favoritosCount > 0;
}

/**
 * @param {{total_itens: number, favorito: {produto:string, freq:number}|null, total_ocultos: number}} stats
 */
export function computeDetailHeaderView(stats) {
  const { total_itens, favorito, total_ocultos } = stats;
  const ocultosCount = Number(total_ocultos) || 0;

  return {
    zerarDisabled: total_itens === 0,
    favVisible: !!favorito,
    favoritoText: favorito ? `${favorito.produto} (${favorito.freq}x)` : '',
    ocultosCount,
    ocultosDisabled: ocultosCount === 0,
  };
}

/** Aplica computeDetailHeaderView ao DOM do modal de detalhes. */
export function applyDetailHeaderView(stats) {
  const v = computeDetailHeaderView(stats);

  const zerarBtn = document.getElementById('detail-btn-zerar');
  if (zerarBtn) zerarBtn.disabled = v.zerarDisabled;

  const favWrap = document.getElementById('detail-fav-wrap');
  if (favWrap) {
    if (v.favVisible) {
      const favEl = document.getElementById('detail-fav');
      if (favEl) favEl.textContent = v.favoritoText;
      favWrap.classList.remove('d-none');
    } else {
      favWrap.classList.add('d-none');
    }
  }

  const ocultosBtn = document.getElementById('detail-btn-ocultos');
  const ocultosBadge = document.getElementById('detail-ocultos-badge');
  if (ocultosBtn) ocultosBtn.disabled = v.ocultosDisabled;
  if (ocultosBadge) {
    if (v.ocultosCount > 0) {
      ocultosBadge.textContent = v.ocultosCount;
      ocultosBadge.classList.remove('d-none');
    } else {
      ocultosBadge.classList.add('d-none');
    }
  }
}
