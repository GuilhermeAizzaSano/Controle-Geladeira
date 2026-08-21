// ── BOOT ─────────────────────────────────────────────────────
// Ponto de entrada carregado pelo index.html. Monta os parciais de HTML
// antes de importar e iniciar app.js — nessa ordem, porque app.js faz
// document.getElementById() para vários elementos que só existem depois
// que os parciais são injetados.

import { mountPartials, renderMountError } from './partials.js';

try {
  await mountPartials();
  const { initApp } = await import('./app.js');
  initApp();
} catch (err) {
  console.error('[boot] Falha ao montar a interface:', err);
  renderMountError(err);
}
