/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_CLERK_PUBLISHABLE_KEY?: string;
  readonly CLERK_SECRET_KEY?: string;
  readonly PUBLIC_SUPABASE_URL?: string;
  readonly PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly PUBLIC_MARKETING_SITE_URL?: string;
  readonly PUBLIC_CHECKOUT_FUNCTION_URL?: string;
  readonly PUBLIC_PORTAL_FUNCTION_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
