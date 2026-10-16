// Merges the form data with the AI result into one clean row for Google Sheets.
// If the AI response is missing or not valid JSON, the lead is still saved and flagged for manual review.
const form = $('New Lead Form').first().json;
const response = $input.first().json;

let ai = {};
let aiStatus = 'ok';
try {
  ai = JSON.parse(response.choices[0].message.content);
} catch (error) {
  aiStatus = 'needs_review: AI response could not be parsed';
}

const rawScore = Number(ai.lead_score);
const leadScore = Number.isFinite(rawScore) ? Math.min(10, Math.max(1, Math.round(rawScore))) : '';
if (aiStatus === 'ok' && leadScore === '') aiStatus = 'needs_review: missing lead score';

const now = new Date();
return [{
  json: {
    created_at: now.toISOString(),
    lead_id: `L-${now.getTime().toString(36).toUpperCase()}`,
    name: form['Full Name'],
    email: (form['Work Email'] || '').trim().toLowerCase(),
    company: form['Company / Brand'],
    amazon_store: form['Amazon Store or ASIN Link'] || '',
    monthly_revenue: form['Monthly Amazon Revenue'],
    source: form['How did you hear about us?'] || 'Unknown',
    message: form['What do you need help with?'],
    brand_category: ai.brand_category || '',
    main_need: ai.main_need || '',
    lead_score: leadScore,
    score_reason: ai.score_reason || '',
    summary: ai.summary || '',
    ai_status: aiStatus,
  },
}];
