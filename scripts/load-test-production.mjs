import { performance } from 'node:perf_hooks';

const defaults = {
  concurrency: 10,
  requests: 100,
  timeoutMs: 10_000,
  maxP95Ms: 2_500,
};
const defaultTargets = [
  'https://leonsites.org/api/health',
  'https://test.leonsites.org/',
  'https://demo.leonsites.org/api/health',
];

const options = Object.fromEntries(process.argv.slice(2).map((argument) => {
  const match = argument.match(/^--([a-z0-9-]+)=(.+)$/);
  if (!match) throw new Error(`Invalid argument: ${argument}`);
  return [match[1], match[2]];
}));

const positiveInteger = (name, fallback, maximum) => {
  const value = Number(options[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be a whole number from 1 through ${maximum}.`);
  }
  return value;
};

const concurrency = positiveInteger('concurrency', defaults.concurrency, 100);
const requestCount = positiveInteger('requests', defaults.requests, 10_000);
const timeoutMs = positiveInteger('timeout-ms', defaults.timeoutMs, 60_000);
const maxP95Ms = positiveInteger('max-p95-ms', defaults.maxP95Ms, 60_000);
if (requestCount < concurrency) throw new Error('requests must be at least concurrency.');

const targets = options.targets ? options.targets.split(',') : defaultTargets;
for (const target of targets) {
  const url = new URL(target);
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Every load-test target must be a credential-free HTTPS URL.');
  }
}

const durations = [];
const failures = [];
let nextRequest = 0;

const worker = async () => {
  while (nextRequest < requestCount) {
    const requestIndex = nextRequest;
    nextRequest += 1;
    const target = targets[requestIndex % targets.length];
    const startedAt = performance.now();
    try {
      const response = await fetch(target, {
        headers: { 'User-Agent': 'SitesByLeon-ProductionLoadGate/1.0' },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      });
      await response.arrayBuffer();
      if (!response.ok) failures.push(`${new URL(target).host}: HTTP ${response.status}`);
    } catch (error) {
      failures.push(`${new URL(target).host}: ${error instanceof Error ? error.name : 'request failed'}`);
    } finally {
      durations.push(performance.now() - startedAt);
    }
  }
};

const suiteStartedAt = performance.now();
await Promise.all(Array.from({ length: concurrency }, () => worker()));
const elapsedMs = performance.now() - suiteStartedAt;
durations.sort((a, b) => a - b);
const percentile = (fraction) => durations[Math.min(durations.length - 1, Math.ceil(durations.length * fraction) - 1)];
const p50Ms = percentile(0.5);
const p95Ms = percentile(0.95);
const requestsPerSecond = requestCount / (elapsedMs / 1_000);

console.log(JSON.stringify({
  targets: targets.map((target) => new URL(target).host),
  concurrency,
  requests: requestCount,
  failures: failures.length,
  p50_ms: Math.round(p50Ms),
  p95_ms: Math.round(p95Ms),
  requests_per_second: Number(requestsPerSecond.toFixed(1)),
}, null, 2));

if (failures.length > 0) {
  console.error(`Load gate failed with ${failures.length} request error(s). First: ${failures[0]}`);
  process.exit(1);
}
if (p95Ms > maxP95Ms) {
  console.error(`Load gate failed: p95 ${Math.round(p95Ms)}ms exceeded ${maxP95Ms}ms.`);
  process.exit(1);
}
