import clerk from '@clerk/astro';
import node from '@astrojs/node';
import { defineConfig } from 'astro/config';

export default defineConfig({
  adapter: node({ mode: 'standalone' }),
  integrations: [clerk()],
  output: 'server',
  security: {
    // Public HTTPS terminates before the private HTTP app hop. Browser-facing
    // write routes enforce the shared proxy-aware origin check themselves.
    checkOrigin: false,
  },
  site: 'https://leonsites.org',
  build: {
    assets: 'admin-assets',
  },
});
