/**
 * sitemap-admin-routes.js
 * Admin API endpoints for sitemap management
 * - GET /api/sitemap/admin/status - system status
 * - POST /api/sitemap/admin/regenerate - force regeneration
 * - GET /api/sitemap/admin/preview - preview of URLs and priorities
 * - GET /api/sitemap/admin/stats - statistics
 * - POST /api/sitemap/admin/cache/clear - clear cache
 * - POST /api/sitemap/admin/scheduler/run - manual scheduler run
 */

const express = require('express');
const router = express.Router();
const sitemapBuilder = require('./sitemap-builder');
const cacheManager = require('./cache-manager');
const scheduler = require('./scheduler');
const urlFetcher = require('./url-fetcher');
const rulesEngine = require('./rules-engine');

/**
 * GET /api/sitemap/admin/status
 * Get overall system status
 */
router.get('/status', async (req, res, next) => {
  try {
    const status = sitemapBuilder.getStatus();
    res.json({
      status: 'ok',
      system: status,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/sitemap/admin/regenerate
 * Force regeneration of sitemap
 */
router.post('/regenerate', async (req, res, next) => {
  try {
    const { forceRefresh = true } = req.body;
    console.log('[admin] Starting regeneration...');

    const result = await sitemapBuilder.build({
      forceRefresh,
      writeFile: true,
      useCache: false
    });

    res.json({
      success: true,
      message: 'Sitemap regenerated',
      urls: result.count,
      time: result.generationTime,
      generatedAt: result.generatedAt,
      stats: result.stats
    });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/sitemap/admin/preview
 * Preview URLs with priorities and changefreq
 */
router.get('/preview', async (req, res, next) => {
  try {
    const { limit = 50, type, minPriority } = req.query;
    console.log(`[admin] Generating preview (limit=${limit}, type=${type})...`);

    // Fetch and enrich URLs
    let urls = await urlFetcher.fetchAll();
    urls = urlFetcher.enrichUrls(urls);

    // Apply rules
    urls = rulesEngine.calculateBatch(urls);

    // Filter by type if specified
    if (type) {
      urls = urls.filter(u => u.type === type);
    }

    // Filter by minPriority if specified
    if (minPriority) {
      urls = urls.filter(u => parseFloat(u.priority) >= parseFloat(minPriority));
    }

    // Sort by priority descending
    urls.sort((a, b) => parseFloat(b.priority) - parseFloat(a.priority));

    // Limit results
    const preview = urls.slice(0, Math.min(limit, urls.length));

    res.json({
      preview: preview.map(u => ({
        url: u.url,
        type: u.type,
        priority: u.priority,
        changefreq: u.changefreq,
        lastmod: u.lastmod,
        boosted: u.boosted
      })),
      total: urls.length,
      filtered: preview.length
    });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/sitemap/admin/stats
 * Get detailed statistics
 */
router.get('/stats', async (req, res, next) => {
  try {
    console.log('[admin] Generating statistics...');

    // Fetch URLs
    let urls = await urlFetcher.fetchAll();
    urls = urlFetcher.enrichUrls(urls);

    // Apply rules and get stats
    urls = rulesEngine.calculateBatch(urls);
    const stats = rulesEngine.getStats(urls);

    res.json({
      stats: {
        ...stats,
        total: urls.length
      },
      samplesByType: Object.entries(stats.byType).reduce((acc, [type, count]) => {
        acc[type] = {
          count,
          percentage: ((count / urls.length) * 100).toFixed(1) + '%',
          sampleUrls: urls
            .filter(u => u.type === type)
            .slice(0, 3)
            .map(u => ({ url: u.url, priority: u.priority }))
        };
        return acc;
      }, {})
    });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/sitemap/admin/cache/clear
 * Clear cache
 */
router.post('/cache/clear', (req, res, next) => {
  try {
    cacheManager.clear();
    res.json({ success: true, message: 'Cache cleared' });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/sitemap/admin/cache/status
 * Get cache status
 */
router.get('/cache/status', (req, res, next) => {
  try {
    const status = cacheManager.getStatus();
    res.json({ cache: status });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/sitemap/admin/scheduler/run
 * Manually trigger scheduler
 */
router.post('/scheduler/run', async (req, res, next) => {
  try {
    console.log('[admin] Manual scheduler trigger...');
    const result = await scheduler.runNow();
    res.json({
      success: true,
      message: 'Scheduler executed',
      lastRun: result.lastRun
    });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/sitemap/admin/scheduler/status
 * Get scheduler status
 */
router.get('/scheduler/status', (req, res, next) => {
  try {
    const status = scheduler.getStatus();
    res.json({ scheduler: status });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
