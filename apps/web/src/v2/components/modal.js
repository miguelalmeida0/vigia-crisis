export function createModal(dialog, card) {
  let trigger = null; let onSubmit = null;
  const close = () => { if (dialog.open) dialog.close(); onSubmit = null; const restore = trigger; trigger = null; restore?.focus?.(); };
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
  dialog.addEventListener('click', (event) => { if (event.target === dialog) close(); });
  card.addEventListener('click', (event) => { if (event.target.closest('[data-modal-close]')) { event.preventDefault(); close(); } });
  card.addEventListener('submit', async (event) => { event.preventDefault(); if (!onSubmit) return; const submit = card.querySelector('[type="submit"]'); submit?.setAttribute('disabled', ''); try { await onSubmit(Object.fromEntries(new FormData(event.target).entries()), event.target); close(); } finally { submit?.removeAttribute('disabled'); } });
  return {
    open(html, { source, submit } = {}) { trigger = source ?? document.activeElement; onSubmit = submit ?? null; card.innerHTML = html; dialog.showModal(); setTimeout(() => card.querySelector('input,select,textarea,button')?.focus(), 20); },
    close
  };
}
