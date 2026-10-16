// Builds the OpenAI request that drafts Amazon listing copy from a product brief.
const brief = $input.first().json;
const MODEL = 'gpt-4.1-mini';

const system = `You are an expert Amazon listing copywriter for US marketplace brands.
Write listing copy that follows Amazon style rules:
- Title: max 200 characters, starts with the brand name, no ALL CAPS, no promotional words.
- 5 bullet points: each starts with a short benefit in capitals followed by a colon, max 250 characters each.
- Description: 1000-1800 characters, plain text, short paragraphs.
- Backend search terms: space-separated, no commas, no brand names, no words already in the title, max 249 bytes.
- Never use: "best", "#1", "guarantee", "free shipping", "sale", "discount", medical or cure claims, unverified eco claims.
Return ONLY a JSON object with keys: title (string), bullets (array of 5 strings), description (string), search_terms (string).`;

const user = [
  `Product name: ${brief['Product Name']}`,
  `Brand: ${brief['Brand']}`,
  `Category: ${brief['Category']}`,
  `Key features and specs:\n${brief['Key Features & Specs']}`,
  `Target customer: ${brief['Target Customer'] || 'not specified'}`,
  `Main keywords: ${brief['Main Keywords'] || 'not specified'}`,
  `Tone: ${brief['Tone'] || 'Professional'}`,
].join('\n');

return [{
  json: {
    requestBody: {
      model: MODEL,
      temperature: 0.6,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    },
  },
}];
