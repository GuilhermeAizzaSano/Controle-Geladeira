// ── API ──────────────────────────────────────────────────────
// Session token is now an HttpOnly cookie — no JS access needed.
// CSRF token is in the `csrf` cookie (readable by JS) and sent as a header.

const API_BASE = '';
const API_TIMEOUT_MS = 15_000;

/**
 * Reads the `csrf` cookie value set by the server after login.
 * @returns {string|null}
 */
function getCsrfToken() {
  const match = document.cookie.split(';')
    .map(c => c.trim())
    .find(c => c.startsWith('csrf='));
  if (!match) return null;
  return decodeURIComponent(match.slice('csrf='.length));
}

/**
 * Realiza uma chamada à API com autenticação automática por cookie e timeout.
 *
 * @param {'GET'|'POST'|'PUT'|'DELETE'} method
 * @param {string} endpoint
 * @param {object|null} body
 * @param {{ skipSessionExpiredHandling?: boolean }} [opts] Quando true, um 401 desta
 *   chamada não dispara o evento `session-expired` — usado em endpoints onde 401
 *   é uma resposta esperada (login com código errado), não uma sessão que caiu.
 * @returns {Promise<any>}
 * @throws {Error} Mensagem de erro extraída do JSON ou mensagem padrão
 */
export async function apiCall(method, endpoint, body = null, callOpts = {}) {
  const { skipSessionExpiredHandling = false } = callOpts;
  const headers = { 'Content-Type': 'application/json' };

  if (method !== 'GET') {
    const csrf = getCsrfToken();
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  const opts = {
    method,
    headers,
    credentials: 'same-origin',
    signal: controller.signal,
  };
  if (body) opts.body = JSON.stringify(body);

  try {
    const res = await fetch(API_BASE + endpoint, opts);

    let data = null;
    try { data = await res.json(); } catch { data = null; }

    if (!res.ok) {
      if (res.status === 401 && !skipSessionExpiredHandling && !window._sessionExpired) {
        window._sessionExpired = true;
        document.dispatchEvent(new CustomEvent('session-expired'));
      }
      const err = new Error(data?.error || 'Erro na requisição');
      err.status = res.status;
      throw err;
    }
    return data;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('A requisição demorou muito. Tente novamente.');
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}