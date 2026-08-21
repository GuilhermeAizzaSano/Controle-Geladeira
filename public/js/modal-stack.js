// ── Correção de modais empilhados ─────────────────────────────
// O Bootstrap 5 não suporta múltiplos modais abertos ao mesmo tempo: todos
// recebem o mesmo z-index (.modal = 1055, .modal-backdrop = 1050) e, ao fechar
// um deles, o `.modal-open` do body é removido mesmo havendo outro modal ainda
// aberto — o que quebra o scroll-lock e pode deixar o backdrop preso.
//
// Este handler global resolve os dois problemas para QUALQUER modal empilhado:
//   • detalhes → ocultar item
//   • detalhes → itens ocultos → restaurar item
// Atua via eventos do Bootstrap, sem depender da API interna.
(function () {
  const MODAL_Z = 1055; // z-index padrão de .modal no Bootstrap 5.3
  const Z_STEP  = 20;

  document.addEventListener('show.bs.modal', e => {
    // Quantos modais já estão abertos ANTES deste — define o nível na pilha.
    const nivel = document.querySelectorAll('.modal.show').length;
    if (nivel === 0) return; // primeiro modal: usa o comportamento padrão do BS

    const z = MODAL_Z + nivel * Z_STEP;
    e.target.style.zIndex = z;

    // O backdrop deste modal é criado durante o show(), logo após este evento.
    // O mais novo é sempre o último nó; ajusta no próximo frame.
    requestAnimationFrame(() => {
      const backdrops = document.querySelectorAll('.modal-backdrop');
      const bd = backdrops[backdrops.length - 1];
      if (bd) bd.style.zIndex = z - 1;
    });
  });

  document.addEventListener('hidden.bs.modal', e => {
    e.target.style.zIndex = ''; // higiene: não vaza z-index entre aberturas

    const aindaAbertos = document.querySelectorAll('.modal.show').length;
    if (aindaAbertos > 0) {
      // Ao fechar este modal, o ScrollBarHelper do BS 5.3 fez `reset()` e
      // destravou o scroll do body (overflow inline) mesmo havendo outro modal
      // aberto. Reaplica o lock para o modal remanescente.
      document.body.classList.add('modal-open');
      document.body.style.overflow = 'hidden';
    } else {
      // Todos fechados: garante que o body volta ao normal (defesa contra
      // estado preso quando havia modais empilhados).
      document.body.classList.remove('modal-open');
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    }
  });
})();
