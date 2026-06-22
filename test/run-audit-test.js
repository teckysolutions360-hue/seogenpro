const assert = require('assert');
const path = require('path');

// Monkey-patch/stub modules before loading the audit service
const crawlerService = require(path.join('..', 'src', 'services', 'crawlerService'));
const formattingValidator = require(path.join('..', 'src', 'modules', 'formattingValidator'));
const metadataAnalyzer = require(path.join('..', 'src', 'modules', 'metadataAnalyzer'));
const classificationEngine = require(path.join('..', 'src', 'modules', 'classificationEngine'));
const policyGenerator = require(path.join('..', 'src', 'modules', 'policyGenerator'));
const scoringEngine = require(path.join('..', 'src', 'modules', 'scoringEngine'));

// Stub crawlerService.crawlSite to invoke onComplete with a small set of pages
crawlerService.crawlSite = function (opts) {
  const pages = [
    (opts && opts.url) ? opts.url : 'http://localhost:3000/',
    (opts && opts.url) ? new URL('/about', opts.url).href : 'http://localhost:3000/about',
    (opts && opts.url) ? new URL('/privacy', opts.url).href : 'http://localhost:3000/privacy'
  ];
  if (typeof opts.onComplete === 'function') {
    // simulate async
    setTimeout(() => opts.onComplete(pages), 10);
    return;
  }
  return pages;
};

// Stub formatting validator to return deterministic validation metrics
formattingValidator.validate = async function () {
  return {
    formattingScore: 9,
    canonicalCoverage: 0.85,
    metaDescriptionCoverage: 0.9,
    duplicateTitleCount: 1
  };
};

// Stub metadata analyzer
metadataAnalyzer.analyzeMetadata = async function () {
  return {
    contentType: 'website',
    lang: 'en',
    schemaMarkup: { types: { WebSite: { valid: true } } },
    companyPages: [],
    pricingPages: []
  };
};
metadataAnalyzer.checkSitemap = async function () { return true; };
metadataAnalyzer.checkRobots = async function () { return true; };

// Simple classifier
classificationEngine.classifyPages = function (pages) {
  return { primary: pages.slice(0, 2).map(u => ({ url: u })), informational: [], legal: [], restricted: [] };
};

policyGenerator.generatePolicy = function () {
  return { 'Allow-Training': 'Yes', 'Require-Attribution': 'No' };
};

// Now require the audit service
const audit = require(path.join('..', 'src', 'services', 'auditPseudocode'));

async function run() {
  console.log('Running audit pseudocode test...');
  const report = await audit.generateAudit('http://localhost:3000');

  try {
    assert(report.AIReadinessScore >= 0 && report.AIReadinessScore <= 100, 'score out of range');
    assert(report.ScoringBreakdown, 'missing breakdown');
    assert(Array.isArray(report.PrimaryContent), 'primary content must be array');
    assert(Array.isArray(report.Suggestions), 'missing Suggestions array in report');
    // Ensure no system pages
    const sys = ['/login', '/signup', '/admin', '/cart', '/checkout', '/forgot-password', '/my-account', '/lost-password'];
    for (const u of report.PrimaryContent) {
      const p = new URL(u);
      const pathLower = p.pathname.toLowerCase();
      for (const s of sys) {
        assert(!pathLower.includes(s), `found system page ${s} in primary content`);
      }
    }

    console.log('Audit pseudocode test: PASS');
    process.exit(0);
  } catch (err) {
    console.error('Audit pseudocode test: FAIL', err && err.message);
    console.error(err && err.stack);
    process.exit(2);
  }
}

run().catch(e => { console.error(e); process.exit(2); });
