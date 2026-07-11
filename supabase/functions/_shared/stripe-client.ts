import Stripe from 'npm:stripe@22.3.1';

export function createStripe() {
  const secretKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!secretKey) return null;

  return new Stripe(secretKey, {
    httpClient: Stripe.createFetchHttpClient(),
  });
}

export function createConnectStripe() {
  const secretKey = Deno.env.get('STRIPE_CONNECT_SECRET_KEY');
  if (!secretKey) return null;
  return new Stripe(secretKey, { httpClient: Stripe.createFetchHttpClient() });
}

export const stripeCryptoProvider = Stripe.createSubtleCryptoProvider();
export type { Stripe };
