// Builds the n8n workflow JSON files in /workflows from the Code-node sources in /src.
// Keeping the JavaScript in real .js files makes it reviewable, diffable and lintable.
// Layout: every workflow gets an overview sticky note plus one colored sticky per stage,
// and every node gets a one-line subtitle on the canvas.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (file) => fs.readFileSync(path.join(root, 'src', file), 'utf8');

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/PASTE_YOUR_SPREADSHEET_ID/edit';
const REPORT_EMAIL = 'you@example.com';
const TIMEZONE = 'America/New_York';

// Sticky note colors in n8n.
const COLOR = { yellow: 1, orange: 2, red: 3, green: 4, blue: 5, purple: 6 };

// ---------- node helpers ----------
const slug = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const node = (name, type, typeVersion, parameters, extra = {}) =>
  ({ id: slug(name), name, type, typeVersion, position: [0, 0], parameters, ...extra });

// Shows a short subtitle under the node on the canvas.
const note = (n, text) => Object.assign(n, { notes: text, notesInFlow: true });

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

// ---------- connections ----------
function link(c, from, to) {
  c[from] ??= { main: [[]] };
  c[from].main[0].push({ node: to, type: 'main', index: 0 });
  return c;
}
const chain = (...names) => {
  const c = {};
  for (let i = 0; i < names.length - 1; i++) link(c, names[i], names[i + 1]);
  return c;
};

// ---------- layout ----------
const STEP_X = 240;       // distance between node columns
const STEP_Y = 200;       // distance between stacked nodes (branches)
const ROW_Y = 400;        // y of the main row
const PAD_X = 70;         // sticky padding left/right of nodes
const HEADER = 150;       // room for the sticky heading above the nodes
const NODE = 100;         // n8n node size
const FOOTER = 130;       // room for node name + subtitle below the nodes
const GAP = 40;           // gap between stage stickies

const sticky = (name, content, color, [x, y], width, height) => ({
  id: slug(name), name, type: 'n8n-nodes-base.stickyNote', typeVersion: 1,
  position: [x, y], parameters: { content, color, width, height },
});

// Places nodes left-to-right by stage and wraps each stage in a colored sticky note.
// A stage's `nodes` is a list of columns; a column is a node or an array of stacked nodes.
function layout(title, overview, stages) {
  const maxRows = Math.max(...stages.flatMap((s) => s.nodes.map((c) => (Array.isArray(c) ? c.length : 1))));
  const top = ROW_Y - HEADER - ((maxRows - 1) * STEP_Y) / 2;
  const height = HEADER + NODE + FOOTER + (maxRows - 1) * STEP_Y;

  const notes = [];
  let x = 0;
  for (const [i, s] of stages.entries()) {
    const cols = s.nodes.map((c) => (Array.isArray(c) ? c : [c]));
    cols.forEach((col, ci) => col.forEach((n, ri) => {
      n.position = [x + PAD_X + ci * STEP_X, ROW_Y + (ri - (col.length - 1) / 2) * STEP_Y];
    }));
    const width = PAD_X * 2 + (cols.length - 1) * STEP_X + NODE;
    notes.push(sticky(`Stage ${i + 1} · ${s.title}`, `## ${s.title}\n${s.body}`, s.color, [x, top], width, height));
    x += width + GAP;
  }

  const overviewWidth = 460;
  notes.unshift(sticky(`Overview · ${title}`, overview, COLOR.yellow, [-overviewWidth - GAP, top], overviewWidth, Math.max(height, 640)));
  return notes;
}

const workflow = (name, nodes, connections, settings = {}) => ({
  name,
  nodes,
  connections,
  settings: { executionOrder: 'v1', timezone: TIMEZONE, saveManualExecutions: true, ...settings },
});

// ======================================================================
// 01 · Lead intake
// ======================================================================
const w1 = {
  form: note(formTrigger('New Lead Form', 'lead-intake', '6f1c2a8e-4b1d-4c55-9a1e-3d2b7c9e0a11',
    'Work with us', 'Tell us about your Amazon brand. We reply within 1 business day.', [
      field('Full Name', 'text', { requiredField: true }),
      field('Work Email', 'email', { requiredField: true }),
      field('Company / Brand', 'text', { requiredField: true }),
      field('Amazon Store or ASIN Link', 'text', { placeholder: 'https://www.amazon.com/...' }),
      field('Monthly Amazon Revenue', 'dropdown', { requiredField: true, options: ['Not selling yet', '< $10k', '$10k–$50k', '$50k–$250k', '$250k+'] }),
      field('How did you hear about us?', 'dropdown', { options: ['Google', 'Referral', 'LinkedIn', 'Amazon/Seller forum', 'Other'] }),
      field('What do you need help with?', 'textarea', { requiredField: true }),
    ]), 'Public form · /form/lead-intake'),
  prompt: note(code('Build AI Prompt', '01-lead-build-prompt.js'), 'System + lead details → JSON request'),
  ai: note(openAi('OpenAI · Extract & Score'), 'gpt-4.1-mini · 3 retries · never blocks'),
  parse: note(code('Parse & Score Lead', '01-lead-parse.js'), 'Clean row · score 1–10 · flag issues'),
  sheet: note(sheetAppendAuto('Log to Leads Sheet', 'Leads'), 'Tab "Leads" · columns auto-mapped'),
  format: note(code('Format Slack Message', '01-lead-slack-message.js'), '🔥 ≥7 · 🟡 4–6 · 🔵 ≤3 · ⚠️ review'),
  slack: note(slack('Notify #leads', '#leads'), 'Channel #leads'),
};
const wf1 = workflow('01 · Lead Intake → AI Qualify → Google Sheets → Slack', [
  ...layout('Lead Intake', `# 📥 01 · Lead Intake
**New inquiry → AI qualifies it → logged → sales alerted.**

### Replaces
Reading every inquiry, copying it into the CRM sheet, guessing priority, pinging sales. **≈ 5 min per lead.**

### Flow
1. Prospect submits the form
2. OpenAI extracts category, need, **score 1–10** + reason
3. Row appended to **Google Sheets → Leads**
4. Slack **#leads** alert, hottest leads highlighted

### Setup
- 🔑 **OpenAI** → *OpenAI · Extract & Score*
- 🔑 **Google Sheets** + Sheet URL → *Log to Leads Sheet*
- 🔑 **Slack** → *Notify #leads* (invite the bot)

### Reliability
- OpenAI: 3 retries, then continue → lead saved as \`needs_review\`
- Any other failure → **04 · Error Alert** posts to Slack`, [
    { title: '① Capture', color: COLOR.green, body: 'n8n-hosted form.\nSwap for Webhook / Typeform.', nodes: [w1.form] },
    { title: '② AI qualification', color: COLOR.purple, body: 'Prompt → OpenAI (JSON mode) → validate.\nBad AI output never loses a lead.', nodes: [w1.prompt, w1.ai, w1.parse] },
    { title: '③ Save & notify', color: COLOR.blue, body: 'Log to the CRM sheet, then alert sales in Slack.', nodes: [w1.sheet, w1.format, w1.slack] },
  ]),
  ...Object.values(w1),
], chain(...Object.values(w1).map((n) => n.name)));

// ======================================================================
// 02 · Listing generator
// ======================================================================
const w2 = {
  form: note(formTrigger('Product Brief Form', 'listing-brief', '9b0e7d4c-2f3a-4e8b-8c61-5a4d3e2f1b22',
    'Amazon Listing Brief', 'Fill in the product details. A draft listing will be posted to #listings and saved to the Listings sheet.', [
      field('Product Name', 'text', { requiredField: true }),
      field('Brand', 'text', { requiredField: true }),
      field('Category', 'text', { requiredField: true, placeholder: 'e.g. Kitchen & Dining' }),
      field('Key Features & Specs', 'textarea', { requiredField: true, placeholder: 'Materials, size, what is included, what makes it different...' }),
      field('Target Customer', 'text'),
      field('Main Keywords', 'text', { placeholder: 'comma separated' }),
      field('Tone', 'dropdown', { options: ['Professional', 'Friendly', 'Premium', 'Playful'] }),
    ]), 'Internal form · /form/listing-brief'),
  prompt: note(code('Build Listing Prompt', '02-listing-build-prompt.js'), 'Amazon style rules in system prompt'),
  ai: note(openAi('OpenAI · Draft Listing'), 'gpt-4.1-mini · 3 retries'),
  validate: note(code('Validate Listing', '02-listing-validate.js'), 'Lengths · bytes · banned words'),
  sheet: note(sheetAppendAuto('Save to Listings Sheet', 'Listings'), 'Tab "Listings" · status column'),
  format: note(code('Format Slack Message', '02-listing-slack-message.js'), 'Title + bullets + QA result'),
  slack: note(slack('Notify #listings', '#listings'), 'Channel #listings'),
};
const wf2 = workflow('02 · Product Brief → AI Amazon Listing → QA Checks → Sheets + Slack', [
  ...layout('Listing Generator', `# ✍️ 02 · AI Amazon Listing
**Product brief → AI draft → automatic QA → ready for human approval.**

### Replaces
Writing title, 5 bullets, description and search terms by hand, then checking Amazon limits. **≈ 45 min per listing.**

### QA checks (in code, not trusted to AI)
| Check | Rule |
|---|---|
| Title | ≤ 200 chars |
| Bullets | exactly 5, ≤ 250 chars |
| Description | 1,000–2,000 chars |
| Search terms | ≤ 249 bytes (auto-trim) |
| Words | no "best", "#1", "guarantee", "non-toxic"… |

Result: **Ready for approval** or **Needs review** + exact issues.

### Setup
- 🔑 **OpenAI** → *OpenAI · Draft Listing*
- 🔑 **Google Sheets** → *Save to Listings Sheet*
- 🔑 **Slack** → *Notify #listings*`, [
    { title: '① Brief', color: COLOR.green, body: 'Team fills in the product brief.', nodes: [w2.form] },
    { title: '② AI draft', color: COLOR.purple, body: 'Prompt with Amazon style rules → OpenAI returns JSON.', nodes: [w2.prompt, w2.ai] },
    { title: '③ QA', color: COLOR.orange, body: 'Rule checks in code.\nDecides the status.', nodes: [w2.validate] },
    { title: '④ Save & notify', color: COLOR.blue, body: 'Save the full copy to the sheet, post a preview to Slack.', nodes: [w2.sheet, w2.format, w2.slack] },
  ]),
  ...Object.values(w2),
], chain(...Object.values(w2).map((n) => n.name)));

// ======================================================================
// 03 · Weekly report
// ======================================================================
const KPI_FIELDS = ['week_start', 'week_end', 'new_leads', 'new_leads_wow_pct', 'hot_leads', 'revenue', 'revenue_wow_pct',
  'units', 'units_wow_pct', 'listings_generated', 'listings_need_review', 'generated_at'];
const w3 = {
  schedule: note(node('Every Monday 8:00', 'n8n-nodes-base.scheduleTrigger', 1.2, {
    rule: { interval: [{ field: 'cronExpression', expression: '0 8 * * 1' }] },
  }), 'Cron 0 8 * * 1 · America/New_York'),
  leads: note(sheetRead('Read Leads', 'Leads'), 'Source 1 · CRM leads'),
  sales: note(sheetRead('Read Sales', 'Sales', { executeOnce: true }), 'Source 2 · Amazon sales'),
  listings: note(sheetRead('Read Listings', 'Listings', { executeOnce: true }), 'Source 3 · listing drafts'),
  kpis: note(code('Build Weekly KPIs', '03-weekly-aggregate.js'), 'Totals · WoW % · top products · alerts'),
  slack: note(slack('Post to #reports', '#reports'), 'Short summary'),
  email: note(node('Email Report', 'n8n-nodes-base.emailSend', 2.1, {
    fromEmail: REPORT_EMAIL,
    toEmail: REPORT_EMAIL,
    subject: '={{ $json.subject }}',
    emailFormat: 'html',
    html: '={{ $json.html }}',
    options: {},
  }), 'HTML report with KPI cards'),
  dashboard: note(sheetAppendMapped('Append to Dashboard Sheet', 'Weekly KPIs', KPI_FIELDS, '$json.kpi'), 'One row/week → charts'),
};
const wf3Conn = chain('Every Monday 8:00', 'Read Leads', 'Read Sales', 'Read Listings', 'Build Weekly KPIs');
for (const n of [w3.slack, w3.email, w3.dashboard]) link(wf3Conn, 'Build Weekly KPIs', n.name);
const wf3 = workflow('03 · Weekly Report: Leads + Amazon Sales + Listings → Slack, Email, Dashboard', [
  ...layout('Weekly Report', `# 📊 03 · Weekly Report
**Every Monday: 3 data sources → one report, delivered 3 ways.**

### Replaces
Opening several sheets every Monday, adding up numbers, comparing with last week, writing the update. **≈ 1.5 h per week.**

### What's in the report
- Revenue & units, **week-over-week %**
- Top 5 products, ⚠️ any product **down 20%+**
- New leads by source, 🔥 hot leads to follow up
- Listings drafted / needing review

### Setup
- 🔑 **Google Sheets** → the 3 *Read* nodes + *Append to Dashboard Sheet*
- 🔑 **Slack** → *Post to #reports*
- 🔑 **SMTP** → *Email Report*

### Notes
- In production, the **Sales** tab is fed by Amazon SP-API or a Seller Central export
- Empty tabs don't break the run (*Always Output Data*)`, [
    { title: '① Schedule', color: COLOR.green, body: 'Mondays 8:00 ET.', nodes: [w3.schedule] },
    { title: '② Collect data', color: COLOR.purple, body: 'Read the 3 sources. Sales and Listings run once (*Execute Once*).', nodes: [w3.leads, w3.sales, w3.listings] },
    { title: '③ Analyze', color: COLOR.orange, body: 'Last 7 days vs the 7 before.', nodes: [w3.kpis] },
    { title: '④ Deliver', color: COLOR.blue, body: 'Slack · Email · Dashboard', nodes: [[w3.slack, w3.email, w3.dashboard]] },
  ]),
  ...Object.values(w3),
], wf3Conn);

// ======================================================================
// 04 · Error alerts
// ======================================================================
const w4 = {
  trigger: note(node('On Workflow Error', 'n8n-nodes-base.errorTrigger', 1, {}), 'Fires when 01–03 fail'),
  slack: note(slack('Alert #automation-alerts', '#automation-alerts',
    '=🚨 *Workflow failed:* {{ $json.workflow.name }}\n*Node:* {{ $json.execution.lastNodeExecuted }}\n*Error:* {{ $json.execution.error.message }}\n*Execution:* {{ $json.execution.url }}'),
  'Workflow · node · error · link'),
};
const wf4 = workflow('04 · Error Alert → Slack (monitors all workflows)', [
  ...layout('Error Alert', `# 🚨 04 · Error Alert
**If any automation breaks, the team knows within seconds, not days.**

### How it is attached
Workflows 01, 02 and 03 have this workflow set as their **Error Workflow** (*Workflow settings → Error workflow*). \`deploy.mjs\` links them automatically.

### The alert contains
- Workflow name
- The node that failed
- The error message
- A link to the failed execution

### Setup
- 🔑 **Slack** → *Alert #automation-alerts*

### Note
Error workflows fire only for **production (active)** executions, not manual test runs.`, [
    { title: '① Catch', color: COLOR.red, body: 'Error Trigger', nodes: [w4.trigger] },
    { title: '② Alert', color: COLOR.blue, body: 'Post to Slack', nodes: [w4.slack] },
  ]),
  ...Object.values(w4),
], chain(w4.trigger.name, w4.slack.name));

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
  const stickies = wf.nodes.filter((n) => n.type === 'n8n-nodes-base.stickyNote').length;
  console.log(`built workflows/${file} (${wf.nodes.length - stickies} nodes, ${stickies} notes)`);
}
