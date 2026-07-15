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
  },
  vite: {
    server: {
      fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] },
    },
  },
});
