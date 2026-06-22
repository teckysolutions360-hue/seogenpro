/**
 * Enhanced Crawler with Full Graph Traversal
 * 
 * - BFS/DFS full internal link discovery
 * - Extract: status, canonical, meta robots, title, meta description
 * - Build adjacency graph
 * - Detect orphan pages, duplicates, thin content
 * - Identify indexable system pages (admin, login, cart)
 * - Query parameter risk detection
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');

class EnhancedCrawler {
  constructor() {
    this.crawledPages = new Map();
    this.toVisit = [];
    this.visited = new Set();
    this.graph = new Map(); // adjacency graph
    this.externalLinks = new Set();
    this.brokenLinks = new Set();
    this.baseUrl = '';
    this.baseDomain = '';
    this.timeout = 5000;
    this.userAgent = 'LLMS-Crawler/2.0 (+https://example.com)';
  }

  /**
   * Main crawl orchestrator
   */
  async crawl(startUrl, options = {}) {
    this.baseUrl = startUrl;
    try {
      this.baseDomain = new URL(startUrl).origin;
    } catch (e) {
      this.baseDomain = startUrl;
    }

    const maxPages = options.maxPages || 500;
    const depthLimit = options.depthLimit || 5;
    const concurrency = options.concurrency || 3;

    // Initialize queue with start URL
    this.toVisit = [{ url: startUrl, depth: 0, parent: null }];
    this.visited.clear();
    this.crawledPages.clear();
    this.graph.clear();

    // BFS crawl with concurrency
    const workers = [];
    while (this.toVisit.length > 0 && this.visited.size < maxPages) {
      // Take up to `concurrency` items from queue
      const batch = [];
      for (let i = 0; i < concurrency && this.toVisit.length > 0; i++) {
        const item = this.toVisit.shift();
        if (!this.visited.has(item.url)) {
          batch.push(item);
        }
      }

      if (batch.length === 0) break;

      // Process batch in parallel
      await Promise.all(batch.map(item => this.crawlPage(item, depthLimit, maxPages)));
    }

    // Post-processing
    const analysis = this.analyzeGraph();

    return {
      baseUrl: this.baseUrl,
      stats: {
        totalPages: this.visited.size,
        totalLinks: Array.from(this.crawledPages.values()).reduce((s, p) => s + p.internalLinks.length, 0),
        externalLinksCount: this.externalLinks.size,
        brokenLinksCount: this.brokenLinks.size
      },
      pages: Array.from(this.crawledPages.values()),
      graph: this.graph,
      analysis: analysis,
      quality: this.assessQuality(analysis)
    };
  }

  /**
   * Crawl individual page
   */
  async crawlPage(item, depthLimit, maxPages) {
    const { url, depth, parent } = item;

    if (this.visited.has(url)) return;
    if (depth > depthLimit) return;
    if (this.visited.size >= maxPages) return;

    this.visited.add(url);

    try {
      const response = await axios.get(url, {
        timeout: this.timeout,
        headers: { 'User-Agent': this.userAgent },
        maxRedirects: 5
      });

      const html = response.data;
      const $ = cheerio.load(html);

      // Extract metadata
      const page = {
        url: url,
        statusCode: response.status,
        ok: response.status >= 200 && response.status < 300,
        depth: depth,
        title: $('title').text().trim() || '',
        metaDescription: $('meta[name="description"]').attr('content') || '',
        canonical: $('link[rel="canonical"]').attr('href') || url,
        metaRobots: $('meta[name="robots"]').attr('content') || 'index, follow',
        wordCount: this.countWords($('body').text()),
        h1Count: $('h1').length,
        h2Count: $('h2').length,
        internalLinks: [],
        externalLinks: [],
        canonicalIssues: []
      };

      // Extract links
      $('a[href]').each((i, elem) => {
        const href = $(elem).attr('href');
        const anchorText = $(elem).text().trim();

        if (!href) return;

        try {
          const absoluteUrl = new URL(href, url).href;
          
          if (this.isInternalLink(absoluteUrl)) {
            // Normalize: remove fragment, trailing slash inconsistencies
            const normalized = this.normalizeUrl(absoluteUrl);
            page.internalLinks.push({
              url: normalized,
              anchor: anchorText,
              isGeneric: this.isGenericAnchor(anchorText)
            });

            // Add to crawl queue if not visited
            if (!this.visited.has(normalized) && depth < depthLimit) {
              this.toVisit.push({
                url: normalized,
                depth: depth + 1,
                parent: url
              });
            }
          } else {
            page.externalLinks.push(absoluteUrl);
            this.externalLinks.add(absoluteUrl);
          }
        } catch (e) {
          // Skip malformed URLs
        }
      });

      // Check for canonical issues
      if (page.canonical !== url) {
        page.canonicalIssues.push({
          issue: 'self-referential-canonical',
          current: url,
          points_to: page.canonical
        });
      }

      // Detect system pages
      page.isSystemPage = this.isSystemPage(url);

      // Detect thin content
      page.isThinContent = page.wordCount < 300;

      // Detect query parameters
      page.hasQueryParams = this.hasQueryParams(url);

      this.crawledPages.set(url, page);

      // Update graph
      if (!this.graph.has(url)) {
        this.graph.set(url, []);
      }
      for (const link of page.internalLinks) {
        const target = link.url;
        if (!this.graph.has(target)) {
          this.graph.set(target, []);
        }
        this.graph.get(url).push(target);
      }

    } catch (error) {
      // Record broken link
      this.brokenLinks.add(url);
      this.crawledPages.set(url, {
        url: url,
        statusCode: error.response?.status || 0,
        ok: false,
        error: error.message,
        depth: depth,
        internalLinks: []
      });
    }
  }

  /**
   * Analyze crawled graph
   */
  analyzeGraph() {
    const orphanPages = this.findOrphanPages();
    const duplicateTitles = this.findDuplicateTitles();
    const missingMetaDescriptions = this.findMissingMetaDescriptions();
    const missingCanonicals = this.findMissingCanonicals();
    const systemPages = this.findSystemPages();
    const genericAnchors = this.findGenericAnchors();
    const depthDistribution = this.analyzeDepthDistribution();

    return {
      orphanPages: orphanPages,
      orphanCount: orphanPages.length,
      duplicateTitles: duplicateTitles,
      duplicateTitleCount: Object.keys(duplicateTitles).length,
      missingMetaDescriptions: missingMetaDescriptions,
      missingMetaDescriptionCount: missingMetaDescriptions.length,
      missingCanonicals: missingCanonicals,
      missingCanonicalCount: missingCanonicals.length,
      systemPagesIndexable: systemPages.filter(p => p.ok),
      systemPageIssues: systemPages.filter(p => p.ok).length,
      thinContent: Array.from(this.crawledPages.values()).filter(p => p.isThinContent),
      thinContentCount: Array.from(this.crawledPages.values()).filter(p => p.isThinContent).length,
      pagesWithQueryParams: Array.from(this.crawledPages.values()).filter(p => p.hasQueryParams),
      queryParamRiskCount: Array.from(this.crawledPages.values()).filter(p => p.hasQueryParams).length,
      genericAnchorText: genericAnchors,
      genericAnchorCount: genericAnchors.length,
      depthDistribution: depthDistribution,
      avgDepth: this.calculateAvgDepth()
    };
  }

  /**
   * Find orphan pages (no incoming links)
   */
  findOrphanPages() {
    const orphans = [];
    const incomingLinks = new Map();

    // Initialize all pages with 0 incoming
    for (const url of this.crawledPages.keys()) {
      incomingLinks.set(url, 0);
    }

    // Count incoming links
    for (const [source, targets] of this.graph.entries()) {
      for (const target of targets) {
        incomingLinks.set(target, (incomingLinks.get(target) || 0) + 1);
      }
    }

    // Find pages with 0 incoming (except homepage)
    for (const [url, count] of incomingLinks.entries()) {
      if (count === 0 && url !== this.baseUrl) {
        orphans.push({
          url: url,
          incomingLinks: count
        });
      }
    }

    return orphans;
  }

  /**
   * Find duplicate titles
   */
  findDuplicateTitles() {
    const titleMap = {};
    for (const page of this.crawledPages.values()) {
      if (!page.title) continue;
      if (!titleMap[page.title]) titleMap[page.title] = [];
      titleMap[page.title].push(page.url);
    }

    const duplicates = {};
    for (const [title, urls] of Object.entries(titleMap)) {
      if (urls.length > 1) {
        duplicates[title] = urls;
      }
    }

    return duplicates;
  }

  /**
   * Find missing meta descriptions
   */
  findMissingMetaDescriptions() {
    return Array.from(this.crawledPages.values())
      .filter(p => p.ok && !p.metaDescription)
      .map(p => ({ url: p.url, title: p.title }));
  }

  /**
   * Find missing canonicals
   */
  findMissingCanonicals() {
    return Array.from(this.crawledPages.values())
      .filter(p => p.ok && !p.canonical)
      .map(p => ({ url: p.url }));
  }

  /**
   * Find indexable system pages
   */
  findSystemPages() {
    return Array.from(this.crawledPages.values())
      .filter(p => p.isSystemPage)
      .map(p => ({ url: p.url, ok: p.ok, statusCode: p.statusCode }));
  }

  /**
   * Find generic anchor text
   */
  findGenericAnchors() {
    const generics = [];
    const genericPatterns = ['click here', 'read more', 'learn more', 'more', 'link', 'page', 'here'];

    for (const page of this.crawledPages.values()) {
      if (!page.internalLinks) continue;
      for (const link of page.internalLinks) {
        if (link.isGeneric) {
          generics.push({
            from: page.url,
            to: link.url,
            anchor: link.anchor
          });
        }
      }
    }

    return generics;
  }

  /**
   * Analyze depth distribution
   */
  analyzeDepthDistribution() {
    const dist = {};
    for (const page of this.crawledPages.values()) {
      const d = page.depth || 0;
      dist[d] = (dist[d] || 0) + 1;
    }
    return dist;
  }

  /**
   * Calculate average depth
   */
  calculateAvgDepth() {
    const pages = Array.from(this.crawledPages.values());
    if (pages.length === 0) return 0;
    const total = pages.reduce((s, p) => s + (p.depth || 0), 0);
    return Math.round((total / pages.length) * 10) / 10;
  }

  /**
   * Assess overall quality
   */
  assessQuality(analysis) {
    let score = 100;

    // Orphan pages penalty
    score -= Math.min(20, analysis.orphanCount * 3);

    // Duplicate titles penalty
    score -= Math.min(15, analysis.duplicateTitleCount * 5);

    // Missing meta descriptions penalty
    score -= Math.min(15, analysis.missingMetaDescriptionCount * 2);

    // Thin content penalty
    score -= Math.min(10, analysis.thinContentCount * 1);

    // System pages indexed penalty
    score -= Math.min(25, analysis.systemPageIssues * 15);

    // Query params risk
    score -= Math.min(10, analysis.queryParamRiskCount * 2);

    return Math.max(0, Math.min(100, score));
  }

  // Helper methods

  isInternalLink(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.origin === new URL(this.baseUrl).origin;
    } catch (e) {
      return false;
    }
  }

  normalizeUrl(url) {
    try {
      const u = new URL(url);
      // Remove fragment
      u.hash = '';
      // Remove trailing slash for consistency
      let hrefNormalized = u.href.replace(/\/$/, '');
      if (hrefNormalized === u.origin) {
        hrefNormalized = u.origin + '/'; // Keep root with slash
      }
      return hrefNormalized;
    } catch (e) {
      return url;
    }
  }

  isGenericAnchor(text) {
    const normalized = text.toLowerCase().trim();
    const genericPatterns = ['click here', 'read more', 'learn more', 'more', 'link', 'page', 'here', 'this', 'now'];
    return genericPatterns.some(pattern => normalized === pattern || normalized.includes(pattern));
  }

  isSystemPage(url) {
    const systemPatterns = [
      /\/admin/i,
      /\/login/i,
      /\/logout/i,
      /\/cart/i,
      /\/checkout/i,
      /\/account/i,
      /\/dashboard/i,
      /\/settings/i,
      /\/user/i,
      /\/wp-admin/i,
      /\/wp-login/i,
      /\/api\//i
    ];

    return systemPatterns.some(pattern => pattern.test(url));
  }

  hasQueryParams(url) {
    try {
      const u = new URL(url);
      return u.search.length > 0;
    } catch (e) {
      return false;
    }
  }

  countWords(text) {
    return text.trim().split(/\s+/).filter(w => w.length > 0).length;
  }
}

module.exports = new EnhancedCrawler();
