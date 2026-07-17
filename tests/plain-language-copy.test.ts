import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const sourceRoots = ['src', 'dashboard/src', 'photographer-site/src'];
const sourceExtensions = new Set(['.astro', '.ts', '.tsx']);
const excludedDirectories = new Set(['scripts', 'styles']);

const collectUserFacingSources = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return excludedDirectories.has(entry.name) ? [] : collectUserFacingSources(path);
    }
    return sourceExtensions.has(extname(entry.name)) ? [path] : [];
  });

const sourceFiles = sourceRoots
  .flatMap((root) => collectUserFacingSources(join(repositoryRoot, root)))
  .sort();

const rejectedPhrases = [
  'without the guesswork',
  'one calm place',
  'show off your',
  'start showing off',
  'your site. handled',
  'handled properly',
  'impossible to miss',
  'impossible to scroll past',
  'launch without the headache',
  'take a short pause',
  'taking a short pause',
  'need access?',
  'need online payments?',
  'site access in one place',
];

describe('plain-language copy', () => {
  for (const phrase of rejectedPhrases) {
    it(`does not use "${phrase}" in user-facing source`, () => {
      const offenders = sourceFiles
        .filter((file) => readFileSync(file, 'utf8').toLowerCase().includes(phrase))
        .map((file) => relative(repositoryRoot, file));

      expect(offenders).toEqual([]);
    });
  }
});
