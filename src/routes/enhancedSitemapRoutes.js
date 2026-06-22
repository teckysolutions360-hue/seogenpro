/**
 * Enhanced Sitemap Routes
 * 
 * Endpoints for production-grade sitemap generation with quality scoring
 */

const express = require('express');
const router = express.Router();
const enhancedSitemapController = require('../controllers/enhancedSitemapController');

/**
 * POST /api/sitemap/enhanced-generate
 * Generate production-grade sitemap with all enhancements
 * 
 * Request body:
 * {
 *   url: "https://example.com",
 *   maxPages: 50000,
 *   maxDepth: Infinity,
 *   validateLastmod: true,
 *   useIntelligentPriority: true,
 *   validateCanonical: false,
 *   extractImages: false,
 *   generateQualityReport: true
 * }
 */
router.post('/enhanced-generate', enhancedSitemapController.generateEnhancedSitemap);

/**
 * GET /api/sitemap/enhanced-status/:jobId
 * Get status of sitemap generation job
 * 
 * Query params:
 * - format: 'full' (default), 'xml', 'analysis', 'stats', 'audit'
 */
router.get('/enhanced-status/:jobId', enhancedSitemapController.getEnhancedSitemapStatus);

/**
 * GET /api/sitemap/enhanced-xml/:jobId
 * Download generated sitemap XML
 */
router.get('/enhanced-xml/:jobId', enhancedSitemapController.getEnhancedSitemapXml);

/**
 * GET /api/sitemap/enhanced-report/:jobId
 * Get detailed quality report in JSON format
 */
router.get('/enhanced-report/:jobId', enhancedSitemapController.getEnhancedSitemapReport);

/**
 * POST /api/sitemap/validate
 * Validate URLs without full crawling
 * 
 * Request body:
 * {
 *   urls: ["https://example.com", "https://example.com/page"]
 * }
 */
router.post('/validate', enhancedSitemapController.validateUrls);

/**
 * POST /api/sitemap/cleanup
 * Clean up old jobs (internal use)
 */
router.post('/cleanup', enhancedSitemapController.cleanup);

/**
 * Health check
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    features: [
      'Real lastmod dates (DB/HTTP/Meta/FileSystem)',
      'Dynamic priority system (22 URL types)',
      'Canonical validation',
      'Image extraction',
      'Quality scoring (0-100)',
      'Coverage analysis',
      'Duplicate detection',
      'Duplicate URL detection',
      'Structured JSON audit output'
    ]
  });
});

module.exports = router;
