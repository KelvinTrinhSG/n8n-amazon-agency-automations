// Builds the n8n workflow JSON files in /workflows from the Code-node sources in /src.
// Keeping the JavaScript in real .js files makes it reviewable, diffable and lintable.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (file) => fs.readFileSync(path.join(root, 'src', file), 'utf8');

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/PASTE_YOUR_SPREADSHEET_ID/edit';
const REPORT_EMAIL = 'you@example.com';
const TIMEZONE = 'America/New_York';

// ---------- node helpers ----------
let x = 0;
const node = (name, type, typeVersion, parameters, extra = {}) => {
  const n = { id: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, name, type, typeVersion, position: [x, 0], parameters, ...extra };
  x += 240;
  return n;
};

const code = (name, file) => node(name, 'n8n-nodes-base.code', 2, { jsCode: src(file) });

const openAi = (name) => node(name, 'n8n-nodes-base.httpRequest', 4.2, {
  method: 'POST',
  url: 'https://api.openai.com/v1/chat/completions',
  authentication: 'predefinedCredentialType',
  nodeCredentialType: 'openAiApi',
  sendBody: true,
  specifyBody: 'json',
  jsonBody: '={{ JSON.stringify($json.requestBody) }}',
  options: { timeout: 60000 },
}, {
  // Retry transient OpenAI errors (429/5xx); if it still fails, continue so the record is saved and flagged.
  retryOnFail: true,
  maxTries: 3,
  waitBetweenTries: 5000,
  onError: 'continueRegularOutput',
});

const sheetRef = (sheetName) => ({
  documentId: { __rl: true, value: SHEET_URL, mode: 'url' },
  sheetName: { __rl: true, value: sheetName, mode: 'name' },
});

const sheetAppendAuto = (name, sheetName) => node(name, 'n8n-nodes-base.googleSheets', 4.5, {
  operation: 'append',
  ...sheetRef(sheetName),
  columns: { mappingMode: 'autoMapInputData', value: {}, matchingColumns: [], schema: [] },
  options: {},
});

const sheetAppendMapped = (name, sheetName, fields, expr) => node(name, 'n8n-nodes-base.googleSheets', 4.5, {
  operation: 'append',
  ...sheetRef(sheetName),
  columns: {
    mappingMode: 'defineBelow',
    value: Object.fromEntries(fields.map((f) => [f, `={{ ${expr}.${f} }}`])),
    matchingColumns: [],
    schema: fields.map((f) => ({ id: f, displayName: f, required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true })),
  },
  options: {},
});

const sheetRead = (name, sheetName, extra) => node(name, 'n8n-nodes-base.googleSheets', 4.5, {
  ...sheetRef(sheetName),
  options: {},
}, { alwaysOutputData: true, ...extra });

const slack = (name, channel, textExpr = '={{ $json.slackText }}') => node(name, 'n8n-nodes-base.slack', 2.2, {
  select: 'channel',
  channelId: { __rl: true, value: channel, mode: 'name' },
  text: textExpr,
  otherOptions: { includeLinkToWorkflow: false },
});

const formTrigger = (name, pathSlug, webhookId, title, description, fields) => node(name, 'n8n-nodes-base.formTrigger', 2.2, {
  formTitle: title,
  formDescription: description,
  formFields: { values: fields },
  options: { path: pathSlug, appendAttribution: false },
}, { webhookId });

const field = (label, type = 'text', opts = {}) => {
  const f = { fieldLabel: label, fieldType: type, ...opts };
  if (opts.options) { f.fieldOptions = { values: opts.options.map((o) => ({ option: o })) }; delete f.options; }
  return f;
};

const chain = (...names) => {
  const c = {};
  for (let i = 0; i < names.length - 1; i++) link(c, names[i], names[i + 1]);
  return c;
};
function link(c, from, to) {
  c[from] ??= { main: [[]] };
  c[from].main[0].push({ node: to, type: 'main', index: 0 });
  return c;
}

const workflow = (name, nodes, connections, settings = {}) => ({
  name,
  nodes,
  connections,
  settings: { executionOrder: 'v1', timezone: TIMEZONE, saveManualExecutions: true, ...settings },
});

// ---------- 01 Lead intake ----------
x = 0;
const wf1 = workflow('01 · Lead Intake → AI Qualify → Google Sheets → Slack', [
  formTrigger('New Lead Form', 'lead-intake', '6f1c2a8e-4b1d-4c55-9a1e-3d2b7c9e0a11',
    'Work with us', 'Tell us about your Amazon brand. We reply within 1 business day.', [
      field('Full Name', 'text', { requiredField: true }),
      field('Work Email', 'email', { requiredField: true }),
      field('Company / Brand', 'text', { requiredField: true }),
      field('Amazon Store or ASIN Link', 'text', { placeholder: 'https://www.amazon.com/...' }),
      field('Monthly Amazon Revenue', 'dropdown', { requiredField: true, options: ['Not selling yet', '< $10k', '$10k–$50k', '$50k–$250k', '$250k+'] }),
      field('How did you hear about us?', 'dropdown', { options: ['Google', 'Referral', 'LinkedIn', 'Amazon/Seller forum', 'Other'] }),
      field('What do you need help with?', 'textarea', { requiredField: true }),
    ]),
  code('Build AI Prompt', '01-lead-build-prompt.js'),
  openAi('OpenAI · Extract & Score'),
  code('Parse & Score Lead', '01-lead-parse.js'),
  sheetAppendAuto('Log to Leads Sheet', 'Leads'),
  code('Format Slack Message', '01-lead-slack-message.js'),
  slack('Notify #leads', '#leads'),
], chain('New Lead Form', 'Build AI Prompt', 'OpenAI · Extract & Score', 'Parse & Score Lead', 'Log to Leads Sheet', 'Format Slack Message', 'Notify #leads'));

// ---------- 02 Listing generator ----------
x = 0;
const wf2 = workflow('02 · Product Brief → AI Amazon Listing → QA Checks → Sheets + Slack', [
  formTrigger('Product Brief Form', 'listing-brief', '9b0e7d4c-2f3a-4e8b-8c61-5a4d3e2f1b22',
    'Amazon Listing Brief', 'Fill in the product details. A draft listing will be posted to #listings and saved to the Listings sheet.', [
      field('Product Name', 'text', { requiredField: true }),
      field('Brand', 'text', { requiredField: true }),
      field('Category', 'text', { requiredField: true, placeholder: 'e.g. Kitchen & Dining' }),
      field('Key Features & Specs', 'textarea', { requiredField: true, placeholder: 'Materials, size, what is included, what makes it different...' }),
      field('Target Customer', 'text'),
      field('Main Keywords', 'text', { placeholder: 'comma separated' }),
      field('Tone', 'dropdown', { options: ['Professional', 'Friendly', 'Premium', 'Playful'] }),
    ]),
  code('Build Listing Prompt', '02-listing-build-prompt.js'),
  openAi('OpenAI · Draft Listing'),
  code('Validate Listing', '02-listing-validate.js'),
  sheetAppendAuto('Save to Listings Sheet', 'Listings'),
  code('Format Slack Message', '02-listing-slack-message.js'),
  slack('Notify #listings', '#listings'),
], chain('Product Brief Form', 'Build Listing Prompt', 'OpenAI · Draft Listing', 'Validate Listing', 'Save to Listings Sheet', 'Format Slack Message', 'Notify #listings'));

// ---------- 03 Weekly report ----------
x = 0;
const KPI_FIELDS = ['week_start', 'week_end', 'new_leads', 'new_leads_wow_pct', 'hot_leads', 'revenue', 'revenue_wow_pct',
  'units', 'units_wow_pct', 'listings_generated', 'listings_need_review', 'generated_at'];
const wf3Nodes = [
  node('Every Monday 8:00', 'n8n-nodes-base.scheduleTrigger', 1.2, {
    rule: { interval: [{ field: 'cronExpression', expression: '0 8 * * 1' }] },
  }),
  sheetRead('Read Leads', 'Leads'),
  sheetRead('Read Sales', 'Sales', { executeOnce: true }),
  sheetRead('Read Listings', 'Listings', { executeOnce: true }),
  code('Build Weekly KPIs', '03-weekly-aggregate.js'),
];
x = 4 * 240 + 240;
const kpiNodes = [
  slack('Post to #reports', '#reports'),
  node('Email Report', 'n8n-nodes-base.emailSend', 2.1, {
    fromEmail: REPORT_EMAIL,
    toEmail: REPORT_EMAIL,
    subject: '={{ $json.subject }}',
    emailFormat: 'html',
    html: '={{ $json.html }}',
    options: {},
  }),
  sheetAppendMapped('Append to Dashboard Sheet', 'Weekly KPIs', KPI_FIELDS, '$json.kpi'),
];
kpiNodes.forEach((n, i) => { n.position = [1200, (i - 1) * 200]; });
const wf3Conn = chain('Every Monday 8:00', 'Read Leads', 'Read Sales', 'Read Listings', 'Build Weekly KPIs');
kpiNodes.forEach((n) => link(wf3Conn, 'Build Weekly KPIs', n.name));
const wf3 = workflow('03 · Weekly Report: Leads + Amazon Sales + Listings → Slack, Email, Dashboard', [...wf3Nodes, ...kpiNodes], wf3Conn);

// ---------- 04 Error alerts ----------
x = 0;
const wf4 = workflow('04 · Error Alert → Slack (monitors all workflows)', [
  node('On Workflow Error', 'n8n-nodes-base.errorTrigger', 1, {}),
  slack('Alert #automation-alerts', '#automation-alerts',
    '=🚨 *Workflow failed:* {{ $json.workflow.name }}\n*Node:* {{ $json.execution.lastNodeExecuted }}\n*Error:* {{ $json.execution.error.message }}\n*Execution:* {{ $json.execution.url }}'),
], chain('On Workflow Error', 'Alert #automation-alerts'));

// ---------- write ----------
const outDir = path.join(root, 'workflows');
fs.mkdirSync(outDir, { recursive: true });
const files = {
  '01-lead-intake.json': wf1,
  '02-amazon-listing-generator.json': wf2,
  '03-weekly-report.json': wf3,
  '04-error-alerts.json': wf4,
};
for (const [file, wf] of Object.entries(files)) {
  fs.writeFileSync(path.join(outDir, file), JSON.stringify(wf, null, 2) + '\n');
  console.log(`built workflows/${file} (${wf.nodes.length} nodes)`);
}
