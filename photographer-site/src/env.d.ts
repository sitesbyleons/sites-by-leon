/// <reference types="astro/client" />

import type { SiteContext } from './lib/site-context';

declare global {
  interface ImportMetaEnv {
    readonly PUBLIC_CLERK_PUBLISHABLE_KEY?: string;
    readonly CLERK_SECRET_KEY?: string;
    readonly DATABASE_URL?: string;
    readonly UPLOAD_ROOT?: string;
    readonly MEDIA_STORAGE_BACKEND?: 'local' | 's3';
    readonly S3_ENDPOINT?: string;
    readonly S3_REGION?: string;
    readonly S3_BUCKET?: string;
    readonly S3_ACCESS_KEY_ID?: string;
    readonly S3_SECRET_ACCESS_KEY?: string;
    readonly S3_FORCE_PATH_STYLE?: 'true' | 'false';
    readonly S3_KEY_PREFIX?: string;
    readonly PUBLIC_MEDIA_URL?: string;
    readonly SITE_WORKSPACE_SLUG?: string;
    readonly SITE_CONTENT_MODE?: 'managed' | 'demo' | 'preview';
    readonly SITE_KEY?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }

  namespace App {
    interface Locals {
      siteContext: SiteContext;
      ishotyouuInternal?: boolean;
    }
  }
}

export {};
