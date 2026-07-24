import { defineConfig } from 'astro/config';

export default defineConfig({
  markdown: { syntaxHighlight: 'prism' },
  output: 'static',
  security: {
    csp: {
      directives: [
        // Astro does not yet expose style-src-elem/style-src-attr as standalone
        // entries. Keep these fixed CSP3 directives in one validated entry.
        "default-src 'self'; style-src-elem 'self' 'unsafe-inline'; style-src-attr 'unsafe-inline'",
        "base-uri 'self'",
        "form-action 'self' mailto:",
        "object-src 'none'",
        "font-src 'self' data:",
        "img-src 'self' data: blob:",
        "connect-src 'self' https://cloudflareinsights.com",
        "frame-src 'self' https://challenges.cloudflare.com",
        "worker-src 'self' blob:",
      ],
      scriptDirective: {
        resources: [
          "'self'",
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
  site: 'https://leonsites.org',
});
