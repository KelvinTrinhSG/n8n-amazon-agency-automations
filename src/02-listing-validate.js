// Checks the AI draft against Amazon rules before a human sees it.
// The AI is not trusted blindly: length limits and banned words are verified in code.
const brief = $('Product Brief Form').first().json;
const response = $input.first().json;

const LIMITS = { title: 200, bullet: 250, descriptionMin: 1000, descriptionMax: 2000, searchTermsBytes: 249 };
const BANNED = ['best', '#1', 'number one', 'guarantee', 'guaranteed', 'free shipping', 'sale', 'discount',
  'cure', 'cures', 'fda approved', 'eco-friendly', 'non-toxic', '100% safe'];

const byteLength = (s) => encodeURIComponent(s).replace(/%[0-9A-F]{2}/g, 'x').length;
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const findBanned = (text) => BANNED.filter((word) =>
  new RegExp(`(^|[^a-z0-9])${escapeRegex(word)}([^a-z0-9]|$)`, 'i').test(text));

let draft;
try {
  draft = JSON.parse(response.choices[0].message.content);
} catch (error) {
  draft = null;
}

const issues = [];
if (!draft) {
  issues.push('AI response could not be parsed — regenerate');
  draft = { title: '', bullets: [], description: '', search_terms: '' };
}

const title = (draft.title || '').trim();
const bullets = Array.isArray(draft.bullets) ? draft.bullets.map((b) => String(b).trim()) : [];
const description = (draft.description || '').trim();
let searchTerms = (draft.search_terms || '').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();

if (title.length > LIMITS.title) issues.push(`Title is ${title.length} chars (max ${LIMITS.title})`);
if (bullets.length !== 5) issues.push(`Expected 5 bullets, got ${bullets.length}`);
bullets.forEach((b, i) => {
  if (b.length > LIMITS.bullet) issues.push(`Bullet ${i + 1} is ${b.length} chars (max ${LIMITS.bullet})`);
});
if (description.length < LIMITS.descriptionMin || description.length > LIMITS.descriptionMax) {
  issues.push(`Description is ${description.length} chars (target ${LIMITS.descriptionMin}-${LIMITS.descriptionMax})`);
}

// Search terms over the byte limit are ignored by Amazon, so trim whole words automatically.
if (byteLength(searchTerms) > LIMITS.searchTermsBytes) {
  const words = searchTerms.split(' ');
  while (words.length && byteLength(words.join(' ')) > LIMITS.searchTermsBytes) words.pop();
  searchTerms = words.join(' ');
  issues.push('Search terms trimmed to 249 bytes');
}

const banned = findBanned([title, ...bullets, description].join(' '));
if (banned.length) issues.push(`Banned/risky words: ${banned.join(', ')}`);

const blocking = issues.filter((i) => i !== 'Search terms trimmed to 249 bytes');
return [{
  json: {
    created_at: new Date().toISOString(),
    product_name: brief['Product Name'],
    brand: brief['Brand'],
    category: brief['Category'],
    title,
    bullet_1: bullets[0] || '',
    bullet_2: bullets[1] || '',
    bullet_3: bullets[2] || '',
    bullet_4: bullets[3] || '',
    bullet_5: bullets[4] || '',
    description,
    search_terms: searchTerms,
    issues: issues.join(' | '),
    status: blocking.length ? 'Needs review' : 'Ready for approval',
  },
}];
