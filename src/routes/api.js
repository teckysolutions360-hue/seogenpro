const express = require('express');
const router = express.Router();

const robotsController = require('../controllers/robotsController');
const sitemapController = require('../controllers/sitemapController');
// new modular SaaS sitemap service (preferred)
const saasSitemapRoutes = require('../services/saas-sitemap/saas-sitemap-routes');
const llmsController = require('../controllers/llmsController');
const analyzeRoutes = require('./analyzeRoutes');
const enhancedSitemapRoutes = require('./enhancedSitemapRoutes');

// Robots.txt routes
router.post('/generate/robots', robotsController.generateRobotsTxt);
router.post('/validate/robots', robotsController.validateRobotsTxt);

// Sitemap.xml routes (legacy endpoints remain but now use the new generator internally)
router.post('/generate/sitemap', sitemapController.generateSitemap);
router.get('/sitemap/status/:jobId', sitemapController.getSitemapStatus);

// SaaS-oriented routes provide the full queue/status/download interface
router.use('/saas/sitemap', saasSitemapRoutes);

// Llms.txt routes
router.post('/generate/llms', llmsController.generateLlmsTxt);
router.get('/llms/status/:jobId', llmsController.getLlmsStatus);
router.post('/enhance/llms', llmsController.enhanceWithAI);

// Sitemap Analyzer routes
router.use('/analyze', analyzeRoutes);

// Enhanced Sitemap Routes (SEO Engine) - at /api/seo-engine/*
router.use('/seo-engine', enhancedSitemapRoutes);

module.exports = router;