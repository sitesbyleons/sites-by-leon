import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const repositoryRoot = new URL('../', import.meta.url);
const postgresConsumers = [
  'package.json',
  'platform-core/package.json',
  'domain-worker/package.json',
] as const;

describe('PostgreSQL reconnect scheduling', () => {
  it('pins every workspace consumer to the reconnect-safe postgres release', async () => {
    const versions = await Promise.all(postgresConsumers.map(async (relativePath) => {
      const contents = await readFile(new URL(relativePath, repositoryRoot), 'utf8');
      const manifest = JSON.parse(contents) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      return manifest.dependencies?.postgres ?? manifest.devDependencies?.postgres;
    }));

    expect(versions).toEqual(postgresConsumers.map(() => '3.4.9'));
  });

  it('clamps an overdue pooled reconnect before passing its delay to setTimeout', async () => {
    const require = createRequire(import.meta.url);
    const postgresEntry = require.resolve('postgres');
    const connectionSource = await readFile(join(dirname(postgresEntry), 'connection.js'), 'utf8');

    expect(connectionSource).toContain(
      'setTimeout(connect, closedTime ? Math.max(0, closedTime + delay - performance.now()) : 0)',
    );
  });
});
