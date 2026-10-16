// Creates or updates the workflows on an n8n instance through the public API.
// Existing credentials set in the n8n UI are kept when a workflow is updated.
//
// Usage:
//   N8N_URL=http://localhost:5678 N8N_API_KEY=... node scripts/deploy.mjs
// Optional:
//   REPORT_EMAIL=me@example.com          replaces the placeholder email in workflow 03
//   SHEET_URL=https://docs.google.com/... replaces the placeholder Google Sheet URL
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { N8N_URL = 'http://localhost:5678', N8N_API_KEY, REPORT_EMAIL, SHEET_URL } = process.env;
if (!N8N_API_KEY) throw new Error('Set N8N_API_KEY');

const api = async (method, route, body) => {
  const res = await fetch(`${N8N_URL}/api/v1${route}`, {
    method,
    headers: { 'X-N8N-API-KEY': N8N_API_KEY, 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${route} → ${res.status}: ${text}`);
  return text ? JSON.parse(text) : {};
};

const load = (file) => {
  let raw = fs.readFileSync(path.join(root, 'workflows', file), 'utf8');
  if (REPORT_EMAIL) raw = raw.replaceAll('you@example.com', REPORT_EMAIL);
  if (SHEET_URL) raw = raw.replaceAll('https://docs.google.com/spreadsheets/d/PASTE_YOUR_SPREADSHEET_ID/edit', SHEET_URL);
  return JSON.parse(raw);
};

const existing = (await api('GET', '/workflows?limit=250')).data;

const upsert = async (wf) => {
  const current = existing.find((w) => w.name === wf.name);
  if (!current) {
    const created = await api('POST', '/workflows', wf);
    console.log(`created  ${created.id}  ${wf.name}`);
    return created;
  }
  // Keep credentials (and the real Sheet URL / emails) that were configured in the UI.
  for (const n of wf.nodes) {
    const old = current.nodes.find((o) => o.name === n.name);
    if (!old) continue;
    if (old.credentials) n.credentials = old.credentials;
    if (n.parameters.documentId && !SHEET_URL) n.parameters.documentId = old.parameters.documentId;
    if (n.type.endsWith('emailSend') && !REPORT_EMAIL) {
      n.parameters.fromEmail = old.parameters.fromEmail;
      n.parameters.toEmail = old.parameters.toEmail;
    }
  }
  const updated = await api('PUT', `/workflows/${current.id}`, wf);
  console.log(`updated  ${updated.id}  ${wf.name}`);
  return updated;
};

const errorWf = await upsert(load('04-error-alerts.json'));
for (const file of ['01-lead-intake.json', '02-amazon-listing-generator.json', '03-weekly-report.json']) {
  const wf = load(file);
  wf.settings.errorWorkflow = errorWf.id;
  await upsert(wf);
}
