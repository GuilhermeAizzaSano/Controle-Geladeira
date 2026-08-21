function parseBoolean(value, defaultValue = false) {
  if (value === undefined) return defaultValue;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return Boolean(value);
}

function parseCodigoAcesso(value) {
  const str = String(value ?? '').trim();
  if (!/^\d{6}$/.test(str)) return null;
  return Number.parseInt(str, 10);
}

function parsePositiveInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

// Teto de unidades por compra. Protege contra erro de digitação: sem limite,
// um "9999" acidental inflaria a conta e criaria milhares de linhas em consumo.
const MAX_QUANTIDADE = 20;

/**
 * Valida a quantidade de unidades de uma compra.
 *
 * Ausente vira 1, mantendo compatibilidade com clientes que não enviam o campo.
 * Só aceita dígitos: `parsePositiveInt` não serve aqui porque `parseInt('2.5')`
 * devolve 2, aceitando decimal em silêncio.
 *
 * @returns {number|null} a quantidade, ou null se inválida
 */
function parseQuantidade(value, max = MAX_QUANTIDADE) {
  if (value === undefined || value === null || value === '') return 1;
  const str = String(value).trim();
  if (!/^\d+$/.test(str)) return null;
  const parsed = Number.parseInt(str, 10);
  if (parsed < 1 || parsed > max) return null;
  return parsed;
}

function parseNonNegativeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parsePagination(query, defaultLimit = 10, maxLimit = 100) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, offset: (page - 1) * limit };
}

module.exports = {
  parseBoolean,
  parseCodigoAcesso,
  parsePositiveInt,
  parseNonNegativeNumber,
  parsePagination,
  parseQuantidade,
  MAX_QUANTIDADE,
};
