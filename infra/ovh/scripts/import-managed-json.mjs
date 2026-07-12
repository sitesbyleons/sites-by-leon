#!/usr/bin/env node
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const tableOrder = [
  'app_admins',
  'client_workspaces',
  'workspace_members',
  'website_projects',
  'subscriptions',
  'content_requests',
  'contact_inquiries',
  'connected_payment_accounts',
  'studio_settings',
  'studio_galleries',
  'studio_gallery_images',
  'studio_posts',
  'studio_services',
  'studio_clients',
  'studio_invoices',
  'studio_inquiries',
  'site_connections',
];

const allowedTables = new Set(tableOrder);
const marker = '$leon_json$';

export function renderImportSql(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Export must be a JSON object.');
  for (const [table, rows] of Object.entries(data)) {
    if (!allowedTables.has(table)) throw new Error(`Unexpected export table: ${table}`);
    if (!Array.isArray(rows)) throw new Error(`Export table ${table} must contain an array.`);
  }

  const statements = ['begin;'];
  for (const table of tableOrder) {
    const rows = data[table] ?? [];
    if (!rows.length) continue;
    const json = JSON.stringify(rows);
    if (json.includes(marker)) throw new Error(`Export data contains the reserved ${marker} marker.`);
    statements.push(
      `insert into ${table} select * from jsonb_populate_recordset(null::${table}, ${marker}${json}${marker}::jsonb) on conflict do nothing;`,
    );
  }
  statements.push('commit;');
  return `${statements.join('\n\n')}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , inputPath, outputPath] = process.argv;
  if (!inputPath || !outputPath) {
    console.error('Usage: node import-managed-json.mjs <export.json> <import.sql>');
    process.exit(2);
  }
  const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  fs.writeFileSync(outputPath, renderImportSql(data), { encoding: 'utf8', mode: 0o600 });
  console.log(`Import SQL written to ${outputPath}`);
}
