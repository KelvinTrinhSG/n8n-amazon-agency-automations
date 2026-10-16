// Generates demo CSVs (last 14 days) to import into the Google Sheet tabs: Leads, Sales, Listings, Weekly KPIs.
// Values are deterministic so the demo looks the same every time; only the dates move with "today".
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'sample-data');
fs.mkdirSync(outDir, { recursive: true });

const DAY = 24 * 60 * 60 * 1000;
const today = new Date(new Date().toISOString().slice(0, 10));
const daysAgo = (n, hour = 10) => new Date(today - n * DAY + hour * 60 * 60 * 1000);
const csv = (rows) => {
  const headers = Object.keys(rows[0]);
  const esc = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h] ?? '')).join(','))].join('\n') + '\n';
};
const write = (file, rows) => { fs.writeFileSync(path.join(outDir, file), csv(rows)); console.log(`sample-data/${file} (${rows.length} rows)`); };

// Sales: 4 products x 14 days. This week trends up for most products, one product drops (to show the alert).
const products = [
  { asin: 'B0CX1K9V2L', product: 'Bamboo Cutting Board Set', price: 34.99, base: 22, trend: 1.12 },
  { asin: 'B0D4M7QZ8P', product: 'Stainless Steel Pet Bowl', price: 19.99, base: 35, trend: 1.05 },
  { asin: 'B0BT6R3N1W', product: 'Silicone Baking Mat (2-Pack)', price: 15.99, base: 41, trend: 0.72 },
  { asin: 'B0C9H2J5X7', product: 'Glass Meal Prep Containers', price: 39.99, base: 14, trend: 1.2 },
];
const sales = [];
for (let d = 14; d >= 1; d--) {
  for (const [i, p] of products.entries()) {
    const wobble = 0.85 + (((d * 7 + i * 13) % 10) / 33);
    const units = Math.round(p.base * wobble * (d <= 7 ? p.trend : 1));
    sales.push({ date: daysAgo(d, 0).toISOString().slice(0, 10), asin: p.asin, product: p.product, units, revenue: (units * p.price).toFixed(2) });
  }
}
write('Sales.csv', sales);

const leadRows = [
  [12, 'Maria Lopez', 'maria@greenleafkitchen.com', 'GreenLeaf Kitchen', '$50k–$250k', 'Google', 'Kitchen', 'Full account management', 8, 'Established brand with solid revenue wanting full management.', 'Kitchenware brand doing ~$120k/mo, wants an agency to take over PPC and listings.'],
  [10, 'Tom Becker', 'tom@pawsome.co', 'Pawsome Co', '$10k–$50k', 'Referral', 'Pet supplies', 'PPC/Advertising', 6, 'Mid-size, clear PPC need, budget unclear.', 'Pet brand with rising ACoS, needs PPC restructure.'],
  [9, 'Jin Park', 'jin@lumahome.com', 'Luma Home', 'Not selling yet', 'LinkedIn', 'Home decor', 'Product launch', 4, 'Pre-launch, no revenue yet but clear plan.', 'Launching first 3 SKUs next quarter, needs launch strategy.'],
  [5, 'Sarah Chen', 'sarah@purebloomskin.com', 'PureBloom Skin', '$250k+', 'Google', 'Beauty', 'Full account management', 9, 'Large brand, urgent need after agency churn.', 'Skincare brand at $300k/mo leaving current agency, wants to start in 2 weeks.'],
  [4, 'David Miller', 'david@trailforge.com', 'TrailForge Outdoors', '$50k–$250k', 'Amazon/Seller forum', 'Outdoor gear', 'Listing optimization', 7, 'Good revenue, specific listing optimization project.', 'Outdoor brand wants 25 listings rewritten before Q4.'],
  [3, 'Aisha Khan', 'aisha@nestbaby.com', 'Nest Baby', '$10k–$50k', 'Referral', 'Baby products', 'PPC/Advertising', 6, 'Growing brand, clear PPC need.', 'Baby products brand wants help scaling ads profitably.'],
  [2, 'Mark Evans', 'mark@gmail.com', 'Evans Trading', '< $10k', 'Other', 'Unknown', 'Other', 2, 'Very small, vague request.', 'Asked about "selling on Amazon" with no product details.'],
  [1, 'Elena Rossi', 'elena@cucinaviva.com', 'Cucina Viva', '$50k–$250k', 'Google', 'Kitchen', 'Wholesale/Distribution', 8, 'Strong brand looking for distribution partner.', 'Italian cookware brand wants a US Amazon distribution partner.'],
];
write('Leads.csv', leadRows.map(([d, name, email, company, rev, source, cat, need, score, reason, summary], i) => ({
  created_at: daysAgo(d, 9 + i).toISOString(),
  lead_id: `L-DEMO${i + 1}`,
  name, email, company, amazon_store: '', monthly_revenue: rev, source, message: summary,
  brand_category: cat, main_need: need, lead_score: score, score_reason: reason, summary, ai_status: 'ok',
})));

write('Listings.csv', [
  { d: 11, product_name: 'Bamboo Cutting Board Set', brand: 'GreenLeaf', status: 'Ready for approval', issues: '' },
  { d: 4, product_name: 'Glass Meal Prep Containers', brand: 'GreenLeaf', status: 'Ready for approval', issues: 'Search terms trimmed to 249 bytes' },
  { d: 2, product_name: 'Stainless Steel Pet Bowl', brand: 'Pawsome', status: 'Needs review', issues: 'Banned/risky words: non-toxic' },
].map(({ d, ...l }) => ({
  created_at: daysAgo(d).toISOString(), product_name: l.product_name, brand: l.brand, category: 'Home & Kitchen',
  title: `${l.brand} ${l.product_name}`, bullet_1: '', bullet_2: '', bullet_3: '', bullet_4: '', bullet_5: '',
  description: '', search_terms: '', issues: l.issues, status: l.status,
})));

fs.writeFileSync(path.join(outDir, 'Weekly KPIs.csv'),
  'week_start,week_end,new_leads,new_leads_wow_pct,hot_leads,revenue,revenue_wow_pct,units,units_wow_pct,listings_generated,listings_need_review,generated_at\n');
console.log('sample-data/Weekly KPIs.csv (headers only)');
