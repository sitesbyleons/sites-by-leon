import clerk from '@clerk/astro';
import node from '@astrojs/node';
import react from '@astrojs/react';
import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  adapter: node({ mode: 'standalone' }),
  integrations: [clerk(), react()],
  output: 'server',
  security: {
    // Public HTTPS terminates before the private HTTP app hop. Browser-facing
    // write routes enforce the shared proxy-aware origin check themselves.
    checkOrigin: false,
    csp: {
      directives: [
        // Astro does not yet expose style-src-elem/style-src-attr as standalone
        // entries. Keep these fixed CSP3 directives in one validated entry.
        "default-src 'self'; style-src-elem 'self' 'unsafe-inline'; style-src-attr 'unsafe-inline'",
        "base-uri 'self'",
        "form-action 'self' mailto: https://accounts.google.com",
        "object-src 'none'",
        "font-src 'self' data:",
        "img-src 'self' data: blob: https://api.leonsites.org https://*.clerk.com https://img.clerk.com https://lh3.googleusercontent.com",
        "connect-src 'self' https://api.leonsites.org https://*.clerk.accounts.dev https://*.clerk.com https://clerk.leonsites.org https://clerk-telemetry.com https://*.clerk-telemetry.com https://cloudflareinsights.com",
        "frame-src 'self' https://*.clerk.accounts.dev https://*.clerk.com https://accounts.leonsites.org https://challenges.cloudflare.com",
        "worker-src 'self' blob:",
      ],
      scriptDirective: {
        resources: [
          "'self'",
          'https://*.clerk.accounts.dev',
          'https://*.clerk.com',
          'https://clerk.leonsites.org',
          'https://challenges.cloudflare.com',
          'https://static.cloudflareinsights.com',
        ],
        strictDynamic: false,
      },
      styleDirective: {
        resources: ["'self'", "'unsafe-inline'"],
      },
    },
  },
  vite: {
    server: {
      fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] },
    },
  },
});
