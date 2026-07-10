import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type AccessToken = () => Promise<string | null>;

export function createClerkSupabaseClient(accessToken: AccessToken): SupabaseClient | null {
  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const publishableKey = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) return null;

  return createClient(url, publishableKey, {
    accessToken,
    auth: { persistSession: false },
  });
}
