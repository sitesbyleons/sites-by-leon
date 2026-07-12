/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_CLERK_PUBLISHABLE_KEY?: string;
  readonly CLERK_SECRET_KEY?: string;
  readonly DATABASE_URL?: string;
  readonly PUBLIC_MARKETING_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
