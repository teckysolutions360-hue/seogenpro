/**
 * Sitemap Analyzer Routes
 * 
 * Routes for sitemap analysis endpoints
 */

const express = require('express');
const SitemapAnalyzerController = require('../controllers/sitemapAnalyzerController');

const router = express.Router();

const crawlController = require('../controllers/crawlController');

/**
 * POST /api/analyze/sitemap
 * Analyze a sitemap (URLs, XML string, or file)
 */
router.post('/sitemap', SitemapAnalyzerController.analyzeSitemap);

/**
 * GET /api/analyze/sitemap/status/:jobId
 * Check analysis status and get results
 */
router.get('/sitemap/status/:jobId', SitemapAnalyzerController.getAnalysisStatus);

/**
 * GET /api/analyze/sitemap/report/:jobId
 * Download analysis report as text
 */
router.get('/sitemap/report/:jobId', SitemapAnalyzerController.downloadReport);

/**
 * GET /api/analyze/sitemap/xml/:jobId
 * Download optimized sitemap as XML
 */
router.get('/sitemap/xml/:jobId', SitemapAnalyzerController.downloadOptimizedXml);

/**
 * GET /api/analyze/sitemap/json/:jobId
 * Download analysis data as JSON
 */
router.get('/sitemap/json/:jobId', SitemapAnalyzerController.downloadJson);

/**
 * POST /api/analyze/classify
 * Classify a single URL
 */
router.post('/classify', SitemapAnalyzerController.classifyUrl);

/**
 * POST /api/analyze/classify-bulk
 * Classify multiple URLs
 */
router.post('/classify-bulk', SitemapAnalyzerController.classifyBulk);

/**
 * GET /api/analyze/stats/:jobId
 * Get job statistics
 */
router.get('/stats/:jobId', SitemapAnalyzerController.getJobStats);

/**
 * GET /api/analyze/jobs
 * List all analysis jobs
 */
router.get('/jobs', SitemapAnalyzerController.listJobs);

/**
 * DELETE /api/analyze/jobs/:jobId
 * Clear a specific job
 */
router.delete('/jobs/:jobId', SitemapAnalyzerController.clearJob);

// Crawl audit (runs Python script and returns JSON report)
router.post('/crawl', crawlController.runCrawlAudit);

module.exports = router;
