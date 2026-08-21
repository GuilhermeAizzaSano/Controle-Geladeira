// Normalização de texto de busca — extraída de admin.js/produtos.js/usuarios.js
// (as três cópias eram idênticas). Pura, sem DOM: importável no browser e no Node.
// Nota: a classe de caracteres abaixo cobre o intervalo Unicode U+0300–U+036F
// (marcas diacríticas combinantes), o mesmo intervalo usado nos módulos originais.

export function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}
