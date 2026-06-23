/**
 * url-fetcher.js
 * Fetches sitemap URLs from fallback sources.
 * Handles: pages, blogs, products, services, jobs, categories, legal pages
 */

const config = require('./sitemap-config');

class UrlFetcher {
  constructor() {
    this.cache = null;
    this.cacheTime = 0;
    this.logger = this._createLogger();
  }

  _createLogger() {
    return {
      log: (...args) => config.verbose && console.log('[sitemap-fetcher]', ...args),
      error: (...args) => console.error('[sitemap-fetcher]', ...args),
      debug: (...args) => config.debug && console.log('[sitemap-fetcher-debug]', ...args)
    };
  }

  /**
   * Main fetch: returns sitemap fallback URLs
   */
  async fetchAll() {
    this.logger.log('Starting URL fetch...');
    this.logger.log('Using mock/fallback data');
    return this._getMockUrls();
  }

  /**
   * Normalize rows to URL objects
   */
  _normalizeRows(rows) {
    if (!Array.isArray(rows)) return [];
    return rows
      .filter(r => r && (r.url || r.loc || r.path))
      .map(r => ({
        url: r.url || r.loc || r.path,
        lastmod: r.lastmod || r.updated_at || r.updatedAt || new Date().toISOString(),
        type: r.type || null,
        title: r.title || null,
        status: r.status || 'published'
      }))
      .filter(u => this._isValidUrl(u.url));
  }

  /**
   * Validate URL format
   */
  _isValidUrl(url) {
    if (!url) return false;
    try {
      // Accept relative paths too
      if (url.startsWith('/')) return true;
      new URL(url);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Mock data for testing fallback URL generation
   */
  _getMockUrls() {
    const now = new Date().toISOString();
    const daysAgo = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    return [
      // Homepage
      { url: '/', lastmod: now, type: 'homepage', title: 'Home' },

      // Landing pages
      { url: '/services', lastmod: daysAgo(5), type: 'landing', title: 'Services' },
      { url: '/contact', lastmod: daysAgo(10), type: 'landing', title: 'Contact' },
      { url: '/about', lastmod: daysAgo(20), type: 'landing', title: 'About' },

      // Products
      { url: '/software/product-1', lastmod: daysAgo(2), type: 'product', title: 'Product 1' },
      { url: '/software/product-2', lastmod: daysAgo(8), type: 'product', title: 'Product 2' },
      { url: '/software/product-3', lastmod: daysAgo(15), type: 'product', title: 'Product 3' },

      // Blog posts (recent gets boost)
      { url: '/blog/recent-post', lastmod: daysAgo(1), type: 'blog', title: 'Recent Post' },
      { url: '/blog/week-old-post', lastmod: daysAgo(7), type: 'blog', title: 'Week Old Post' },
      { url: '/blog/old-post', lastmod: daysAgo(60), type: 'blog', title: 'Old Post' },

      // Categories
      { url: '/category/tech', lastmod: daysAgo(3), type: 'category', title: 'Tech' },
      { url: '/category/business', lastmod: daysAgo(5), type: 'category', title: 'Business' },

      // Jobs
      { url: '/job/senior-dev', lastmod: daysAgo(2), type: 'job', title: 'Senior Dev' },
      { url: '/job/designer', lastmod: daysAgo(10), type: 'job', title: 'Designer' },

      // Legal
      { url: '/privacy-policy', lastmod: daysAgo(90), type: 'legal', title: 'Privacy Policy' },
      { url: '/terms-of-service', lastmod: daysAgo(120), type: 'legal', title: 'Terms of Service' }
    ];
  }

  /**
   * Detect page type if not provided by database
   */
  detectType(url) {
    if (!url) return 'other';
    const path = typeof url === 'string' ? url : (url.pathname || url.url || url);

    for (const [type, regex] of Object.entries(config.typePatterns)) {
      if (regex.test(path)) return type;
    }
    return 'other';
  }

  /**
   * Enrich URLs with missing data
   */
  enrichUrls(urls) {
    return urls.map(u => ({
      ...u,
      url: this._normalizeUrlString(u.url),
      type: u.type || this.detectType(u.url),
      lastmod: this._normalizeDate(u.lastmod)
    }));
  }

  _normalizeUrlString(url) {
    if (!url) return url;
    // Convert relative to absolute if needed
    if (url.startsWith('/')) {
      const baseUrl = process.env.SITE_URL || 'https://example.com';
      return baseUrl.replace(/\/$/, '') + url;
    }
    return url;
  }

  _normalizeDate(date) {
    if (!date) return new Date().toISOString();
    try {
      return new Date(date).toISOString();
    } catch (e) {
      return new Date().toISOString();
    }
  }
}

module.exports = new UrlFetcher();
