/**
 * Canonical Validator
 * 
 * Validates canonical tags:
 * - Fetch page HTML
 * - Extract canonical tag
 * - Compare with sitemap URL
 * - Log mismatches
 * - Mark for exclusion if needed
 */

const axios = require('axios');
const cheerio = require('cheerio');

class CanonicalValidator {
  constructor() {
    this.cache = new Map();
    this.CACHE_TTL = 3600000; // 1 hour
    this.warnings = [];
    this.errors = [];
  }

  /**
   * Validate canonical tag for a URL
   */
  async validate(url, options = {}) {
    const {
      cache = true,
      timeout = 8000,
      followCanonical = false
    } = options;

    // Check cache first
    if (cache && this.cache.has(url)) {
      const cached = this.cache.get(url);
      if (Date.now() - cached.timestamp < this.CACHE_TTL) {
        return cached.value;
      }
    }

    try {
      const result = await this._fetchAndValidate(url, timeout);
      
      // Cache result
      if (cache) {
        this.cache.set(url, {
          value: result,
          timestamp: Date.now()
        });
      }

      return result;
    } catch (error) {
      const errorResult = {
        url,
        canonical: null,
        matches: null,
        status: 'error',
        error: error.message
      };

      this.errors.push(`${url}: ${error.message}`);
      return errorResult;
    }
  }

  /**
   * Fetch page and validate canonical
   */
  async _fetchAndValidate(url, timeout = 8000) {
    const response = await axios.get(url, {
      timeout,
      maxRedirects: 3,
      headers: {
        'User-Agent': 'SitemapValidator/1.0',
        'Accept': 'text/html,application/xhtml+xml'
      },
      validateStatus: () => true // Accept any status to check canonical even on errors
    });

    if (response.status === 404 || response.status === 410) {
      this.warnings.push(`URL returned ${response.status}: ${url}`);
      return {
        url,
        canonical: null,
        matches: false,
        status: response.status.toString(),
        shouldExclude: true
      };
    }

    const canonical = this._extractCanonical(response.data, url);

    // Normalize URLs for comparison
    const normalizedUrl = this._normalizeUrl(url);
    const normalizedCanonical = canonical ? this._normalizeUrl(canonical) : null;

    const matches = normalizedUrl === normalizedCanonical;

    if (!matches && canonical) {
      this.warnings.push(`Canonical mismatch for ${url}: ${canonical}`);
    }

    return {
      url,
      canonical,
      normalizedUrl,
      normalizedCanonical,
      matches,
      httpStatus: response.status,
      shouldExclude: !matches && canonical !== null,
      status: 'valid'
    };
  }

  /**
   * Extract canonical tag from HTML
   */
  _extractCanonical(html, fallbackUrl = '') {
    try {
      const $ = cheerio.load(html);

      // Look for canonical link tag
      const canonicalLink = $('link[rel="canonical"]').attr('href');
      if (canonicalLink) {
        return canonicalLink;
      }

      // Also check for Open Graph URL (sometimes used as canonical)
      const ogUrl = $('meta[property="og:url"]').attr('content');
      if (ogUrl && ogUrl !== fallbackUrl) {
        return ogUrl;
      }

      return null;
    } catch (error) {
      console.error('Error parsing HTML:', error.message);
      return null;
    }
  }

  /**
   * Normalize URL for comparison (removes trailing slash, params, etc.)
   */
  _normalizeUrl(urlString) {
    try {
      const url = new URL(urlString);
      // Remove trailing slash, keep rest intact
      let normalized = url.origin + url.pathname;
      if (normalized.endsWith('/') && normalized.length > 1) {
        normalized = normalized.slice(0, -1);
      }
      return normalized.toLowerCase();
    } catch (error) {
      return urlString.toLowerCase();
    }
  }

  /**
   * Batch validate URLs
   */
  async validateBatch(urls, options = {}) {
    const {
      concurrency = 3
    } = options;

    const results = {
      validated: [],
      mismatches: [],
      errors: [],
      shouldExclude: []
    };

    // Process with concurrency control
    const chunks = this._chunkArray(urls, concurrency);

    for (const chunk of chunks) {
      const promises = chunk.map(url => this.validate(url, options));
      const chunkResults = await Promise.allSettled(promises);

      chunkResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          const validation = result.value;
          results.validated.push(validation);

          if (!validation.matches && validation.canonical) {
            results.mismatches.push(validation);
          }

          if (validation.shouldExclude) {
            results.shouldExclude.push(validation.url);
          }

          if (validation.status === 'error') {
            results.errors.push(validation);
          }
        } else {
          results.errors.push({
            url: url,
            error: result.reason?.message || 'Unknown error'
          });
        }
      });
    }

    return results;
  }

  /**
   * Get recommendations for URL based on canonical status
   */
  getRecommendations(validationResult) {
    const recommendations = [];

    if (!validationResult.matches && validationResult.canonical) {
      recommendations.push({
        severity: 'medium',
        message: 'Canonical mismatch detected',
        action: `Remove from sitemap or update canonical tag`,
        details: {
          sitemapUrl: validationResult.url,
          canonicalUrl: validationResult.canonical
        }
      });
    }

    if (validationResult.httpStatus === 301 || validationResult.httpStatus === 302) {
      recommendations.push({
        severity: 'high',
        message: 'Page is redirected',
        action: 'Use the final destination URL in sitemap',
        details: {
          status: validationResult.httpStatus
        }
      });
    }

    if (validationResult.httpStatus === 404 || validationResult.httpStatus === 410) {
      recommendations.push({
        severity: 'high',
        message: 'Page not found or gone',
        action: 'Remove from sitemap and update robots.txt',
        details: {
          status: validationResult.httpStatus
        }
      });
    }

    return recommendations;
  }

  /**
   * Generate report
   */
  getReport() {
    return {
      totalWarnings: this.warnings.length,
      totalErrors: this.errors.length,
      warnings: this.warnings.slice(0, 10), // Last 10
      errors: this.errors.slice(0, 10), // Last 10
      cacheEntries: this.cache.size
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    this.warnings = [];
    this.errors = [];
    return { cleared: true };
  }

  /**
   * Helper: chunk array
   */
  _chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

module.exports = new CanonicalValidator();
