/**
 * Dynamic Sitemap Generator
 *
 * - Tries to load pages from `server/db.js` if available (recommended).
 * - Falls back to reading existing sitemap or HTTP fetch to build lastmod values.
 * - Classifies page types and assigns dynamic priority and changefreq.
 * - Produces valid sitemap XML without unused namespaces.
 * - Exposes `generateSitemap()` and `expressMiddleware()` for serving `/sitemap.xml`.
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { Builder, parseStringPromise } = require('xml2js');

const DEFAULT_SITEMAP_PATH = path.join(__dirname, '..', '..', 'sitemap.xml');

let db = null;
try {
  db = require('../../db');
  console.log('dynamicSitemapGenerator: DB module found — will query pages from DB when available.');
} catch (e) {
  db = null;
}

function isoSafe(v) {
  if (!v) return null;
  try {
    const d = new Date(v);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch (e) {
    return null;
  }
}

function detectType(url) {
  try {
    const u = new URL(url);
    const p = u.pathname.toLowerCase();
    if (p === '/' || p === '') return 'homepage';
    if (p.includes('/privacy') || p.includes('/terms') || p.includes('/policy')) return 'legal';
    if (p.includes('/contact') || p.includes('/inquiry') || p.includes('/lead')) return 'landing';
    if (p.includes('/services') || p.includes('/service')) return 'landing';
    if (p.includes('/software') || p.includes('/product') || p.includes('/products')) return 'product';
    if (p.includes('/blog') || p.includes('/post') || p.includes('/article')) return 'blog';
    if (p.includes('/category') || p.includes('/categories') || p.includes('/tag')) return 'category';
    if (p.includes('/job') || p.includes('/jobs') || p.includes('/career')) return 'job';
    return 'other';
  } catch (e) {
    return 'other';
  }
}

function basePriority(type) {
  const map = {
    homepage: 1.0,
    landing: 0.9,
    product: 0.8,
    blog: 0.7,
    category: 0.6,
    job: 0.6,
    legal: 0.5,
    other: 0.5
  };
  return map[type] !== undefined ? map[type] : 0.5;
}

function changefreq(type) {
  const map = {
    homepage: 'weekly',
    landing: 'monthly',
    product: 'weekly',
    blog: 'monthly',
    category: 'monthly',
    job: 'weekly',
    legal: 'yearly',
    other: 'monthly'
  };
  return map[type] || 'monthly';
}

async function fetchLastModifiedHttp(url) {
  try {
    // HEAD first
    const h = await axios.head(url, { timeout: 6000, maxRedirects: 5, validateStatus: s => s < 400 });
    const lm = h.headers['last-modified'] || h.headers['last_modified'];
    if (lm) return isoSafe(lm);

    // GET fallback for meta tags
    const g = await axios.get(url, { timeout: 8000, maxRedirects: 5 });
    const html = g.data;
    const meta = html.match(/<meta[^>]+property=["'](?:article:modified_time|og:updated_time)["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+name=["'](?:last-modified|modified)["'][^>]*content=["']([^"']+)["']/i);
    if (meta && meta[1]) return isoSafe(meta[1]);
    const timeMatch = html.match(/<time[^>]+datetime=["']([^"']+)["']/i);
    if (timeMatch && timeMatch[1]) return isoSafe(timeMatch[1]);
    return null;
  } catch (e) {
    return null;
  }
}

async function loadPagesFromDb() {
  // Expect DB helper to expose `getAllPages()` or `query()` — adapt as needed for your app
  if (!db) return null;
  try {
    if (typeof db.getAllPages === 'function') {
      // should return array of { url, last_updated, type? }
      const rows = await db.getAllPages();
      return rows.map(r => ({ loc: r.url || r.loc, lastmod: r.updated_at || r.lastmod || r.updatedAt || r.updated_at }));
    }
    if (typeof db.query === 'function') {
      // Try common schema `pages` table
      const rows = await db.query('SELECT url, updated_at FROM pages WHERE published = 1');
      if (rows && rows.length) return rows.map(r => ({ loc: r.url, lastmod: r.updated_at }));
    }
  } catch (e) {
    console.warn('dynamicSitemapGenerator: DB lookup failed —', e.message);
  }
  return null;
}

async function loadUrlsFromExistingSitemap(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const xml = fs.readFileSync(filePath, 'utf8');
    const parsed = await parseStringPromise(xml);
    const urlset = parsed.urlset || parsed['urlset'];
    if (!urlset || !urlset.url) return [];
    return urlset.url.map(u => ({ loc: u.loc && u.loc[0], lastmod: u.lastmod && u.lastmod[0] }));
  } catch (e) {
    return [];
  }
}

async function generateSitemap(options = {}) {
  const {
    outputPath = DEFAULT_SITEMAP_PATH,
    sourceSitemap = DEFAULT_SITEMAP_PATH,
    writeFile = true,
    fetchMissingLastmod = true,
    recencyDaysForRecent = 30
  } = options;

  // 1) Load pages from DB if possible
  let pages = await loadPagesFromDb();

  // 2) If DB not available, load from existing sitemap
  if (!pages || pages.length === 0) {
    pages = await loadUrlsFromExistingSitemap(sourceSitemap);
  }

  // 3) Normalize and enrich
  const enriched = [];
  for (const p of pages) {
    if (!p || !p.loc) continue;
    const loc = p.loc;
    let lastmod = isoSafe(p.lastmod) || null;
    let type = detectType(loc);
    if (!lastmod && fetchMissingLastmod) {
      lastmod = await fetchLastModifiedHttp(loc);
    }
    // If still no lastmod and homepage -> use now
    if (!lastmod && type === 'homepage') lastmod = new Date().toISOString();

    // Priority: bump recent blog posts to 0.9 if updated recently
    let priority = basePriority(type);
    if (type === 'blog' && lastmod) {
      const ageDays = (Date.now() - new Date(lastmod).getTime()) / (1000 * 60 * 60 * 24);
      if (ageDays <= recencyDaysForRecent) priority = Math.max(priority, 0.9);
    }

    // Ensure priority numeric and one decimal
    priority = Math.max(0.1, Math.min(1.0, parseFloat(priority.toFixed(1))));

    const cf = changefreq(type);

    enriched.push({ loc, lastmod, priority: priority.toFixed(1), changefreq: cf, type });
  }

  // Deduplicate preserving order
  const seen = new Set();
  const deduped = [];
  for (const e of enriched) {
    try {
      const n = new URL(e.loc).href;
      if (seen.has(n)) continue;
      seen.add(n);
      deduped.push({ ...e, loc: n });
    } catch (e) { /* skip invalid */ }
  }

  // Build XML without news namespace unless present
  const urlElements = deduped.map(u => {
    const o = {};
    o.loc = u.loc;
    if (u.lastmod) o.lastmod = u.lastmod;
    if (u.changefreq) o.changefreq = u.changefreq;
    if (u.priority !== undefined && u.priority !== null) o.priority = u.priority.toString();
    return o;
  });

  const obj = { urlset: { $: { xmlns: 'http://www.sitemaps.org/schemas/sitemap/0.9' }, url: urlElements } };
  const builder = new Builder({ xmldec: { version: '1.0', encoding: 'UTF-8' } });
  const xml = builder.buildObject(obj);

  if (writeFile) fs.writeFileSync(outputPath, xml, 'utf8');

  const audit = {
    generatedAt: new Date().toISOString(),
    totalUrls: deduped.length,
    byType: deduped.reduce((acc, cur) => { acc[cur.type] = (acc[cur.type] || 0) + 1; return acc; }, {}),
    sample: deduped.slice(0, 10)
  };

  return { xml, audit, urls: deduped };
}

// Express middleware to serve /sitemap.xml dynamically
function expressMiddleware(opts = {}) {
  return async (req, res, next) => {
    try {
      const result = await generateSitemap({ writeFile: false, ...opts });
      res.set('Content-Type', 'application/xml');
      res.send(result.xml);
    } catch (e) {
      next(e);
    }
  };
}

module.exports = { generateSitemap, expressMiddleware, detectType };
