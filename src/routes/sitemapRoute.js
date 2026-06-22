const express = require('express');
const router = express.Router();
const { expressMiddleware } = require('../services/dynamicSitemapGenerator');

// GET /sitemap.xml - serve the dynamic sitemap
router.get('/sitemap.xml', expressMiddleware());

// Optional: POST /sitemap/refresh to manually regenerate and save
router.post('/sitemap/refresh', async (req, res, next) => {
  try {
    const { generateSitemap } = require('../services/dynamicSitemapGenerator');
    const result = await generateSitemap({ writeFile: true });
    res.json({
      success: true,
      totalUrls: result.urls.length,
      generatedAt: result.audit.generatedAt,
      byType: result.audit.byType
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
