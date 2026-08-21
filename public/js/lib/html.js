// Tagged template com escape automático de HTML.
//
// Toda interpolação é escapada por padrão — impossível esquecer um escapeHtml().
// Para injetar markup já confiável (ex: saída de icon(), ou de outro html``
// aninhado), use raw(...) ou passe o resultado de outro html`` diretamente:
// ambos carregam { __raw } e não são escapados de novo.
//
// Uso:
//   el.innerHTML = html`<div>${nomeDoUsuario}</div>`.__raw;

export function raw(value) {
  return { __raw: String(value) };
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stringifyValue(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(stringifyValue).join('');
  if (typeof value === 'object' && '__raw' in value) return value.__raw;
  return escapeHtml(value);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) {
    out += stringifyValue(values[i]) + strings[i + 1];
  }
  return raw(out);
}
