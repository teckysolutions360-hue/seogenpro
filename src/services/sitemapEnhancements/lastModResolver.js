/**
 * Last Modified Resolver
 * 
 * Gets real lastmod date from:
 * - Database updated_at field
 * - HTTP Last-Modified header
 * - File system modified time
 * - Page metadata
 */

const axios = require('axios');
const fs = require('fs');

class LastModResolver {
  constructor() {
    this.cache = new Map();
    this.CACHE_TTL = 3600000; // 1 hour
  }

  /**
   * Main resolver - tries multiple sources
   */
  async resolveLastMod(url, options = {}) {
    const {
      cache = true,
      dbData = null,
      fallbackToNow = false
    } = options;

    // Check cache first
    if (cache && this.cache.has(url)) {
      const cached = this.cache.get(url);
      if (Date.now() - cached.timestamp < this.CACHE_TTL) {
        return cached.value;
      }
    }

    let lastmod = null;
    let source = null;

    // Priority order: DB → HTTP Header → Page Meta → File System → Now
    try {
      // 1. Try database data (if provided)
      if (dbData && dbData[url]) {
        lastmod = this._resolveDbDate(dbData[url]);
        source = 'database';
      }

      // 2. Try HTTP Last-Modified header
      if (!lastmod) {
        const headerDate = await this._getLastModifiedHeader(url);
        if (headerDate) {
          lastmod = headerDate;
          source = 'http_header';
        }
      }

      // 3. Try page metadata (Open Graph, JSON-LD, etc.)
      if (!lastmod) {
        const metaDate = await this._getPageMetaDate(url);
        if (metaDate) {
          lastmod = metaDate;
          source = 'page_metadata';
        }
      }

      // 4. Fallback if still not found
      if (!lastmod) {
        if (fallbackToNow) {
          lastmod = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
          source = 'fallback_now';
        } else {
          lastmod = null;
          source = 'none_available';
        }
      }
    } catch (error) {
      console.error(`Error resolving lastmod for ${url}:`, error.message);
      if (fallbackToNow) {
        lastmod = new Date().toISOString().split('T')[0];
        source = 'error_fallback';
      }
    }

    // Cache result
    if (cache && lastmod) {
      this.cache.set(url, {
        value: lastmod,
        source,
        timestamp: Date.now()
      });
    }

    return {
      date: lastmod,
      source,
      timestamp: Date.now()
    };
  }

  /**
   * Get lastmod from database-provided data
   */
  _resolveDbDate(dbRecord) {
    if (!dbRecord) return null;

    // Try common field names
    const dateFields = ['updated_at', 'updatedAt', 'modified_at', 'modifiedAt', 'last_modified', 'lastModified', 'date', 'published_at', 'publishedAt'];

    for (const field of dateFields) {
      if (dbRecord[field]) {
        return this._normalizeDate(dbRecord[field]);
      }
    }

    return null;
  }

  /**
   * Get Last-Modified header from HTTP response
   */
  async _getLastModifiedHeader(url, timeout = 5000) {
    try {
      const response = await axios.head(url, {
        timeout,
        maxRedirects: 3,
        validateStatus: () => true // Accept any status
      });

      if (response.headers['last-modified']) {
        return this._normalizeDate(response.headers['last-modified']);
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Extract lastmod date from page metadata
   */
  async _getPageMetaDate(url, timeout = 8000) {
    try {
      const response = await axios.get(url, {
        timeout,
        maxRedirects: 3,
        headers: {
          'User-Agent': 'SitemapGenerator/1.0'
        }
      });

      const html = response.data;

      // Try different meta patterns
      const metaPatterns = [
        /<meta property="article:modified_time" content="([^"]+)"/i,
        /<meta property="article:published_time" content="([^"]+)"/i,
        /<meta name="modified" content="([^"]+)"/i,
        /<meta name="publish_date" content="([^"]+)"/i,
        /<time datetime="([^"]+)"/i,
        /"dateModified":\s*"([^"]+)"/i,
        /"datePublished":\s*"([^"]+)"/i
      ];

      for (const pattern of metaPatterns) {
        const match = html.match(pattern);
        if (match && match[1]) {
          return this._normalizeDate(match[1]);
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get lastmod from file system (for static files)
   */
  getFileSystemDate(filePath) {
    try {
      const stats = fs.statSync(filePath);
      return this._normalizeDate(stats.mtime);
    } catch (error) {
      return null;
    }
  }

  /**
   * Normalize various date formats to ISO 8601
   */
  _normalizeDate(dateValue) {
    if (!dateValue) return null;

    try {
      // If already a Date object
      if (dateValue instanceof Date) {
        return dateValue.toISOString().split('T')[0]; // YYYY-MM-DD
      }

      // If it's a string, try to parse it
      if (typeof dateValue === 'string') {
        // Try parsing as ISO date
        const parsed = new Date(dateValue);
        if (!isNaN(parsed.getTime())) {
          return parsed.toISOString().split('T')[0];
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Batch resolve lastmod for multiple URLs
   */
  async resolveBatch(urls, options = {}) {
    const results = {};

    // Parallel processing with concurrency control
    const concurrency = options.concurrency || 5;
    const chunks = this._chunkArray(urls, concurrency);

    for (const chunk of chunks) {
      const promises = chunk.map(async (url) => ({
        url,
        ...await this.resolveLastMod(url, options)
      }));

      const chunkResults = await Promise.allSettled(promises);
      
      chunkResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          results[result.value.url] = result.value;
        }
      });
    }

    return results;
  }

  /**
   * Get all cache entries
   */
  getCacheStats() {
    return {
      entries: this.cache.size,
      lastCleared: null
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    return { cleared: true };
  }

  /**
   * Helper: chunk array for concurrency
   */
  _chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

module.exports = new LastModResolver();
