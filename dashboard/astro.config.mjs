import cloudflare from '@astrojs/cloudflare';
import clerk from '@clerk/astro';
import { defineConfig } from 'astro/config';

export default defineConfig({
  adapter: cloudflare({
    imageService: 'compile',
    prerenderEnvironment: 'node',
  }),
  integrations: [clerk()],
  output: 'server',
  site: 'https://app.sites-by-leon.pages.dev',
});
