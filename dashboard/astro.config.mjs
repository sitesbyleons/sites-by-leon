import clerk from '@clerk/astro';
import vercel from '@astrojs/vercel';
import { defineConfig } from 'astro/config';

export default defineConfig({
  adapter: vercel(),
  integrations: [clerk()],
  output: 'server',
  site: 'https://leonsites.org',
  build: {
    assets: 'admin-assets',
  },
});
