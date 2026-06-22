const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * V2.0: Comprehensive Audit Controller
 * Uses new unified audit service with:
 * - Enhanced crawler
 * - Robots.txt validation
 * - Sitemap validation
 * - Dynamic scoring
 * - LLM integration
 */
exports.runCrawlAudit = async (req, res, next) => {
  try {
    console.log('[crawlController] Crawl Audit Request');
    const { url, maxPages, depthLimit, concurrency, followExternal, rateLimitMs, renderAllPages } = req.body || {};
    if (!url) return res.status(400).json({ error: 'Missing url in request body' });

    // Normalize URL
    let normalizedUrl = url;
    try {
      const u = new URL(url);
      normalizedUrl = u.href;
    } catch (e) {
      try {
        const u2 = new URL('https://' + url);
        normalizedUrl = u2.href;
      } catch (e2) {
        return res.status(400).json({ error: 'Invalid URL', details: 'Provide a valid absolute URL, e.g. https://example.com' });
      }
    }

    const crawlAuditService = require('../services/crawlAuditService');
    try {
      const opts = {
        maxPages: Number(maxPages) || 100,
        depthLimit: Number(depthLimit) || 2,
        concurrency: Number(concurrency) || 12,
        followExternal: !!followExternal,
        rateLimitMs: Number(rateLimitMs) || 0,
        renderAllPages: !!renderAllPages
      };

      console.log('[crawlController] Running crawl audit with options:', opts);
      const report = await crawlAuditService.generateAudit(normalizedUrl, opts);

      return res.json({ 
        success: true, 
        report,
        version: '1.0',
        timestamp: new Date().toISOString()
      });
    } catch (e) {
      console.error('[crawlController] Audit error:', e && (e.stack || e));
      return res.status(500).json({ 
        error: 'Crawl audit failed', 
        details: (e && e.message) || 'Unknown error' 
      });
    }
  } catch (err) {
    console.error('[crawlController] Unexpected error:', err && (err.stack || err));
    return res.status(500).json({ 
      error: 'Internal server error', 
      details: (err && err.message) || 'Unknown' 
    });
  }
};
