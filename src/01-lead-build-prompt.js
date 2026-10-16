// Builds the OpenAI request that extracts and qualifies an inbound lead.
const lead = $input.first().json;
const MODEL = 'gpt-4.1-mini';

const system = `You are a sales assistant for an Amazon brand management agency.
Extract structured data from an inbound lead and qualify it.
Return ONLY a JSON object with exactly these keys:
- brand_category: string, the product category (e.g. "Kitchen", "Pet supplies"); "Unknown" if unclear
- main_need: one of "Full account management", "PPC/Advertising", "Listing optimization", "Product launch", "Wholesale/Distribution", "Other"
- lead_score: integer 1-10 (10 = established brand, real revenue, clear and urgent need; 1 = spam or no fit)
- score_reason: string, max 25 words
- summary: string, 1-2 sentences the sales team can read in 5 seconds`;

const user = [
  `Name: ${lead['Full Name']}`,
  `Email: ${lead['Work Email']}`,
  `Company / Brand: ${lead['Company / Brand']}`,
  `Amazon store or ASIN link: ${lead['Amazon Store or ASIN Link'] || 'not provided'}`,
  `Monthly Amazon revenue: ${lead['Monthly Amazon Revenue']}`,
  `Message: ${lead['What do you need help with?']}`,
].join('\n');

return [{
  json: {
    requestBody: {
      model: MODEL,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    },
  },
}];
