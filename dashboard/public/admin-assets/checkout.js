document.querySelectorAll('[data-checkout-form]').forEach((form) => {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const status = form.closest('.simple-panel')?.querySelector('[data-checkout-status]');
    if (!(button instanceof HTMLButtonElement) || !(status instanceof HTMLElement)) return;

    button.disabled = true;
    status.textContent = 'Opening secure checkout...';

    try {
      const response = await fetch(form.action, {
        method: 'POST',
        headers: { accept: 'application/json' },
        body: new FormData(form),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || typeof payload?.url !== 'string') {
        throw new Error(payload?.message || 'Checkout could not open. Nothing was charged.');
      }
      const checkoutUrl = new URL(payload.url);
      if (checkoutUrl.protocol !== 'https:' || checkoutUrl.hostname !== 'checkout.stripe.com') {
        throw new Error('Checkout returned an unexpected address. Nothing was charged.');
      }
      window.location.assign(checkoutUrl.href);
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'Checkout could not open. Nothing was charged.';
      button.disabled = false;
    }
  });
});
