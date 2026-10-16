# Setup

## 1. Import the workflows

**Option A: n8n UI.** Go to *Workflows → Import from file* and pick the files in `workflows/`.
Import `04-error-alerts.json` first, then select it as the *Error Workflow* in the settings of workflows 01–03.

**Option B: API (creates or updates all 4 workflows, and links the error workflow).**

```bash
node scripts/build.mjs        # only needed after editing files in src/
N8N_URL=http://localhost:5678 N8N_API_KEY=xxx REPORT_EMAIL=me@example.com node scripts/deploy.mjs
```

Re-running `deploy.mjs` keeps the credentials, Sheet URL and emails already set in the n8n UI.

## 2. Google Sheet

1. Create a spreadsheet with 4 tabs: `Leads`, `Sales`, `Listings`, `Weekly KPIs`.
2. Run `node scripts/generate-sample-data.mjs`, then import each CSV from `sample-data/` into its tab (*File → Import → Replace current sheet*).
3. Paste the spreadsheet URL into every Google Sheets node, or pass `SHEET_URL=...` to `deploy.mjs`.

## 3. Credentials (n8n → Credentials → Create)

| Credential | Used by | How |
|---|---|---|
| **OpenAI** | 01, 02 | API key from platform.openai.com → API keys |
| **Google Sheets OAuth2** | 01, 02, 03 | Google Cloud project → enable Sheets API + Drive API → OAuth client (Web), redirect URL shown in n8n |
| **Slack** | 01–04 | api.slack.com/apps → create app → Bot scopes `chat:write`, `channels:read` → install → Bot token. Invite the bot to `#leads`, `#listings`, `#reports`, `#automation-alerts` |
| **SMTP** | 03 | Gmail: `smtp.gmail.com`, port 465, SSL on, an **App Password** (not your normal password) |

## 4. Test

- **01 / 02:** open the Form Trigger node → *Test URL* → submit the form.
- **03:** click *Execute workflow*. With sample data, the report covers the last 7 full days.
- **04:** break something on purpose (e.g. a wrong Sheet name) and run 01 in production mode. Error workflows only fire for production (active) executions.

Then switch workflows 01–03 to **Active**.

## Changing the AI model

The model is set in `src/01-lead-build-prompt.js` and `src/02-listing-build-prompt.js` (`MODEL`). Edit it, then run `build.mjs` and `deploy.mjs`.
