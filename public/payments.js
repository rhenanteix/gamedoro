// Use the same authenticated API client as the rest of the application.
export const getPackages = api => api('/payments/packages');
export const createCheckout = (api, packageId) => api('/payments/create', { method: 'POST', body: { packageId } });
export const getPayment = (api, reference) => api('/payments/' + encodeURIComponent(reference));
