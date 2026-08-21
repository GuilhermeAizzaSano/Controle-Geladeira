// Estado global compartilhado entre os módulos do frontend.
export const state = {
  currentUser: null,
  selectedProduct: null,

  zerarUserId: null,
  zerarAllUsers: false,
  detailUserId: null,
  detailUserNome: null,

  removeProdutoId: null,
  removeUsuarioId: null,
  removeConsumoId: null,
  restoreConsumoId: null,

  allProducts: [],
  productsById: new Map(),

  buyModal: null,
  zerarModal: null,
  detailModal: null,
  produtoModal: null,
  usuarioModal: null,
  removeConsumoModal: null,
  ocultosModal: null,
  restoreConsumoModal: null,

  pagState: {
    history: { page: 1, limit: 10, total: 0, totalPages: 1 },
    detail: { page: 1, limit: 20, total: 0, totalPages: 1 },
    ocultos: { page: 1, limit: 20, total: 0, totalPages: 1 },
  },
};

// Alguns módulos (admin.js, produtos.js, usuarios.js) mantêm dados em cache
// como variável privada do módulo (ex: allAdminReport), não dentro de `state`
// — encapsulamento deliberado, esses dados não são consumidos fora do módulo
// dono. Para que resetState() ainda consiga limpá-los no logout sem que
// state.js precise conhecer o interior de cada módulo, cada um registra seu
// próprio callback de limpeza aqui.
const resetHooks = [];

/** Registra um callback a ser chamado sempre que resetState() rodar. */
export function registerResetHook(fn) {
  resetHooks.push(fn);
}

/**
 * Resets all shared state to initial values.
 * Called by logout() and on session expiry.
 */
export function resetState() {
  state.currentUser = null;
  state.selectedProduct = null;
  state.zerarUserId = null;
  state.zerarAllUsers = false;
  state.detailUserId = null;
  state.detailUserNome = null;
  state.removeProdutoId = null;
  state.removeUsuarioId = null;
  state.removeConsumoId = null;
  state.restoreConsumoId = null;
  // Favoritos são por usuário — não podem sobreviver a uma troca de login.
  state.allProducts = [];
  state.productsById = new Map();
  state.pagState.history = { page: 1, limit: 10, total: 0, totalPages: 1 };
  state.pagState.detail = { page: 1, limit: 20, total: 0, totalPages: 1 };
  state.pagState.ocultos = { page: 1, limit: 20, total: 0, totalPages: 1 };

  for (const hook of resetHooks) {
    try {
      hook();
    } catch (err) {
      console.error('[state] reset hook falhou:', err);
    }
  }
}
