#!/usr/bin/env node
/**
 * generate_dynamic_sitemap.js
 *
 * Standalone sitemap generator that:
 * - Loads pages from a JSON file or an input sitemap XML
 * - Attempts to fetch real lastmod via HTTP HEAD/GET
 * - Detects page types from URLs
 * - Assigns dynamic priority and changefreq
 * - Produces valid sitemap XML and a JSON audit
 *
 * Usage:
 *  node generate_dynamic_sitemap.js --input pages.json --output ../sitemap.xml --audit ../sitemap_audit.json
 *  node generate_dynamic_sitemap.js --sitemap input_sitemap.xml --output ../sitemap.xml
 *
 * Notes:
 * - The script uses HTTP HEAD/GET for Last-Modified and falls back to best-effort timestamps.
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { parseStringPromise, Builder } = require('xml2js');

const argv = require('minimist')(process.argv.slice(2));

const DEFAULT_OUTPUT = argv.output || path.join(__dirname, '..', 'sitemap.xml');
const DEFAULT_AUDIT = argv.audit || path.join(__dirname, '..', 'sitemap_audit.json');
const INPUT_JSON = argv.input || null;
const INPUT_SITEMAP = argv.sitemap || null;
const CONCURRENT = parseInt(argv.concurrent, 10) || 8;

function isoNow() {
  return new Date().toISOString();
}

function safeIso(date) {
  if (!date) return null;
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch (e) {
    return null;
  }
}

function detectPageType(url) {
  try {
    const u = new URL(url);
    const p = u.pathname.toLowerCase();
    const parts = p.split('/').filter(Boolean);

    if (p === '/' || p === '') return 'homepage';
    if (p.includes('/privacy') || p.includes('/terms') || p.includes('/policy')) return 'legal';
    if (p.includes('/contact') || p.includes('/inquiry')) return 'landing';
    if (p.includes('/services') || p.includes('/service') || p.includes('/landing')) return 'landing';
    if (p.includes('/software') || p.includes('/product') || p.includes('/products')) return 'product';
    if (p.includes('/blog') || p.includes('/post') || p.includes('/article')) {
      // blog index vs post
      if (parts.length <= 2 && (parts[0] === 'blog' || parts[0] === 'articles')) return 'blog_index';
      return 'blog';
    }
    if (p.includes('/job') || p.includes('/jobs') || p.includes('/career')) return 'job';

    // Heuristic: single-segment pages at root often core landing pages
    if (parts.length === 1) return 'landing';

    return 'other';
  } catch (e) {
    return 'other';
  }
}

function priorityForType(type, depth = 0) {
  const base = {
    homepage: 1.0,
    landing: 0.9,
    product: 0.8,
    blog: 0.7,
    blog_index: 0.65,
    job: 0.6,
    legal: 0.5,
    other: 0.5
  };

  let p = base[type] !== undefined ? base[type] : base.other;
  // reduce for deeper paths: subtract 0.05 per level beyond 2
  const reduce = Math.max(0, depth - 2) * 0.05;
  p = Math.max(0.1, p - reduce);
  return parseFloat(p.toFixed(1));
}

function changefreqForType(type) {
  const map = {
    homepage: 'weekly',
    landing: 'monthly',
    product: 'weekly',
    blog: 'monthly',
    blog_index: 'monthly',
    job: 'weekly',
    legal: 'yearly',
    other: 'monthly'
  };
  return map[type] || 'monthly';
}

async function fetchLastModViaHttp(url) {
  try {
    // First try HEAD
    const head = await axios.head(url, { timeout: 5000, maxRedirects: 5, validateStatus: s => s < 400 });
    const lm = head.headers['last-modified'] || head.headers['last_modified'];
    if (lm) return safeIso(lm);

    // Fallback to GET and look for meta tags like article:modified_time or a <time> tag
    const get = await axios.get(url, { timeout: 8000, maxRedirects: 5 });
    const html = get.data;
    // quick regexes for common meta properties
    const metaMatch = html.match(/<meta[^>]+property=["'](?:article:modified_time|og:updated_time|og:updated)["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+name=["'](?:last-modified|modified)["'][^>]*content=["']([^"']+)["']/i);
    if (metaMatch && metaMatch[1]) return safeIso(metaMatch[1]);

    // fallback scan for <time datetime="...">
    const timeMatch = html.match(/<time[^>]+datetime=["']([^"']+)["']/i);
    if (timeMatch && timeMatch[1]) return safeIso(timeMatch[1]);

    return null;
  } catch (e) {
    return null;
  }
}

async function getLastMod(url, inputLastmod = null, type = 'other', opts = {}) {
  // 1) If input lastmod exists and is valid ISO, use it
  const valid = safeIso(inputLastmod);
  if (valid) return valid;

  // 2) Try HTTP HEAD/GET
  const httpLm = await fetchLastModViaHttp(url);
  if (httpLm) return httpLm;

  // 3) For homepage or types likely to change, use now; otherwise leave null
  if (type === 'homepage') return isoNow();

  // 4) fallback null and let generator choose to include now or skip
  return null;
}

async function loadUrlsFromSitemap(filePath) {
  const xml = fs.readFileSync(filePath, 'utf8');
  const parsed = await parseStringPromise(xml);
  const urlset = parsed.urlset || parsed.urlSet || parsed['urlset'];
  if (!urlset || !urlset.url) return [];
  return urlset.url.map(u => ({ loc: (u.loc && u.loc[0]) || null, lastmod: (u.lastmod && u.lastmod[0]) || null }));
}

async function loadPagesFromJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const obj = JSON.parse(raw);
  // Expect array of { url:.. } or { loc:.. }
  if (!Array.isArray(obj)) {
    throw new Error('Input JSON must be an array of page objects or strings');
  }
  return obj.map(i => {
    if (typeof i === 'string') return { loc: i };
    return { loc: i.loc || i.url || i.loc, lastmod: i.lastmod };
  });
}

async function gatherInputUrls() {
  if (INPUT_JSON) return loadPagesFromJson(INPUT_JSON);
  if (INPUT_SITEMAP) return loadUrlsFromSitemap(INPUT_SITEMAP);
  // Fallback: try to find existing sitemap in project root
  const candidate = path.join(__dirname, '..', 'sitemap.xml');
  if (fs.existsSync(candidate)) return loadUrlsFromSitemap(candidate);
  throw new Error('No input provided. Use --input pages.json or --sitemap input.xml');
}

async function generateFromUrls(rawPages, opts = {}) {
  const options = Object.assign({ writeFiles: false, output: DEFAULT_OUTPUT, audit: DEFAULT_AUDIT, concurrent: CONCURRENT }, opts);

  const results = [];
  const audit = { total: rawPages.length, byType: {}, missingLastmod: 0, overwrittenLastmod: 0 };

  // process in batches
  const queue = [...rawPages];
  const workers = new Array(options.concurrent).fill(null).map(() => (async () => {
    while (queue.length) {
      const item = queue.shift();
      if (!item || !item.loc) continue;
      const loc = item.loc;
      const type = detectPageType(loc);
      const depth = new URL(loc).pathname.split('/').filter(Boolean).length;
      const lastmod = await getLastMod(loc, item.lastmod, type);
      const priority = priorityForType(type, depth);
      const changefreq = changefreqForType(type);

      if (!audit.byType[type]) audit.byType[type] = 0;
      audit.byType[type]++;
      if (!lastmod) audit.missingLastmod++;

      results.push({ loc, lastmod: lastmod || isoNow(), changefreq, priority: priority.toFixed(1), type });
    }
  })());

  await Promise.all(workers);

  // Build XML via xml2js.Builder
  const urlObjs = results.map(r => {
    const o = {};
    o.loc = r.loc;
    if (r.lastmod) o.lastmod = r.lastmod;
    if (r.changefreq) o.changefreq = r.changefreq;
    if (r.priority !== undefined && r.priority !== null) o.priority = r.priority.toString();
    return o;
  });

  const builder = new Builder({ headless: false, xmldec: { version: '1.0', encoding: 'UTF-8' } });
  const obj = {
    urlset: {
      $: { xmlns: 'http://www.sitemaps.org/schemas/sitemap/0.9' },
      url: urlObjs
    }
  };

  const xml = builder.buildObject(obj);

  if (options.writeFiles) {
    fs.writeFileSync(options.output, xml, 'utf8');
    fs.writeFileSync(options.audit, JSON.stringify({ generatedAt: isoNow(), total: results.length, distribution: audit.byType, missingLastmod: audit.missingLastmod }, null, 2), 'utf8');
  }

  return { xml, audit: { generatedAt: isoNow(), total: results.length, distribution: audit.byType, missingLastmod: audit.missingLastmod }, results };
}

// CLI entrypoint
if (require.main === module) {
  (async ()=>{
    try {
      console.log('Loading input pages...');
      const rawPages = await gatherInputUrls();
      console.log(`Loaded ${rawPages.length} items`);
      const out = await generateFromUrls(rawPages, { writeFiles: true, output: DEFAULT_OUTPUT, audit: DEFAULT_AUDIT, concurrent: CONCURRENT });
      console.log('Sitemap written to', DEFAULT_OUTPUT);
      console.log('Audit written to', DEFAULT_AUDIT);
      console.log('Generation complete');
      process.exit(0);
    } catch (e) {
      console.error('Error generating sitemap:', e && e.stack ? e.stack : e.message);
      process.exit(2);
    }
  })();
}

module.exports = { generateFromUrls, loadPagesFromJson, loadUrlsFromSitemap, detectPageType, priorityForType, changefreqForType };
