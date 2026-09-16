(function () {
  'use strict';

  const cards = Array.from(document.querySelectorAll('[data-cps-modal]'));
  const dialogs = Array.from(document.querySelectorAll('.cps-tournament-dialog'));

  function openDialog(id) {
    const dialog = document.getElementById(id);
    if (!dialog || typeof dialog.showModal !== 'function') return;
    dialog.showModal();
    document.body.classList.add('cps-dialog-open');
    const close = dialog.querySelector('[data-cps-close]');
    requestAnimationFrame(() => close?.focus());
  }

  function closeDialog(dialog) {
    if (!dialog?.open) return;
    dialog.close();
  }

  cards.forEach(card => {
    card.addEventListener('click', event => {
      if (event.target.closest('[data-lightbox], a, button')) return;
      openDialog(card.dataset.cpsModal);
    });

    card.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (event.target.closest('[data-lightbox], a, button')) return;
      event.preventDefault();
      openDialog(card.dataset.cpsModal);
    });
  });

  dialogs.forEach(dialog => {
    dialog.querySelectorAll('[data-cps-close]').forEach(button => {
      button.addEventListener('click', () => closeDialog(dialog));
    });

    dialog.addEventListener('click', event => {
      if (event.target === dialog) closeDialog(dialog);
    });

    dialog.addEventListener('close', () => {
      if (!dialogs.some(item => item.open)) document.body.classList.remove('cps-dialog-open');
    });
  });
})();
