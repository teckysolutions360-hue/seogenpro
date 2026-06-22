const axios = require('axios');
const crawlerService = require('./crawlerService');
const metadataAnalyzer = require('../modules/metadataAnalyzer');
const scoringEngine = require('../modules/scoringEngine');
const classificationEngine = require('../modules/classificationEngine');
const policyGenerator = require('../modules/policyGenerator');
const formattingValidator = require('../modules/formattingValidator');
const permissionEngine = require('../modules/permissionEngine');

/**
 * auditPseudocode.js
 * A concise implementation of the provided pseudocode v2.0.
 * Uses existing modules when available and returns a structured report.
 */

async function crawlSitePromise(baseUrl, maxPages = 200) {
  return new Promise((resolve, reject) => {
    crawlerService.crawlSite({
      url: baseUrl,
      maxPages,
      respectRobotsTxt: false,
      onProgress: () => {},
      onComplete: (crawledPages) => resolve(crawledPages),
      onError: reject
    });
  });
}

function clamp(v, lo = 0, hi = 100) {
  const n = Number(v) || 0;
  return Math.max(lo, Math.min(hi, n));
}

async function generateAudit(url, options = {}) {
  const maxPages = options.maxPages || 500;

  // 1. Load website metadata
  const metadata = await metadataAnalyzer.analyzeMetadata(url);

  // 2. Crawl pages (promise wrapper)
  const rawPages = await crawlSitePromise(url, maxPages);

  // Normalize list of urls (strings or objects)
  const pages = rawPages.map(p => (typeof p === 'string' ? p : p.url)).filter(Boolean);

  // 3. Filter primary content
  const systemPages = new Set([
    '/login', '/signup', '/admin', '/cart', '/checkout', '/forgot-password', '/my-account', '/lost-password'
  ]);

  const primaryContent = [];
  const seen = new Set();
  for (const raw of pages) {
    try {
      const u = new URL(raw, url);
      const path = u.pathname.toLowerCase();
      const isSystem = Array.from(systemPages).some(s => path.includes(s));
      if (isSystem) continue;
      const key = u.origin + u.pathname + (u.search || '');
      if (seen.has(key)) continue;
      seen.add(key);
      primaryContent.push(u.href);
    } catch (e) {
      // ignore invalid urls
    }
  }

  // 4. Detection metrics
  const hasSitemap = await metadataAnalyzer.checkSitemap(url);
  const hasRobots = await metadataAnalyzer.checkRobots(url);
  const schemaTypes = metadata && metadata.schemaMarkup && metadata.schemaMarkup.types ? Object.keys(metadata.schemaMarkup.types) : [];

  // HTTPS check
  let httpsOk = String(url).toLowerCase().startsWith('https');
  try {
    const head = await axios.head(url, { timeout: 5000, validateStatus: () => true });
    if (head && head.request && head.request.res && String(head.request.res.responseUrl || '').startsWith('https')) httpsOk = true;
  } catch (e) {
    // keep best-effort flag
  }

  // Use formattingValidator for canonical/meta/duplicates sampling
  const sampleRate = primaryContent.length > 200 ? 0.05 : 0.25;
  const formattingResult = await formattingValidator.validate(null, primaryContent.slice(0, 1000), { runInBackground: false, sampleRate, concurrency: 6, maxSamples: 300 });

  const canonicalCoverage = clamp((formattingResult.canonicalCoverage || formattingResult.canonical_coverage || 0) * 100, 0, 100);
  const metaDescriptionCoverage = clamp((formattingResult.metaDescriptionCoverage || formattingResult.meta_description_coverage || 0) * 100, 0, 100);
  const duplicateTitles = Number(formattingResult.duplicateTitleCount || formattingResult.duplicate_title_count || 0);

  const metrics = {
    sitemapPresent: Boolean(hasSitemap),
    robotsPresent: Boolean(hasRobots),
    schemaTypes,
    httpsOk,
    canonicalCoverage,
    metaDescriptionCoverage,
    duplicateTitles
  };

  // 5. Score calculations (categories 0-10)
  const scores = {};
  scores.Sitemap = metrics.sitemapPresent ? 10 : 0;
  scores.Robots = metrics.robotsPresent ? 10 : 0;
  scores.Classification = clamp(scoringEngine.clampScore(scoringEngine.scoreClassification({ classifiedPages: classificationEngine.classifyPages(primaryContent.map(u=>({url:u}))) })), 0, 10);

  // Policy via policyGenerator (best-effort) and scoring
  const policy = policyGenerator.generatePolicy({ excludePrivateContent: true });
  scores.Policy = clamp(scoringEngine.clampScore(scoringEngine.scorePolicy({ policy })), 0, 10);

  // Metadata scoring (v2.1): stronger uniform penalties
  let metadataScore = 10;
  if (canonicalCoverage < 50) metadataScore -= 3;
  if (metaDescriptionCoverage < 50) metadataScore -= 3;
  if (duplicateTitles > 5) metadataScore -= 3;
  scores.Metadata = clamp(metadataScore, 0, 10);

  // Legal pages presence
  const legalPages = metadataAnalyzer.findLegalPages ? metadataAnalyzer.findLegalPages(primaryContent) : {};
  const hasLegal = Boolean(legalPages && (legalPages.privacy || legalPages.terms));
  scores.Legal = hasLegal ? 10 : 0;

  // Formatting (reuse validator score)
  scores.Formatting = clamp(formattingResult.formattingScore || scoringEngine.clampScore(scoringEngine.scoreFormatting({ generatedOutput: '' })), 0, 10);

  // 6. Final AI Readiness Score (weights normalized)
  const weights = {
    Sitemap: 10,
    Robots: 10,
    Classification: 20,
    Policy: 25,
    Metadata: 15,
    Legal: 10,
    Formatting: 10
  };

  let finalScore = 0;
  for (const [cat, w] of Object.entries(weights)) {
    finalScore += (scores[cat] || 0) * (w / 10);
  }
  finalScore = clamp(Math.round(finalScore), 0, 100);

  // 7. Risk classification (v2.1 thresholds)
  let risk = 'Low';
  if (canonicalCoverage < 50 || metaDescriptionCoverage < 50 || duplicateTitles > 5) risk = 'Medium';
  if ((canonicalCoverage < 20 && metaDescriptionCoverage < 20) || duplicateTitles > 10) risk = 'High';

  // 7b. Generate improvement suggestions (v2.1)
  const suggestions = [];
  if (canonicalCoverage < 50) suggestions.push('Add canonical tags to all primary pages');
  if (metaDescriptionCoverage < 50) suggestions.push('Add meta descriptions for all primary pages');
  if (duplicateTitles > 0) suggestions.push('Fix duplicate titles across pages');
  if ((formattingResult && (formattingResult.formattingScore || 0) < 5) || (scores.Formatting || 0) < 5) suggestions.push('Improve HTML formatting, headings, and schema markup');
  if (duplicateTitles > 10 || finalScore < 50) suggestions.push('Audit all primary content for SEO and AI-readiness improvements');

  // 8. Assemble report
  const report = {
    Website: url,
    ContentType: metadata.contentType || null,
    Language: metadata.lang || metadata.language || null,
    AIReadinessScore: finalScore,
    Grade: scoringEngine.getGrade ? scoringEngine.getGrade(finalScore) : null,
    ScoringBreakdown: scores,
    PrimaryContent: primaryContent,
    CompanyInfoPages: metadata.companyPages || [],
    LegalPages: legalPages,
    PricingAndPlans: metadata.pricingPages || [],
    Detection: metrics,
    RiskClassification: risk,
    Authorization: policy,
    Suggestions: suggestions
  };

  // 9. Validation checks
  function validateReport(r) {
    const errors = [];
    for (const s of Object.values(r.ScoringBreakdown)) {
      if (s < 0 || s > 10) errors.push('Category score out of range');
    }
    if (r.AIReadinessScore < 0 || r.AIReadinessScore > 100) errors.push('AIReadinessScore out of range');
    for (const u of r.PrimaryContent) {
      try {
        const p = new URL(u);
        const path = p.pathname.toLowerCase();
        if (Array.from(systemPages).some(s => path.includes(s))) errors.push('System page present in PrimaryContent');
      } catch (e) {}
    }
    return { valid: errors.length === 0, errors };
  }

  const validation = validateReport(report);
  if (!validation.valid) report.ValidationErrors = validation.errors;

  return report;
}

module.exports = { generateAudit };
