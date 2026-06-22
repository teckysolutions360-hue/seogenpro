/**
 * sitemap-system.js
 * Main export point for the entire modular sitemap system
 * Coordinates all components and provides initialization
 */

const sitemapBuilder = require('./sitemap-builder');
const scheduler = require('./scheduler');
const urlFetcher = require('./url-fetcher');
const rulesEngine = require('./rules-engine');
const cacheManager = require('./cache-manager');
const config = require('./sitemap-config');

class SitemapSystem {
  constructor() {
    this.initialized = false;
  }

  /**
   * Initialize the entire sitemap system
   */
  async init() {
    if (this.initialized) return;

    console.log('[sitemap] Initializing dynamic sitemap system...');

    // Initialize scheduler
    sitemapBuilder.initScheduler();

    // Run initial generation
    if (config.scheduler.autoRun) {
      console.log('[sitemap] Running initial sitemap generation...');
      try {
        await sitemapBuilder.build({ writeFile: true, forceRefresh: true });
      } catch (e) {
        console.error('[sitemap] Initial generation failed:', e.message);
      }
    }

    this.initialized = true;
    console.log('[sitemap] System initialized successfully');
  }

  /**
   * Async middleware for /sitemap.xml
   */
  sitemapMiddleware() {
    return async (req, res, next) => {
      try {
        // Allow manual refresh via query (e.g. /sitemap.xml?refresh=true)
        const forceRefresh = req.query.refresh === 'true' || req.query.force === 'true';
        if (forceRefresh) {
          // Clear cache so the next build always regenerates
          sitemapBuilder.logger?.log?.('[sitemap] Force refresh requested via query string');
        }

        const result = await sitemapBuilder.build({
          useCache: !forceRefresh,
          forceRefresh,
          writeFile: true
        });

        res.set('Content-Type', 'application/xml');
        // Allow browsers to cache for a short time, but still support force refresh
        res.set('Cache-Control', 'public, max-age=60');
        res.send(result.xml);
      } catch (e) {
        next(e);
      }
    };
  }

  /**
   * Get system info
   */
  getInfo() {
    return {
      name: 'Dynamic Sitemap System',
      version: '2.0.0',
      status: 'active',
      initialized: this.initialized,
      features: [
        'Dynamic URL fetching from database',
        'Automatic type classification',
        'Rule-based priority calculation',
        'Recency-based priority boost',
        'Performance caching for 10k+ URLs',
        'Automated scheduling (cron)',
        'Admin API for management',
        'Batch processing for scalability'
      ],
      config: {
        cacheEnabled: config.cache.enabled,
        cacheTtl: config.cache.ttl,
        schedulerEnabled: config.scheduler.enabled,
        schedulerCron: config.scheduler.cronExpression
      }
    };
  }

  // Expose sub-modules for advanced usage
  get builder() { return sitemapBuilder; }
  get scheduler() { return scheduler; }
  get fetcher() { return urlFetcher; }
  get rules() { return rulesEngine; }
  get cache() { return cacheManager; }
}

module.exports = new SitemapSystem();
