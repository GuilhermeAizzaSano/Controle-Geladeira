// ── CONFIRM MODAL ────────────────────────────────────────────
// Single reusable confirm dialog.
// Requires in index.html: #confirmModal, #confirm-title, #confirm-message, #btn-confirm-action

import { setBtnLoading } from './utils.js';

let _confirmModal = null;

function _getConfirmModal() {
  if (!_confirmModal) {
    _confirmModal = bootstrap.Modal.getOrCreateInstance(
      document.getElementById('confirmModal')
    );
  }
  return _confirmModal;
}

/**
 * Opens the shared confirm modal.
 *
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} opts.message
 * @param {'danger'|'warning'|'success'} [opts.variant='danger']
 * @param {string} [opts.confirmLabel='Confirmar']
 * @param {Function} opts.onConfirm  async function called when user confirms
 */
export function openConfirm({ title, message, variant = 'danger', confirmLabel = 'Confirmar', onConfirm }) {
  const modalEl = document.getElementById('confirmModal');
  const titleEl = document.getElementById('confirm-title');
  const msgEl   = document.getElementById('confirm-message');
  const btn     = document.getElementById('btn-confirm-action');

  // Reset variant classes before applying new one
  modalEl.classList.remove('confirm-modal--danger', 'confirm-modal--warning', 'confirm-modal--success');
  modalEl.classList.add(`confirm-modal--${variant}`);

  titleEl.textContent = title;
  msgEl.textContent   = message;
  btn.textContent     = confirmLabel;

  // Remove previous listener by replacing the node
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);

  newBtn.addEventListener('click', async () => {
    setBtnLoading(newBtn, true, '...');
    try {
      await onConfirm();
    } finally {
      setBtnLoading(newBtn, false);
      _getConfirmModal().hide();
    }
  });

  _getConfirmModal().show();
}
