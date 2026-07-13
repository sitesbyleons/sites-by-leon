import clerk from '@clerk/astro';
import node from '@astrojs/node';
import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  adapter: node({ mode: 'standalone' }),
  integrations: [clerk()],
  output: 'server',
  security: {
    // Public HTTPS terminates before the private HTTP app hop. Browser-facing
    // write routes enforce the shared proxy-aware origin check themselves.
    checkOrigin: false,
  },
  site: 'https://demo.leonsites.org',
  vite: {
    server: {
      fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] },
    },
  },
});
