/**
 * Coverage Validator
 * 
 * Compare crawled URLs vs sitemap URLs:
 * - Missing: in crawl but not in sitemap
 * - Orphan: in sitemap but not in crawl
 * - Coverage percentage
 */

class CoverageValidator {
  constructor() {
    this.cache = new Map();
    this.CACHE_TTL = 1000 * 60 * 60; // 1 hour
  }

  /**
   * Validate coverage
   */
  validate(sitemapUrls, crawledUrls, options = {}) {
    const {
      ignoreQueryParams = true,
      ignoreTrailingSlash = true,
      ignoreScheme = true,
      cache = true
    } = options;

    const cacheKey = this._getCacheKey(sitemapUrls, crawledUrls);
    if (cache && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.CACHE_TTL) {
        return cached.value;
      }
    }

    // Normalize URLs
    const normalized_sitemap = sitemapUrls.map(url =>
      this._normalizeUrl(url, { ignoreQueryParams, ignoreTrailingSlash, ignoreScheme })
    );

    const normalized_crawled = crawledUrls.map(url =>
      this._normalizeUrl(url, { ignoreQueryParams, ignoreTrailingSlash, ignoreScheme })
    );

    // Find missing and orphan
    const sitemapSet = new Set(normalized_sitemap);
    const crawledSet = new Set(normalized_crawled);

    const missing = normalized_crawled.filter(url => !sitemapSet.has(url));
    const orphan = normalized_sitemap.filter(url => !crawledSet.has(url));
    const covered = normalized_crawled.filter(url => sitemapSet.has(url));

    // Calculate coverage
    const coveragePercentage = crawledSet.size > 0 
      ? (covered.length / normalized_crawled.length) * 100 
      : 100;

    const result = {
      totalCrawled: normalized_crawled.length,
      totalSitemap: normalized_sitemap.length,
      covered: covered.length,
      missing: missing.length,
      orphan: orphan.length,
      coveragePercentage: Math.round(coveragePercentage * 100) / 100,
      missingUrls: missing,
      orphanUrls: orphan,
      healthScore: this._calculateHealthScore(missing.length, orphan.length, covered.length),
      recommendations: this._getRecommendations(missing, orphan, covered)
    };

    if (cache) {
      this.cache.set(cacheKey, { value: result, timestamp: Date.now() });
    }

    return result;
  }

  /**
   * Get metrics summary
   */
  getMetrics(validationResult) {
    return {
      crawledUrls: validationResult.totalCrawled,
      sitemapUrls: validationResult.totalSitemap,
      properlyIndexed: validationResult.covered,
      missingFromSitemap: validationResult.missing.length,
      sitemapOrphans: validationResult.orphan.length,
      coveragePercent: validationResult.coveragePercentage,
      healthScore: validationResult.healthScore,
      priorities: {
        critical: validationResult.missing.filter(u => this._isCritical(u)).length,
        high: validationResult.orphan.filter(u => this._isHighValue(u)).length
      }
    };
  }

  /**
   * Get detailed report
   */
  getReport(validationResult) {
    return {
      summary: {
        status: this._getStatus(validationResult),
        healthScore: `${validationResult.healthScore}/100`,
        coverage: `${validationResult.coveragePercentage}%`,
        timestamp: new Date().toISOString()
      },
      coverage: {
        totalCrawled: validationResult.totalCrawled,
        totalSitemap: validationResult.totalSitemap,
        properlyIndexed: validationResult.covered,
        properly_indexed_percent: Math.round((validationResult.covered / validationResult.totalCrawled) * 100)
      },
      issues: {
        missingFromSitemap: {
          count: validationResult.missing.length,
          percent: Math.round((validationResult.missing.length / validationResult.totalCrawled) * 100),
          urls: validationResult.missingUrls.slice(0, 20) // Top 20
        },
        sitemapOrphans: {
          count: validationResult.orphan.length,
          percent: Math.round((validationResult.orphan.length / validationResult.totalSitemap) * 100),
          urls: validationResult.orphanUrls.slice(0, 20) // Top 20
        }
      },
      recommendations: validationResult.recommendations
    };
  }

  /**
   * Group URLs by status
   */
  groupByStatus(validationResult) {
    return {
      properlyIndexed: {
        count: validationResult.covered,
        percent: Math.round((validationResult.covered / validationResult.totalCrawled) * 100),
        status: 'good'
      },
      missingFromIndex: {
        count: validationResult.missing.length,
        percent: Math.round((validationResult.missing.length / validationResult.totalCrawled) * 100),
        status: validationResult.missing.length > 0 ? 'warning' : 'good'
      },
      orphanedInSitemap: {
        count: validationResult.orphan.length,
        percent: Math.round((validationResult.orphan.length / validationResult.totalSitemap) * 100),
        status: validationResult.orphan.length > (validationResult.totalSitemap * 0.1) ? 'warning' : 'info'
      }
    };
  }

  /**
   * Helper: normalize URL
   */
  _normalizeUrl(url, options = {}) {
    const {
      ignoreQueryParams = true,
      ignoreTrailingSlash = true,
      ignoreScheme = true
    } = options;

    try {
      let normalized = url.trim();

      // Remove query params
      if (ignoreQueryParams) {
        normalized = normalized.split('?')[0];
      }

      // Remove fragment
      normalized = normalized.split('#')[0];

      // Lowercase
      normalized = normalized.toLowerCase();

      // Handle trailing slash
      if (ignoreTrailingSlash) {
        normalized = normalized.replace(/\/$/, '');
      }

      // Remove scheme
      if (ignoreScheme) {
        normalized = normalized.replace(/^https?:\/\/(www\.)?/, '');
      }

      return normalized;
    } catch (error) {
      return url;
    }
  }

  /**
   * Calculate health score (0-100)
   */
  _calculateHealthScore(missingCount, orphanCount, coveredCount) {
    const totalUrls = missingCount + coveredCount;
    if (totalUrls === 0) return 100;

    // 70% weight on coverage, 30% on no orphans
    const coverageScore = (coveredCount / totalUrls) * 70;
    const orphanScore = Math.max(0, 30 - (orphanCount * 2));

    return Math.round(Math.min(100, coverageScore + orphanScore));
  }

  /**
   * Get status
   */
  _getStatus(result) {
    if (result.coveragePercentage >= 95) return 'Excellent';
    if (result.coveragePercentage >= 90) return 'Good';
    if (result.coveragePercentage >= 80) return 'Fair';
    return 'Poor';
  }

  /**
   * Get recommendations
   */
  _getRecommendations(missing, orphan, covered) {
    const recommendations = [];

    if (missing.length > 0) {
      recommendations.push({
        type: 'add_to_sitemap',
        count: missing.length,
        message: `Add ${missing.length} crawled URLs to sitemap that are missing`
      });
    }

    if (orphan.length > 0) {
      const orphanPercent = Math.round((orphan.length / (orphan.length + covered.length)) * 100);
      if (orphanPercent > 10) {
        recommendations.push({
          type: 'remove_orphans',
          count: orphan.length,
          message: `Remove ${orphan.length} orphaned URLs from sitemap (${orphanPercent}% of total)`
        });
      }
    }

    if (covered.length === 0) {
      recommendations.push({
        type: 'investigate',
        count: covered.length,
        message: 'No URLs from crawl are in sitemap - investigate mismatch'
      });
    }

    return recommendations;
  }

  /**
   * Helper: is URL critical?
   */
  _isCritical(url) {
    return url.includes('/') && !url.includes('blog') && !url.includes('news');
  }

  /**
   * Helper: is URL high value?
   */
  _isHighValue(url) {
    return !url.includes('tracking') && !url.includes('utm_') && !url.includes('page=');
  }

  /**
   * Helper: generate cache key
   */
  _getCacheKey(sitemapUrls, crawledUrls) {
    return `${sitemapUrls.length}-${crawledUrls.length}-${Date.now()}`;
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Batch analysis for multiple URL sets
   */
  analyzeBatch(urlSets, options = {}) {
    const results = [];

    for (const set of urlSets) {
      results.push({
        name: set.name,
        validation: this.validate(set.sitemapUrls, set.crawledUrls, options),
        timestamp: new Date().toISOString()
      });
    }

    return results;
  }
}

module.exports = new CoverageValidator();
