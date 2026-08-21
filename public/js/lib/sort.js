// Ordenação em memória por campo — extraída de admin.js (sortAdminData).
// Pura, sem DOM: importável no browser e no Node.

export function sortByField(data, field, dir) {
  return [...data].sort((a, b) => {
    let va = a[field];
    let vb = b[field];

    if (typeof va === 'string') {
      va = va.toLowerCase();
      vb = String(vb).toLowerCase();
    }

    if (va < vb) return dir === 'asc' ? -1 : 1;
    if (va > vb) return dir === 'asc' ? 1 : -1;
    return 0;
  });
}
