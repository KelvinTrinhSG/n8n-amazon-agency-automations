// Formats the Slack alert. Hot leads are highlighted so sales can respond first.
const lead = $('Parse & Score Lead').first().json;
const score = lead.lead_score;

const label = score === '' ? '⚠️ NEEDS REVIEW'
  : score >= 7 ? '🔥 HOT LEAD'
  : score >= 4 ? '🟡 Warm lead'
  : '🔵 Cold lead';

const lines = [
  `*${label}* — ${lead.company} (${score === '' ? '?' : score}/10)`,
  `*Contact:* ${lead.name} · ${lead.email}`,
  `*Revenue:* ${lead.monthly_revenue} · *Need:* ${lead.main_need || 'n/a'} · *Category:* ${lead.brand_category || 'n/a'}`,
  `*Summary:* ${lead.summary || lead.message}`,
];
if (lead.score_reason) lines.push(`_Why this score: ${lead.score_reason}_`);
if (lead.ai_status !== 'ok') lines.push(`⚠️ ${lead.ai_status}`);
lines.push(`Lead ID: ${lead.lead_id} · Source: ${lead.source}`);

return [{ json: { slackText: lines.join('\n') } }];
