/**
 * cache-manager.js
 * In-memory cache for sitemap with TTL and size limits
 * Improves performance for 10k+ URL sitemaps
 */

const config = require('./sitemap-config');

class CacheManager {
  constructor() {
    this.cache = null;
    this.timestamp = null;
    this.config = config.cache;
  }

  /**
   * Get cached sitemap
   */
  get() {
    if (!this.config.enabled || !this.cache) return null;

    // Check TTL
    const age = Date.now() - this.timestamp;
    if (age > this.config.ttl) {
      console.log('[sitemap-cache] Cache expired, clearing');
      this.clear();
      return null;
    }

    console.log(`[sitemap-cache] Serving from cache (age: ${Math.round(age / 1000)}s)`);
    return this.cache;
  }

  /**
   * Set cache
   */
  set(data) {
    if (!this.config.enabled) return;

    // Respect size limit
    if (data && data.length > this.config.maxSize) {
      console.warn(`[sitemap-cache] Data exceeds max size (${data.length} > ${this.config.maxSize})`);
    }

    this.cache = data;
    this.timestamp = Date.now();
    console.log(`[sitemap-cache] Cached ${data.length} URLs (TTL: ${Math.round(this.config.ttl / 1000)}s)`);
  }

  /**
   * Clear cache
   */
  clear() {
    this.cache = null;
    this.timestamp = null;
    console.log('[sitemap-cache] Cache cleared');
  }

  /**
   * Get cache status
   */
  getStatus() {
    return {
      enabled: this.config.enabled,
      isCached: this.cache !== null,
      itemCount: this.cache ? this.cache.length : 0,
      age: this.timestamp ? Date.now() - this.timestamp : null,
      ttl: this.config.ttl,
      isValid: this.cache !== null && (Date.now() - this.timestamp) <= this.config.ttl
    };
  }
}

module.exports = new CacheManager();
