import clerk from '@clerk/astro';
import node from '@astrojs/node';
import { defineConfig } from 'astro/config';

export default defineConfig({
  adapter: node({ mode: 'standalone' }),
  integrations: [clerk()],
  output: 'server',
  site: 'https://leonsites.org',
  build: {
    assets: 'admin-assets',
  },
});
