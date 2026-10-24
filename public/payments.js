// public/payments.js
// Front‑end helper for AbacatePay integration

// Returns a promise that resolves with the list of gem packages
export const getPackages = async () => {
  const res = await fetch('/api/payments/packages', { credentials: 'same-origin' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to load gem packages');
  }
  return await res.json();
};

// Creates a checkout for the given packageId and returns the checkout URL
export const createCheckout = async (packageId) => {
  const res = await fetch('/api/payments/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ packageId })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to create checkout');
  }
  return await res.json(); // { checkoutUrl }
};
