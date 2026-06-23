/**
 * sitemap-builder.js
 * Orchestrates the full sitemap generation pipeline
 * Fetches URLs, applies rules, deduplicates, generates XML
 */

const fs = require('fs');
const path = require('path');
const { Builder } = require('xml2js');
const config = require('./sitemap-config');
const urlFetcher = require('./url-fetcher');
const rulesEngine = require('./rules-engine');
const cacheManager = require('./cache-manager');
const scheduler = require('./scheduler');

class SitemapBuilder {
  constructor() {
    this.logger = {
      log: (...a) => config.verbose && console.log('[sitemap-builder]', ...a),
      error: (...a) => console.error('[sitemap-builder]', ...a)
    };
  }

  /**
   * Main build pipeline
   */
  async build(options = {}) {
    const startTime = Date.now();
    this.logger.log('Starting build pipeline...');

    try {
      // 1. Check cache (if enabled and not forced refresh)
      if (!options.forceRefresh && options.useCache !== false) {
        const cached = cacheManager.get();
        if (cached) return cached;
      }

      // 2. Fetch all sitemap URLs from fallback source
      this.logger.log('Fetching URLs...');
      let urls = await urlFetcher.fetchAll();
      urls = urlFetcher.enrichUrls(urls);
      this.logger.log(`Fetched ${urls.length} URLs`);

      // 3. Deduplicate
      urls = this._deduplicate(urls);
      this.logger.log(`After dedup: ${urls.length} URLs`);

      // 4. Apply rules engine (calculate priority, changefreq)
      this.logger.log('Applying rules...');
      const enriched = rulesEngine.calculateBatch(urls);
      this.logger.log(`Rules applied`);

      // 5. Batch process for performance (especially for 10k+)
      const batches = this._createBatches(enriched, config.performance.batchSize);
      this.logger.log(`Processing ${batches.length} batches of ${config.performance.batchSize}...`);

      let allUrls = [];
      for (const batch of batches) {
        allUrls = allUrls.concat(batch);
      }

      // 6. Generate XML
      this.logger.log('Generating XML...');
      const xml = this._generateXml(allUrls);
      this.logger.log(`XML generated: ${(xml.length / 1024).toFixed(2)} KB`);

      // 7. Write to file if specified
      if (options.writeFile !== false) {
        if (this._canWriteOutput()) {
          this._writeFile(xml);
        } else {
          this.logger.log('Skipping sitemap file write because the configured output path is not writable.');
        }
      }

      // 8. Get statistics
      const stats = this._getStats(allUrls);

      const generationTime = Date.now() - startTime;
      const result = {
        status: 'success',
        xml,
        urls: allUrls,
        count: allUrls.length,
        stats,
        generationTime,
        generatedAt: new Date().toISOString(),
        fileSize: `${(xml.length / 1024).toFixed(2)} KB`
      };

      // 9. Cache for next request
      cacheManager.set(result);

      this.logger.log(`Build complete in ${generationTime}ms`);
      return result;
    } catch (e) {
      this.logger.error('Build failed:', e.message);
      throw e;
    }
  }

  /**
   * Deduplicate URLs by normalized href
   */
  _normalize(urlString) {
    try {
      const url = new URL(urlString);
      url.protocol = url.protocol.toLowerCase();
      url.hostname = url.hostname.toLowerCase().replace(/^www\./,'');
      if ((url.protocol === 'http:' && url.port === '80') || (url.protocol === 'https:' && url.port === '443')) {
        url.port = '';
      }
      // strip trailing slash except root
      if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
        url.pathname = url.pathname.slice(0, -1);
      }
      // remove hash and common tracking params
      const params = new URLSearchParams(url.search);
      const keep = ['page','id','category','filter','sort'];
      const newParams = new URLSearchParams();
      keep.forEach(p=>{ if(params.has(p)) newParams.set(p, params.get(p)); });
      url.search = newParams.toString();
      url.hash = '';
      return url.toString();
    } catch (e) {
      return urlString;
    }
  }

  _deduplicate(urls) {
    const seen = new Set();
    const deduped = [];

    for (const url of urls) {
      try {
        const normalized = this._normalize(url.url);
        if (!seen.has(normalized)) {
          seen.add(normalized);
          deduped.push({ ...url, url: normalized });
        }
      } catch (e) {
        // Skip invalid URLs
      }
    }

    return deduped;
  }

  /**
   * Split into batches for processing
   */
  _createBatches(items, batchSize) {
    const batches = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Generate sitemap XML
   */
  _generateXml(urls) {
    const urlElements = urls.map(u => {
      const obj = {};
      obj.loc = u.url;
      if (u.lastmod) obj.lastmod = u.lastmod;
      if (u.changefreq) obj.changefreq = u.changefreq;
      if (u.priority !== undefined && u.priority !== null) {
        obj.priority = u.priority.toString();
      }
      return obj;
    });

    const obj = {
      urlset: {
        $: { xmlns: 'http://www.sitemaps.org/schemas/sitemap/0.9' },
        url: urlElements
      }
    };

    // Add news namespace if configured
    if (config.output.includeNewsNamespace) {
      obj.urlset.$['xmlns:news'] = 'http://www.google.com/schemas/sitemap-news/0.9';
    }

    const builder = new Builder({ xmldec: { version: '1.0', encoding: 'UTF-8' } });
    return builder.buildObject(obj);
  }

  /**
   * Write XML to file
   */
  _canWriteOutput() {
    try {
      const filePath = path.join(config.output.path, config.output.filename);
      const dir = path.dirname(filePath);
      fs.accessSync(dir, fs.constants.W_OK);
      return true;
    } catch (e) {
      this.logger.log('Output path not writable:', e.message);
      return false;
    }
  }

  _writeFile(xml) {
    try {
      const filePath = path.join(config.output.path, config.output.filename);
      fs.writeFileSync(filePath, xml, 'utf8');
      this.logger.log(`Written to ${filePath}`);
    } catch (e) {
      this.logger.error('Write failed:', e.message);
    }
  }

  /**
   * Get statistics
   */
  _getStats(urls) {
    const stats = rulesEngine.getStats(urls);
    const avgAge = Math.round(
      urls.reduce((sum, u) => sum + this._getAgeDays(u.lastmod), 0) / urls.length
    );

    return {
      totalUrls: urls.length,
      byType: stats.byType,
      byPriority: stats.byPriority,
      boostedCount: stats.boostedCount,
      averageAgeDays: avgAge
    };
  }

  _getAgeDays(dateStr) {
    if (!dateStr) return 999;
    try {
      const date = new Date(dateStr);
      return Math.floor((Date.now() - date) / (1000 * 60 * 60 * 24));
    } catch (e) {
      return 999;
    }
  }

  /**
   * Initialize scheduler
   */
  initScheduler() {
    scheduler.init(() => this.build({ writeFile: true, forceRefresh: true }));
  }

  /**
   * Get various status info
   */
  getStatus() {
    return {
      cache: cacheManager.getStatus(),
      scheduler: scheduler.getStatus(),
      config: {
        batchSize: config.performance.batchSize,
        maxUrls: config.output.maxUrlsPerSitemap
      }
    };
  }
}

module.exports = new SitemapBuilder();
