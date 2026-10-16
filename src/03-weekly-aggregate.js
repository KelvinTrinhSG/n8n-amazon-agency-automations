// Combines leads, Amazon sales and listing activity into one weekly KPI summary.
// Compares the last 7 days with the 7 days before (week-over-week).
const DAY = 24 * 60 * 60 * 1000;
const rows = (nodeName) => $(nodeName).all().map((i) => i.json).filter((r) => Object.keys(r).length);
const toDate = (v) => { const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; };
const num = (v) => Number(String(v ?? '').replace(/[$,]/g, '')) || 0;
const fmtMoney = (v) => `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const fmtDate = (d) => d.toISOString().slice(0, 10);
const pctChange = (cur, prev) => (prev ? Math.round(((cur - prev) / prev) * 1000) / 10 : null);
const fmtPct = (p) => (p === null ? 'n/a' : `${p > 0 ? '▲' : p < 0 ? '▼' : '•'} ${Math.abs(p)}%`);

const leads = rows('Read Leads');
const sales = rows('Read Sales');
const listings = rows('Read Listings');

// Reporting window = the 7 full days before today. With demo data older than a week, anchor to the latest sales date.
let end = new Date(new Date().toISOString().slice(0, 10));
const latestSale = sales.map((r) => toDate(r.date)).filter(Boolean).sort((a, b) => b - a)[0];
const isDemoData = Boolean(latestSale && end - latestSale > 7 * DAY);
if (isDemoData) end = new Date(latestSale.getTime() + DAY);
const start = new Date(end - 7 * DAY);
const prevStart = new Date(end - 14 * DAY);

const inWindow = (value, from, to) => { const d = toDate(value); return d && d >= from && d < to; };
const thisWeek = (list, field) => list.filter((r) => inWindow(r[field], start, end));
const lastWeek = (list, field) => list.filter((r) => inWindow(r[field], prevStart, start));

// Leads
const leadsNow = thisWeek(leads, 'created_at');
const leadsPrev = lastWeek(leads, 'created_at');
const hotLeads = leadsNow.filter((l) => num(l.lead_score) >= 7);
const leadsBySource = leadsNow.reduce((acc, l) => { acc[l.source || 'Unknown'] = (acc[l.source || 'Unknown'] || 0) + 1; return acc; }, {});

// Sales
const salesNow = thisWeek(sales, 'date');
const salesPrev = lastWeek(sales, 'date');
const revenueNow = salesNow.reduce((s, r) => s + num(r.revenue), 0);
const revenuePrev = salesPrev.reduce((s, r) => s + num(r.revenue), 0);
const unitsNow = salesNow.reduce((s, r) => s + num(r.units), 0);
const unitsPrev = salesPrev.reduce((s, r) => s + num(r.units), 0);

const byProduct = {};
for (const r of salesNow) {
  const key = r.asin || r.product;
  byProduct[key] ??= { asin: r.asin, product: r.product, revenue: 0, units: 0, prevRevenue: 0 };
  byProduct[key].revenue += num(r.revenue);
  byProduct[key].units += num(r.units);
}
for (const r of salesPrev) {
  const key = r.asin || r.product;
  if (byProduct[key]) byProduct[key].prevRevenue += num(r.revenue);
}
const topProducts = Object.values(byProduct).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
const decliners = Object.values(byProduct).filter((p) => p.prevRevenue && pctChange(p.revenue, p.prevRevenue) <= -20);

// Listings
const listingsNow = thisWeek(listings, 'created_at');
const listingsNeedReview = listingsNow.filter((l) => l.status === 'Needs review');

const kpi = {
  week_start: fmtDate(start),
  week_end: fmtDate(new Date(end - DAY)),
  new_leads: leadsNow.length,
  new_leads_wow_pct: pctChange(leadsNow.length, leadsPrev.length) ?? '',
  hot_leads: hotLeads.length,
  revenue: Math.round(revenueNow * 100) / 100,
  revenue_wow_pct: pctChange(revenueNow, revenuePrev) ?? '',
  units: unitsNow,
  units_wow_pct: pctChange(unitsNow, unitsPrev) ?? '',
  listings_generated: listingsNow.length,
  listings_need_review: listingsNeedReview.length,
  generated_at: new Date().toISOString(),
};

const period = `${kpi.week_start} → ${kpi.week_end}`;
const demoNote = isDemoData ? ' (demo data)' : '';

const slackText = [
  `📊 *Weekly Report ${period}*${demoNote}`,
  `*Revenue:* ${fmtMoney(revenueNow)} (${fmtPct(kpi.revenue_wow_pct === '' ? null : kpi.revenue_wow_pct)} WoW) · *Units:* ${unitsNow} (${fmtPct(kpi.units_wow_pct === '' ? null : kpi.units_wow_pct)})`,
  `*New leads:* ${leadsNow.length} (${fmtPct(kpi.new_leads_wow_pct === '' ? null : kpi.new_leads_wow_pct)}) · *Hot leads:* ${hotLeads.length}`,
  `*Listings drafted:* ${listingsNow.length} · *Need review:* ${listingsNeedReview.length}`,
  '*Top products:*',
  ...topProducts.map((p, i) => `${i + 1}. ${p.product} (${p.asin}) — ${fmtMoney(p.revenue)}, ${p.units} units, ${fmtPct(pctChange(p.revenue, p.prevRevenue))}`),
  ...(decliners.length ? [`⚠️ *Down 20%+ WoW:* ${decliners.map((p) => p.product).join(', ')}`] : []),
  ...(hotLeads.length ? ['*Hot leads to follow up:*', ...hotLeads.map((l) => `• ${l.company} — ${l.name} (${l.lead_score}/10)`)] : []),
].join('\n');

const td = 'style="padding:6px 10px;border-bottom:1px solid #eee"';
const card = (label, value, change) => `
  <td style="padding:12px;background:#f6f8fa;border-radius:8px;text-align:center">
    <div style="color:#666;font-size:12px">${label}</div>
    <div style="font-size:22px;font-weight:bold">${value}</div>
    <div style="font-size:12px;color:${change === null ? '#666' : change >= 0 ? '#1a7f37' : '#cf222e'}">${fmtPct(change)} WoW</div>
  </td>`;

const html = `
<div style="font-family:Arial,sans-serif;max-width:640px;color:#222">
  <h2 style="margin-bottom:4px">📊 Weekly Report</h2>
  <div style="color:#666;margin-bottom:16px">${period}${demoNote}</div>
  <table cellspacing="8" style="width:100%"><tr>
    ${card('Revenue', fmtMoney(revenueNow), pctChange(revenueNow, revenuePrev))}
    ${card('Units', unitsNow, pctChange(unitsNow, unitsPrev))}
    ${card('New leads', leadsNow.length, pctChange(leadsNow.length, leadsPrev.length))}
  </tr></table>
  <p><b>Hot leads:</b> ${hotLeads.length} · <b>Listings drafted:</b> ${listingsNow.length} (${listingsNeedReview.length} need review)</p>
  <h3>Top products</h3>
  <table style="border-collapse:collapse;width:100%;font-size:14px">
    <tr style="background:#f6f8fa"><th ${td} align="left">Product</th><th ${td} align="right">Revenue</th><th ${td} align="right">Units</th><th ${td} align="right">WoW</th></tr>
    ${topProducts.map((p) => `<tr><td ${td}>${p.product}<br><span style="color:#888;font-size:12px">${p.asin}</span></td><td ${td} align="right">${fmtMoney(p.revenue)}</td><td ${td} align="right">${p.units}</td><td ${td} align="right">${fmtPct(pctChange(p.revenue, p.prevRevenue))}</td></tr>`).join('')}
  </table>
  ${decliners.length ? `<p style="color:#cf222e">⚠️ Down 20%+ week-over-week: ${decliners.map((p) => p.product).join(', ')}</p>` : ''}
  <h3>Leads by source</h3>
  <p>${Object.entries(leadsBySource).map(([s, c]) => `${s}: <b>${c}</b>`).join(' · ') || 'No new leads this week'}</p>
  ${hotLeads.length ? `<h3>Hot leads to follow up</h3><ul>${hotLeads.map((l) => `<li>${l.company} — ${l.name} (${l.lead_score}/10): ${l.summary}</li>`).join('')}</ul>` : ''}
  <p style="color:#888;font-size:12px">Generated automatically by n8n · Sources: Leads, Sales, Listings sheets</p>
</div>`;

return [{ json: { kpi, slackText, html, subject: `Weekly Report ${period}: ${fmtMoney(revenueNow)} revenue, ${leadsNow.length} new leads` } }];
