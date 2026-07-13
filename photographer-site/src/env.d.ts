/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_CLERK_PUBLISHABLE_KEY?: string;
  readonly CLERK_SECRET_KEY?: string;
  readonly DATABASE_URL?: string;
  readonly UPLOAD_ROOT?: string;
  readonly PUBLIC_MEDIA_URL?: string;
  readonly SITE_WORKSPACE_SLUG?: string;
  readonly SITE_CONTENT_MODE?: 'managed' | 'demo' | 'preview';
  readonly SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
