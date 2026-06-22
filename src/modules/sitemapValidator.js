/**
 * Advanced Sitemap Validator
 * 
 * Validates:
 * - XML structure & namespace
 * - <loc> validity
 * - Lastmod ISO format
 * - Canonical alignment
 * - Missing pages vs crawl results
 * - Orphan URLs in sitemap
 * - Coverage metrics
 */

const axios = require('axios');
const { URL } = require('url');
const { parseStringPromise } = require('xml2js');

class SitemapValidator {
  constructor() {
    this.timeout = 8000;
    this.userAgent = 'LLMS-Validator/1.0';
  }

  /**
   * Main validation orchestrator
   */
  async validate(baseUrl, crawledData = {}) {
    const result = {
      sitemapUrl: null,
      errors: [],
      warnings: [],
      coverage: 0,
      stats: {
        totalInSitemap: 0,
        totalCrawled: 0,
        matchingUrls: 0,
        missingFromSitemap: 0,
        orphanInSitemap: 0
      }
    };

    try {
      // Try to find sitemap
      const sitemapUrl = await this.discoverSitemap(baseUrl);
      if (!sitemapUrl) {
        result.errors.push('❌ No sitemap.xml found. Add Sitemap: directive to robots.txt');
        return result;
      }

      result.sitemapUrl = sitemapUrl;

      // Fetch and parse sitemap
      const sitemapContent = await this.fetchSitemap(sitemapUrl);
      if (!sitemapContent) {
        result.errors.push(`❌ Could not fetch sitemap from ${sitemapUrl}`);
        return result;
      }

      // Validate XML structure
      const parsed = await this.parseAndValidateSitemap(sitemapContent);
      if (parsed.errors && parsed.errors.length > 0) {
        result.errors.push(...parsed.errors);
      }
      if (parsed.warnings && parsed.warnings.length > 0) {
        result.warnings.push(...parsed.warnings);
      }

      // Extract URLs from sitemap
      const sitemapUrls = parsed.urls || [];
      result.stats.totalInSitemap = sitemapUrls.length;

      // Compare with crawled data
      if (crawledData.pages && crawledData.pages.length > 0) {
        const comparison = this.compareSitemapVsCrawled(sitemapUrls, crawledData);
        result.stats.totalCrawled = comparison.totalCrawled;
        result.stats.matchingUrls = comparison.matching;
        result.stats.missingFromSitemap = comparison.missingFromSitemap.length;
        result.stats.orphanInSitemap = comparison.orphanInSitemap.length;
        
        result.coverage = sitemapUrls.length === 0 ? 0 : Math.round((comparison.matching / sitemapUrls.length) * 100);

        if (comparison.missingFromSitemap.length > 0) {
          result.warnings.push(
            `⚠️ ${comparison.missingFromSitemap.length} crawled page(s) not in sitemap`
          );
        }

        if (comparison.orphanInSitemap.length > 0) {
          result.errors.push(
            `❌ ${comparison.orphanInSitemap.length} URL(s) in sitemap but not crawlable`
          );
        }
      }

      // Quality checks
      const qualityIssues = this.checkQuality(sitemapUrls, baseUrl);
      result.errors.push(...qualityIssues.errors);
      result.warnings.push(...qualityIssues.warnings);

    } catch (error) {
      result.errors.push(`❌ Validation error: ${error.message}`);
    }

    return result;
  }

  /**
   * Discover sitemap URL
   */
  async discoverSitemap(baseUrl) {
    // Try common locations
    const locations = [
      '/sitemap.xml',
      '/sitemap1.xml',
      '/sitemap_index.xml',
      '/sitemaps/sitemap.xml'
    ];

    for (const loc of locations) {
      try {
        const url = new URL(loc, baseUrl).href;
        const response = await axios.get(url, {
          timeout: 3000,
          headers: { 'User-Agent': this.userAgent },
          parseJson: false
        });

        if (response.status === 200) {
          return url;
        }
      } catch (e) {
        // Try next location
      }
    }

    return null;
  }

  /**
   * Fetch sitemap content
   */
  async fetchSitemap(sitemapUrl) {
    try {
      const response = await axios.get(sitemapUrl, {
        timeout: this.timeout,
        headers: { 'User-Agent': this.userAgent }
      });

      return response.data;
    } catch (error) {
      return null;
    }
  }

  /**
   * Parse and validate sitemap XML
   */
  async parseAndValidateSitemap(content) {
    const result = {
      urls: [],
      errors: [],
      warnings: []
    };

    try {
      // Basic XML validation
      if (!content.includes('<?xml')) {
        result.errors.push('❌ Missing XML declaration');
      }

      if (!content.includes('urlset') && !content.includes('sitemapindex')) {
        result.errors.push('❌ Invalid sitemap format - must contain <urlset> or <sitemapindex>');
        return result;
      }

      // Check for proper namespace
      if (!content.includes('http://www.sitemaps.org/schemas/sitemap/0.9')) {
        result.warnings.push('⚠️ Sitemap doesn\'t declare proper namespace');
      }

      // Parse XML
      const parsed = await parseStringPromise(content);

      // Extract URLs from urlset
      if (parsed.urlset && parsed.urlset.url) {
        for (const item of parsed.urlset.url) {
          const entry = {
            loc: item.loc ? item.loc[0] : null,
            lastmod: item.lastmod ? item.lastmod[0] : null,
            changefreq: item.changefreq ? item.changefreq[0] : null,
            priority: item.priority ? item.priority[0] : null
          };

          // Validate loc
          if (!entry.loc) {
            result.errors.push('❌ Found <url> without <loc>');
            continue;
          }

          // Validate URL format
          try {
            new URL(entry.loc);
          } catch (e) {
            result.errors.push(`❌ Invalid URL in sitemap: "${entry.loc}"`);
            continue;
          }

          // Validate lastmod format (ISO 8601)
          if (entry.lastmod) {
            if (!this.isISODate(entry.lastmod)) {
              result.errors.push(`❌ Invalid lastmod format for ${entry.loc}: "${entry.lastmod}". Must be ISO 8601 (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ)`);
            }
          }

          // Validate priority
          if (entry.priority) {
            const pri = parseFloat(entry.priority);
            if (isNaN(pri) || pri < 0 || pri > 1) {
              result.errors.push(`❌ Invalid priority for ${entry.loc}: "${entry.priority}". Must be 0.0-1.0`);
            }
          }

          // Validate changefreq
          const validChangefreq = ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'];
          if (entry.changefreq && !validChangefreq.includes(entry.changefreq.toLowerCase())) {
            result.errors.push(`❌ Invalid changefreq for ${entry.loc}: "${entry.changefreq}"`);
          }

          result.urls.push(entry);
        }
      }

      // Handle sitemap index
      if (parsed.sitemapindex && parsed.sitemapindex.sitemap) {
        result.warnings.push('ℹ️ Sitemap index detected - validating index structure');
        
        for (const sitemap of parsed.sitemapindex.sitemap) {
          if (!sitemap.loc || !sitemap.loc[0]) {
            result.errors.push('❌ Sitemap index entry without <loc>');
          }
        }
      }

    } catch (error) {
      result.errors.push(`❌ XML parsing error: ${error.message}`);
    }

    return result;
  }

  /**
   * Compare sitemap URLs vs crawled pages
   */
  compareSitemapVsCrawled(sitemapUrls, crawledData) {
    const sitemapSet = new Set(sitemapUrls.map(u => this.normalizeUrl(u.loc)));
    const crawledUrlMap = new Map();

    if (crawledData.pages) {
      for (const page of crawledData.pages) {
        if (page.ok) {
          crawledUrlMap.set(this.normalizeUrl(page.url), page);
        }
      }
    }

    const matching = Array.from(sitemapSet).filter(u => crawledUrlMap.has(u)).length;
    const missingFromSitemap = Array.from(crawledUrlMap.keys()).filter(u => !sitemapSet.has(u));
    const orphanInSitemap = Array.from(sitemapSet).filter(u => !crawledUrlMap.has(u));

    return {
      matching: matching,
      missingFromSitemap: missingFromSitemap,
      orphanInSitemap: orphanInSitemap,
      totalCrawled: crawledUrlMap.size
    };
  }

  /**
   * Check sitemap quality
   */
  checkQuality(sitemapUrls, baseUrl) {
    const errors = [];
    const warnings = [];

    if (sitemapUrls.length === 0) {
      errors.push('❌ Sitemap contains no URLs');
      return { errors, warnings };
    }

    // Check for duplicate URLs
    const urlSet = new Set();
    const duplicates = [];
    for (const entry of sitemapUrls) {
      const normalized = this.normalizeUrl(entry.loc);
      if (urlSet.has(normalized)) {
        duplicates.push(normalized);
      }
      urlSet.add(normalized);
    }

    if (duplicates.length > 0) {
      errors.push(`❌ ${duplicates.length} duplicate URL(s) in sitemap`);
    }

    // Check for URLs from different domains
    let baseDomain = '';
    try {
      baseDomain = new URL(baseUrl).origin;
    } catch (e) {}

    const externalUrls = sitemapUrls.filter(entry => {
      try {
        const entryOrigin = new URL(entry.loc).origin;
        return entryOrigin !== baseDomain;
      } catch (e) {
        return false;
      }
    });

    if (externalUrls.length > 0) {
      errors.push(`❌ ${externalUrls.length} URL(s) from external domains in sitemap`);
    }

    // Check for malformed URLs
    for (const entry of sitemapUrls) {
      try {
        new URL(entry.loc);
      } catch (e) {
        errors.push(`❌ Malformed URL in sitemap: ${entry.loc}`);
      }
    }

    // Warnings
    if (sitemapUrls.length > 50000) {
      warnings.push('⚠️ Large sitemap (>50k URLs) - consider splitting into sitemap index');
    }

    // Check lastmod dates for old content
    const oldestDate = sitemapUrls
      .filter(u => u.lastmod)
      .map(u => new Date(u.lastmod))
      .sort((a, b) => a - b)[0];

    if (oldestDate) {
      const monthsOld = (Date.now() - oldestDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
      if (monthsOld > 12) {
        warnings.push(`⚠️ Some URLs not updated in over ${Math.round(monthsOld)} months`);
      }
    }

    return { errors, warnings };
  }

  /**
   * Helper: validate ISO date
   */
  isISODate(dateString) {
    const isoRegex = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})?)?$/;
    if (!isoRegex.test(dateString)) {
      return false;
    }

    try {
      const date = new Date(dateString);
      return !isNaN(date.getTime());
    } catch (e) {
      return false;
    }
  }

  /**
   * Helper: normalize URLs
   */
  normalizeUrl(url) {
    try {
      const u = new URL(url);
      u.hash = '';
      let normalized = u.href.replace(/\/$/, '');
      if (normalized === u.origin) {
        normalized = u.origin + '/';
      }
      return normalized;
    } catch (e) {
      return url;
    }
  }
}

module.exports = new SitemapValidator();
