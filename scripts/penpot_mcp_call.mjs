import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

const [toolName, rawArgument = '{}'] = process.argv.slice(2);
if (!toolName) throw new Error('Usage: node scripts/penpot_mcp_call.mjs <tool> [json or @code-file]');

const config = execFileSync('codex', ['mcp', 'get', 'penpot'], { encoding: 'utf8' });
const url = config.match(/url:\s*(https:\/\/\S+)/)?.[1];
if (!url) throw new Error('The Penpot MCP URL is not configured.');

const parseEvent = (body) => {
  const line = body.split(/\r?\n/).filter((part) => part.startsWith('data:')).at(-1);
  if (!line) throw new Error('Penpot did not return an MCP data event.');
  return JSON.parse(line.replace(/^data:\s*/, ''));
};

const headers = {
  accept: 'application/json, text/event-stream',
  'content-type': 'application/json',
};

const post = async (payload) => {
  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
  const body = await response.text();
  if (!response.ok) throw new Error(`Penpot MCP returned ${response.status}.`);
  return { response, event: body ? parseEvent(body) : null };
};

const initialized = await post({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'sites-by-leon-builder', version: '1.0.0' },
  },
});

const sessionId = initialized.response.headers.get('mcp-session-id');
if (!sessionId) throw new Error('Penpot did not return an MCP session id.');
headers['mcp-session-id'] = sessionId;

await post({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });

let args;
if (toolName === 'execute_code' && rawArgument.startsWith('@')) {
  args = { code: await readFile(rawArgument.slice(1), 'utf8') };
} else {
  args = JSON.parse(rawArgument);
}

const called = await post({
  jsonrpc: '2.0',
  id: 2,
  method: 'tools/call',
  params: { name: toolName, arguments: args },
});

if (called.event?.error) throw new Error(called.event.error.message);
const content = called.event?.result?.content ?? [];
for (const item of content) {
  if (item.type === 'text') process.stdout.write(`${item.text}\n`);
  if (item.type === 'image' && process.env.PENPOT_EXPORT_PATH) {
    await writeFile(process.env.PENPOT_EXPORT_PATH, Buffer.from(item.data, 'base64'));
    process.stdout.write(`IMAGE_SAVED=${process.env.PENPOT_EXPORT_PATH}\n`);
  }
}
