// Formats the Slack notification so the team can review the draft without opening the sheet.
const l = $('Validate Listing').first().json;
const icon = l.status === 'Ready for approval' ? '✅' : '⚠️';

const lines = [
  `${icon} *New listing draft: ${l.product_name}* (${l.brand}) — ${l.status}`,
  `*Title (${l.title.length} chars):* ${l.title}`,
  '*Bullets:*',
  ...[l.bullet_1, l.bullet_2, l.bullet_3, l.bullet_4, l.bullet_5].filter(Boolean).map((b) => `• ${b}`),
];
if (l.issues) lines.push(`*Checks:* ${l.issues}`);
lines.push('Full copy (description + search terms) is in the Listings sheet.');

return [{ json: { slackText: lines.join('\n') } }];
