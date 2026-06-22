const axios = require('axios');
const crawlerService = require('./crawlerService');
const metadataAnalyzer = require('../modules/metadataAnalyzer');
const classificationEngine = require('../modules/classificationEngine');
const policyGenerator = require('../modules/policyGenerator');
const scoringEngine = require('../modules/scoringEngine');
const outputFormatter = require('../modules/outputFormatter');
const permissionEngine = require('../modules/permissionEngine');
const formattingValidator = require('../modules/formattingValidator');
const reportValidator = require('../modules/reportValidator');

/**
 * Enhanced LLMS Service
 * ========================
 * Orchestrates the AI Compliance & LLM Visibility Analyzer
 * Coordinates crawling, analysis, classification, and output generation
 */

class LlmsService {
  /**
   * Main orchestration method
   * Generates complete AI Compliance analysis
   */
  async generateComplianceAnalysis(baseUrl, options = {}) {
    try {
      console.log(`[LLMS] Starting compliance analysis for: ${baseUrl}`);

      // Step 1: Analyze metadata
      const metadata = await metadataAnalyzer.analyzeMetadata(baseUrl);
      const contentType = metadataAnalyzer.detectContentType({}, metadata);
      const hasSitemap = await metadataAnalyzer.checkSitemap(baseUrl);
      const hasRobots = await metadataAnalyzer.checkRobots(baseUrl);

      console.log(`[LLMS] Metadata analyzed - Type: ${contentType}, Sitemap: ${hasSitemap}, Robots: ${hasRobots}`);

      // Step 2: Crawl site pages
      const crawled = await this.crawlSite(baseUrl, options.maxPages || 50);
      console.log(`[LLMS] Crawled ${crawled.length} pages`);

      // Filter out system/xml pages conservatively and dedupe by normalized URL, slug and title
      const rawUrls = crawled.map(p => (typeof p === 'string' ? p : p.url));
      const normalizedSet = new Set();
      const slugMap = new Map();
      const titleMap = new Map();
      const pages = [];

      for (const raw of rawUrls) {
        const norm = crawlerService.normalizeUrl(raw);
        if (!crawlerService.shouldCrawlUrl(norm)) continue;
        // dedupe by normalized url
        if (normalizedSet.has(norm)) continue;

        // derive slug and title for dedupe
        let title = this.extractTitleFromUrl(norm);
        // clean title: trim long, remove trailing ellipses, remove repeated 'category:' prefix
        title = title.replace(/category:\s*/i, '').replace(/\.\.\.$/, '').trim();
        if (title.length > 60) title = title.substring(0, 57) + '...';

        const slug = (() => {
          try { const u = new URL(norm); const seg = u.pathname.split('/').filter(s=>s).pop(); return (seg||'').toLowerCase(); } catch(e){ return norm; }
        })();

        // dedupe by slug
        if (slug && slugMap.has(slug)) continue;

        // dedupe by title
        const tkey = title.toLowerCase();
        if (titleMap.has(tkey)) continue;

        normalizedSet.add(norm);
        slugMap.set(slug, norm);
        titleMap.set(tkey, norm);
        pages.push({ url: norm, title, description: '' });
      }

      // Step 3: Classify pages
      const classifiedPages = classificationEngine.classifyPages(pages);
      console.log(`[LLMS] Pages classified - Primary: ${classifiedPages.primary.length}, Legal: ${classifiedPages.legal.length}, Restricted: ${classifiedPages.restricted.length}`);

      // Step 4: Detect legal pages and generate policy
      const legalPages = { privacy: null, terms: null, refund: null, cookie: null };
      pages.forEach(p => {
        const path = (p.url || '').toLowerCase();
        if (!legalPages.privacy && path.includes('privacy')) legalPages.privacy = p.url;
        if (!legalPages.terms && (path.includes('terms') || path.includes('terms-of-service'))) legalPages.terms = p.url;
        if (!legalPages.refund && (path.includes('refund') || path.includes('return'))) legalPages.refund = p.url;
        if (!legalPages.cookie && path.includes('cookie')) legalPages.cookie = p.url;
      });

      let policy = policyGenerator.generatePolicy({
        allowTraining: options.allowTraining !== false,
        allowSummary: options.allowSummary !== false,
        allowQuotation: options.allowQuotation !== false,
        allowEmbedding: options.allowEmbedding !== false,
        requireAttribution: options.requireAttribution !== false,
        attributionFormat: options.attributionFormat || 'Please provide source URL',
        excludePrivateContent: true
      });

      // Enforce conservative defaults when key legal pages missing
      if (!legalPages.privacy || !legalPages.terms) {
        policy['Allow-Training'] = 'No';
        policy['Require-Attribution'] = 'Yes';
      }

      policy._detectedLegalPages = legalPages;

      console.log(`[LLMS] AI policy generated`);

      // Step 5: Validation layer (https, canonical/meta coverage, schema, duplicates)
      const validation = {
        https_ok: false,
        metadataScore: 0,
        formattingScore: 0,
        schemaPresent: false,
        duplicateTitleCount: 0
      };

      // HTTPS check (HEAD request)
      try {
        const head = await axios.head(baseUrl, { timeout: 5000, validateStatus: ()=>true });
        validation.https_ok = String(baseUrl).toLowerCase().startsWith('https') || (head && head.status < 400 && head.request && String(head.request.res.responseUrl || '').startsWith('https'));
      } catch (e) {
        validation.https_ok = String(baseUrl).toLowerCase().startsWith('https');
      }

      // metadataScore will be computed after formatting results are available
      // (so that canonical/meta coverage and duplicate title counts can be used)

      // schema presence
      validation.schemaPresent = Boolean(metadata.schemaMarkup && metadata.schemaMarkup.types && Object.keys(metadata.schemaMarkup.types).length > 0 && Object.values(metadata.schemaMarkup.types).some(t => t.valid));

      // Formatting validator runs asynchronously for large sites.
      const totalPages = pages.length || 0;
      const runInBackground = totalPages > 200; // threshold to avoid blocking

      if (runInBackground) {
        // Start background run and provide conservative placeholder
        const bg = formattingValidator.validate(null, pages, { runInBackground: true, concurrency: 6, sampleRate: 0.05, maxSamples: 100 });
        // bg is { background:true, promise }
        validation.formattingScore = Math.max(6, validation.formattingScore || 6); // conservative default
        validation.duplicateTitleCount = validation.duplicateTitleCount || 0;
        // asynchronously attach results to permissions when done (fire-and-forget)
        bg.promise.then(res => {
          // We do not block; update report store if implemented
          console.log('[FormattingValidator] Background result ready');
        }).catch(e => console.warn('[FormattingValidator] Background run failed', e));
        // compute a conservative metadata score now using available schema and defaults
        try {
          validation.metaDescriptionCoverage = validation.metaDescriptionCoverage || validation.meta_description_coverage || 0;
          validation.canonicalCoverage = validation.canonicalCoverage || validation.canonical_coverage || 0;
          validation.duplicateTitleCount = validation.duplicateTitleCount || 0;
          validation.metadataScore = scoringEngine.clampScore(scoringEngine.scoreMetadata({ metadata, validation }));
        } catch (e) {
          validation.metadataScore = 0;
        }
      } else {
        const formattingResult = await formattingValidator.validate(null, pages, { runInBackground: false, concurrency: 6, sampleRate: 0.2, maxSamples: 100 });
        validation.formattingScore = formattingResult.formattingScore;
        validation.duplicateTitleCount = formattingResult.duplicateTitleCount;
        // copy canonical / meta coverage fields from formatting result when available
        validation.metaDescriptionCoverage = (typeof formattingResult.metaDescriptionCoverage === 'number') ? formattingResult.metaDescriptionCoverage : (typeof formattingResult.meta_description_coverage === 'number' ? formattingResult.meta_description_coverage : validation.metaDescriptionCoverage || 0);
        validation.canonicalCoverage = (typeof formattingResult.canonicalCoverage === 'number') ? formattingResult.canonicalCoverage : (typeof formattingResult.canonical_coverage === 'number' ? formattingResult.canonical_coverage : validation.canonicalCoverage || 0);

        // now compute metadata score using richer validation stats
        try {
          validation.metadataScore = scoringEngine.clampScore(scoringEngine.scoreMetadata({ metadata, validation }));
        } catch (e) {
          validation.metadataScore = 0;
        }
      }

      // Step 6: Permissions & risk
      const permissions = permissionEngine.evaluate(policy._detectedLegalPages, policy, validation);

      console.log(`[LLMS] Permissions evaluated - risk: ${permissions.risk_label} (${permissions.risk_score.toFixed(2)})`);

      // Step 5: Calculate score
      const scoreData = scoringEngine.calculateScore({
        hasSitemap,
        hasRobots,
        classifiedPages,
        policy,
        metadata,
        contentType,
        pages,
        legalPages
      });

      console.log(`[LLMS] AI Readiness Score: ${scoreData.score}/100`);

      // Step 6: Format output
      const generatedOutput = outputFormatter.formatCompliance({
        baseUrl,
        metadata,
        contentType,
        classifiedPages,
        policy,
        hasSitemap,
        hasRobots,
        scoreData,
        permissions,
        validation
      });

      console.log(`[LLMS] Compliance analysis complete`);

      // Final report object
      const report = {
        metadata,
        contentType,
        classifiedPages,
        policy,
        permissions,
        validation,
        scoreData,
        pages,
        pageCount: pages.length,
        generatedOutput,
        hasSitemap,
        hasRobots,
        recommendations: scoreData.recommendations
      };

      // Validate report consistency and clamp values
      const validationResult = reportValidator.validateAuditReport(report);
      if (!validationResult.valid) {
        report.warnings = (report.warnings || []).concat(validationResult.errors);
      }

      return Object.assign({ success: true }, report);
    } catch (error) {
      console.error('[LLMS] Compliance analysis error:', error);
      throw error;
    }
  }

  /**
   * Crawl site and extract pages with metadata
   */
  async crawlSite(baseUrl, options = {}) {
    const maxPages = options.maxPages || 50;
    const maxDepth = options.maxDepth || 3; // prevent deep crawls from hanging
    const concurrency = options.concurrency || 6;
    const timeout = options.timeout || 10000; // per-request timeout
    const requestDelay = options.requestDelay || 0;

    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const pages = [];

      crawlerService.crawlSite({
        url: baseUrl,
        maxPages,
        maxDepth,
        concurrency,
        timeout,
        requestDelay,
        respectRobotsTxt: false,
        onProgress: (progress, currentUrl) => {
          console.log(`[Crawler] Progress: ${Math.round(progress * 100)}% - ${currentUrl}`);
        },
        onComplete: (crawledPages) => {
          const elapsed = (Date.now() - startTime) / 1000;
          console.log(`[Crawler] Complete: ${crawledPages.length} pages in ${elapsed}s`);

          // Deduplicate and prepare pages
          const uniquePages = Array.from(new Map(
            crawledPages.map(p => [p, null])
          ).keys());

          const pageData = uniquePages.map(url => ({
            url,
            title: this.extractTitleFromUrl(url),
            description: ''
          })).slice(0, maxPages);

          resolve(pageData);
        },
        onError: reject
      });
    });
  }

  /**
   * Extract page title from URL
   */
  extractTitleFromUrl(url) {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname;
      const segments = path.split('/').filter(s => s);

      if (segments.length === 0) return 'Home';

      const last = segments[segments.length - 1];
      return last
        .replace(/[-_]/g, ' ')
        .replace(/\.html?$/, '')
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ')
        .substring(0, 60);
    } catch (e) {
      return 'Page';
    }
  }

  /**
   * Validate URL
   */
  isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch (e) {
      return false;
    }
  }
}

module.exports = new LlmsService();
