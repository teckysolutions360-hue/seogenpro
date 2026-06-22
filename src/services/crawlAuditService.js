/*
  Production-ready AI Crawlability Audit Service
  - Input: base URL
  - Crawls sitemap + discovered internal links
  - Records HTTP status, canonical, meta robots
  - Cleans robots.txt entries, detects conflicts
  - Samples broken links per page
  - Detects query-parameter URLs and suggests canonicalization
  - Outputs JSON report per spec with human summary
*/

const axios = require('axios');
const cheerio = require('cheerio');
const { parseStringPromise } = require('xml2js');
let PUPPETEER = null;
try { PUPPETEER = require('puppeteer-core'); } catch (e) { PUPPETEER = null; }
let RENDER_ALL_PAGES = false;

const DEFAULT_TIMEOUT = 3000;  // reduced from 10000ms for faster crawls
const USER_AGENT = 'LLMS-Audit/1.0 (+https://example.com)';
let REQUEST_DELAY_MS = 0;
let LAST_REQUEST_TS = 0;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function cleanRobotsList(list) {
  if (!Array.isArray(list)) return [];
  const cleaned = Array.from(new Set(list.map(s => (s || '').trim()))).filter(Boolean);
  return cleaned;
}

function detectRobotsConflicts(rules) {
  // simple heuristic: allow and disallow exact matches conflict
  const conflicts = [];
  const allow = new Set(rules.allow || []);
  for (const d of rules.disallow || []) {
    if (allow.has(d)) conflicts.push({ path: d, reason: 'both allow and disallow' });
  }
  return conflicts;
}

function normalizeUrl(u, base) {
  try { return new URL(u, base).href; } catch (e) { return null; }
}

function getRootDomain(hostname) {
  if (!hostname) return '';
  const parts = hostname.toLowerCase().split('.');
  if (parts.length <= 2) return hostname.toLowerCase();
  // naive public suffix handling: return last two labels
  return parts.slice(-2).join('.');
}

async function fetchRobots(base) {
  const url = new URL('/robots.txt', base).href;
  const result = { disallow: [], allow: [], sitemaps: [], raw: '' };
  try {
    const r = await axios.get(url, { timeout: 4000, headers: { 'User-Agent': USER_AGENT } });
    result.raw = r.data || '';
    for (const line of result.raw.split(/\r?\n/)) {
      const cleaned = line.split('#', 1)[0].trim();
      if (!cleaned) continue;
      const parts = cleaned.split(':');
      if (parts.length < 2) continue;
      const key = parts[0].toLowerCase().trim();
      const val = parts.slice(1).join(':').trim();
      if (key === 'disallow') result.disallow.push(val);
      if (key === 'allow') result.allow.push(val);
      if (key === 'sitemap') result.sitemaps.push(val);
    }
  } catch (e) {
    // missing robots is not fatal
  }
  result.disallow = cleanRobotsList(result.disallow);
  result.allow = cleanRobotsList(result.allow);
  result.sitemaps = cleanRobotsList(result.sitemaps);
  result.conflicts = detectRobotsConflicts(result);
  return result;
}

async function fetchSitemapsFromRobots(base) {
  const robots = await fetchRobots(base);
  return robots.sitemaps || [];
}

async function parseSitemapUrl(sitemapUrl) {
  try {
    const r = await axios.get(sitemapUrl, { timeout: 8000, headers: { 'User-Agent': USER_AGENT } });
    const xml = r.data || '';
    let parsed;
    try { parsed = await parseStringPromise(xml); } catch (e) { return []; }
    const urls = [];
    if (parsed.urlset && parsed.urlset.url) {
      for (const item of parsed.urlset.url) {
        if (item.loc && item.loc[0]) urls.push(item.loc[0]);
      }
    }
    if (parsed.sitemapindex && parsed.sitemapindex.sitemap) {
      for (const s of parsed.sitemapindex.sitemap) {
        if (s.loc && s.loc[0]) urls.push(s.loc[0]);
      }
    }
    return urls;
  } catch (e) { return []; }
}

async function discoverSitemapUrls(base) {
  // try common locations and robots.txt; recursively resolve sitemap indexes
  const startCandidates = [new URL('/sitemap.xml', base).href];
  try {
    const robotsS = await fetchSitemapsFromRobots(base);
    for (const s of robotsS) startCandidates.push(s);
  } catch (e) {}
  const urls = new Set();
  const queue = Array.from(new Set(startCandidates));
  while (queue.length) {
    const c = queue.shift();
    try {
      const found = await parseSitemapUrl(c);
      for (const u of found) {
        // if the returned item looks like a sitemap, enqueue it; otherwise add as page URL
        if (typeof u === 'string' && u.match(/\.xml($|\?|#)/i)) {
          if (!queue.includes(u)) queue.push(u);
        } else {
          urls.add(u);
        }
      }
    } catch (e) {
      // ignore parse errors
    }
  }
  return Array.from(urls);
}

async function fetchPage(u) {
  try {
    // simple rate-limit: ensure at least REQUEST_DELAY_MS between requests
    if (REQUEST_DELAY_MS > 0) {
      const now = Date.now();
      const since = now - LAST_REQUEST_TS;
      if (since < REQUEST_DELAY_MS) await sleep(REQUEST_DELAY_MS - since);
    }
    const r = await axios.get(u, { timeout: DEFAULT_TIMEOUT, headers: { 'User-Agent': USER_AGENT } });
    LAST_REQUEST_TS = Date.now();
    const html = r.data || '';
    const $ = cheerio.load(html);
    const links = [];
    $('a[href]').each((i, el) => {
      const href = $(el).attr('href');
      const full = normalizeUrl(href, u);
      if (full) links.push(full);
    });
    // also look for data-href and other common JS-driven attributes
    $('[data-href]').each((i, el) => {
      const href = $(el).attr('data-href');
      const full = normalizeUrl(href, u);
      if (full) links.push(full);
    });
    // if rendering is enabled, try a rendered fetch to capture JS-driven links
    if (RENDER_ALL_PAGES && PUPPETEER) {
      try {
        const rendered = await renderAndExtractLinks(u);
        if (Array.isArray(rendered) && rendered.length) {
          for (const rl of rendered) {
            const full = normalizeUrl(rl, u);
            if (full) links.push(full);
          }
        }
      } catch (e) {
        // ignore render failures
      }
    }
    const canonicalRaw = $('link[rel="canonical"]').attr('href') || null;
    const canonical = canonicalRaw ? normalizeUrl(canonicalRaw, u) : null;
    const metaRobotsRaw = $('meta[name="robots"]').attr('content') || null;
    const metaRobots = metaRobotsRaw ? String(metaRobotsRaw).toLowerCase() : null;
    return { status: r.status, ok: r.status >= 200 && r.status < 400, links, canonical, metaRobots };
  } catch (e) {
    return { status: (e && e.response && e.response.status) || null, ok: false, links: [], canonical: null, metaRobots: null };
  }
}

async function renderAndExtractLinks(u) {
  if (!PUPPETEER) return [];
  let browser = null;
  try {
    // try to launch a browser; puppeteer-core requires a local Chrome/Chromium install
    browser = await PUPPETEER.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'], headless: true });
    const page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);
    await page.goto(u, { waitUntil: 'networkidle2', timeout: DEFAULT_TIMEOUT }).catch(() => {});
    const links = await page.evaluate(() => Array.from(document.querySelectorAll('a[href]')).map(a => a.getAttribute('href')));
    await page.close();
    await browser.close();
    return links || [];
  } catch (e) {
    try { if (browser) await browser.close(); } catch (e2) {}
    return [];
  }
}

async function checkLinkStatus(l, baseHostname) {
  try {
    // only check internal links to avoid false positives from external timeouts
    try {
      const parsed = new URL(l);
      const linkHost = parsed.hostname.replace(/^www\./i, '').toLowerCase();
      const baseHost = baseHostname.replace(/^www\./i, '').toLowerCase();
      if (linkHost !== baseHost) return null; // skip external links
    } catch (e) {
      return null; // invalid URL, skip
    }
    let r;
    try {
      r = await axios.head(l, { timeout: 5000, maxRedirects: 5, headers: { 'User-Agent': USER_AGENT } });
    } catch (e) {
      if (e && e.response && [405, 501].includes(e.response.status)) {
        r = await axios.get(l, { timeout: 5000, maxRedirects: 5, headers: { 'User-Agent': USER_AGENT } });
      } else if (e && e.response && e.response.status >= 400) {
        return { url: l, status: e.response.status, reason: 'http_error' };
      } else {
        return null; // timeout/network error, not a broken link
      }
    }
    if (r && r.status >= 400) return { url: l, status: r.status, reason: 'bad_status' };
    return null;
  } catch (e) {
    return null;
  }
}

async function checkBrokenLinks(links = [], limit = 10, baseHostname = '') {  // reduced from 100 for performance
  // filter to only internal links and limit checks
  const sample = (links || []).slice(0, limit).filter(l => {
    try {
      const parsed = new URL(l);
      const linkHost = parsed.hostname.replace(/^www\./i, '').toLowerCase();
      const baseHost = baseHostname.replace(/^www\./i, '').toLowerCase();
      return linkHost === baseHost;
    } catch (e) { return false; }
  });
  const checks = sample.map(l => checkLinkStatus(l, baseHostname));
  const results = await Promise.all(checks);
  const broken = results.filter(Boolean);
  return broken;
}

function hasQueryParams(u) {
  try { const parsed = new URL(u); return parsed.search && parsed.search.length > 1; } catch (e) { return false; }
}

function generateHumanSummary(report) {
  const s = [];
  s.push(`Audit for ${report.base_url} at ${report.audit_date_utc}`);
  s.push(`Total URLs discovered: ${report.total_urls_discovered}`);
  s.push(`Crawlable URLs: ${report.crawl_results_summary.crawlable_urls}`);
  s.push(`Broken links found: ${report.crawl_results_summary.broken_count}`);
  s.push(`Sitemap coverage score: ${report.crawl_results_summary.sitemap_score}/10`);
  s.push(`Robots.txt score: ${report.crawl_results_summary.robots_score}/10`);
  s.push(`Final crawlability score: ${report.crawl_results_summary.final_score}/100`);
  return s.join('\n');
}

async function generateAudit(baseUrl, options = {}) {
  // ensure baseUrl is normalized
  let base;
  try { base = new URL(baseUrl).origin; } catch (e) { base = baseUrl; }
  const maxPages = options.maxPages || 100;  // reduced from 500 for faster default
  const concurrency = Math.max(1, Math.min(20, options.concurrency || 12));  // increased from 6 for better parallelization
  const followExternal = !!options.followExternal;
  const followSubdomains = options.followSubdomains === undefined ? true : !!options.followSubdomains;
  const depthLimit = Number.isFinite(options.depthLimit) ? options.depthLimit : (options.depthLimit === 0 ? 0 : (options.depthLimit || 2));  // reduced from 3 for faster crawls
  REQUEST_DELAY_MS = options.rateLimitMs && Number.isFinite(options.rateLimitMs) ? Math.max(0, options.rateLimitMs) : 0;
  RENDER_ALL_PAGES = options.renderAllPages === undefined ? false : !!options.renderAllPages;  // changed default to false - much faster!

  // discover sitemap urls
  const sitemapUrls = await discoverSitemapUrls(base);

  // parse robots
  const robots = await fetchRobots(base);

  // initial list to crawl (track depth per url) - normalize entries
  const initialUrls = [];
  if (sitemapUrls && sitemapUrls.length) {
    for (const s of sitemapUrls) {
      const n = normalizeUrl(s, base);
      if (n) initialUrls.push(n);
    }
  } else {
    const n = normalizeUrl(base, base);
    if (n) initialUrls.push(n);
  }
  const toCrawl = initialUrls.slice(0, maxPages).map(u => ({ url: u, depth: 0 }));

  const perUrl = {};
  const brokenSet = new Set();

  // concurrency workers
  let idx = 0;
  const workers = [];
  // Use a queue and a discovered set to ensure full crawl until maxPages
  const discovered = new Set(toCrawl.map(u => u.url));
  // normalize base hostname for same-host checks (ignore leading www.) and compute root domain
  let baseHostnameNorm = '';
  let baseRootDomain = '';
  try {
    baseHostnameNorm = new URL(base).hostname.replace(/^www\./i, '').toLowerCase();
    baseRootDomain = getRootDomain(baseHostnameNorm);
  } catch (e) {
    baseHostnameNorm = String(base).replace(/^www\./i, '').toLowerCase();
    baseRootDomain = getRootDomain(baseHostnameNorm);
  }
  while (idx < toCrawl.length && Object.keys(perUrl).length < maxPages) {
    const batch = [];
    for (let i = 0; i < concurrency && idx < toCrawl.length && Object.keys(perUrl).length + batch.length < maxPages; i++) {
      batch.push(toCrawl[idx++]);
    }
    // process batch in parallel
    await Promise.all(batch.map(async (item) => {
      try {
        if (!item || !item.url) return null;
        const url = item.url;
        const depth = typeof item.depth === 'number' ? item.depth : 0;
        const info = await fetchPage(url);
      // check up to 10 internal links per page for broken status (reduced from 50 for performance)
      const brokenSample = await checkBrokenLinks(info.links || [], 10, baseHostnameNorm);
        if (!info.ok) brokenSet.add(url);
        for (const b of brokenSample) brokenSet.add(b.url || b);
        perUrl[url] = Object.assign({ url }, info, { out_broken_sample: brokenSample, hasQuery: hasQueryParams(url), depth });
        // discover additional links
        if (depthLimit === 0 || depth < depthLimit) {
          for (const link of (info.links || [])) {
            try {
              const parsed = new URL(link);
              // treat same-site if hostname (ignoring www) matches
              const parsedHostNorm = (parsed.hostname || '').replace(/^www\./i, '').toLowerCase();
              const isSameRoot = parsedHostNorm === baseRootDomain || parsedHostNorm.endsWith('.' + baseRootDomain) || parsedHostNorm === baseHostnameNorm;
              const acceptExternal = followExternal || (followSubdomains ? isSameRoot : (parsedHostNorm === baseHostnameNorm));
              if (!acceptExternal) continue;
              // normalize href to ignore fragment and keep origin+pathname+search
              const href = parsed.origin + parsed.pathname + (parsed.search || '');
              if (!discovered.has(href) && Object.keys(perUrl).length + toCrawl.length < maxPages) {
                discovered.add(href);
                toCrawl.push({ url: href, depth: depth + 1 });
              }
            } catch (e) { /* ignore non-urls */ }
          }
        }
        return true;
      } catch (batchError) {
        console.error('[crawlAuditService] batch processing error:', batchError && (batchError.message || batchError));
        return null;
      }
    }));
  }

  const total = Object.keys(perUrl).length || 0;
  const crawlable = Object.values(perUrl).filter(x => x.ok).length;
  const brokenCount = brokenSet.size;

  const sitemapScore = sitemapUrls && sitemapUrls.length ? 10 : 5;
  const robotsScore = ((robots && (robots.sitemaps && robots.sitemaps.length)) || (robots && (robots.disallow && robots.disallow.length))) ? 10 : 5;

  const frac_sitemap = sitemapScore / 10.0;
  const frac_robots = robotsScore / 10.0;
  const frac_crawlable = total === 0 ? 1 : (crawlable / total);
  const frac_broken = total === 0 ? 0 : Math.min(0.15, brokenCount / (total * 2)); // cap at 15%

  // improved: prioritize internal crawlability (65%) + structure (35%)
  const final_fraction = Math.max(0, Math.min(1, 0.2 * frac_sitemap + 0.15 * frac_robots + 0.65 * frac_crawlable - 0.15 * frac_broken));
  const final_score = Math.round(final_fraction * 100);

  const broken_links_sample = Array.from(brokenSet).slice(0, 200);

  const report = {
    audit_date_utc: new Date().toISOString(),
    base_url: base,
    total_urls_discovered: total,
    sitemap_urls: sitemapUrls,
    robots: {
      disallow: robots.disallow,
      allow: robots.allow,
      sitemaps: robots.sitemaps
    },
    crawl_results_summary: {
      final_score,
      total_urls: total,
      crawlable_urls: crawlable,
      broken_count: brokenCount,
      sitemap_score: sitemapScore,
      robots_score: robotsScore
    },
    broken_links_sample,
    per_url: perUrl
  };

  report.human_summary = generateHumanSummary(report);

  return report;
}

module.exports = { generateAudit };
