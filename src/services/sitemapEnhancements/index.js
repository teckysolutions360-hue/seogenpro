/**
 * Sitemap Enhancements - Main Export
 * 
 * Provides access to all enhancement modules
 */

const orchestrator = require('./orchestrator');
const xmlStructureValidator = require('./xmlStructureValidator');
const lastModResolver = require('./lastModResolver');
const priorityCalculator = require('./priorityCalculator');
const canonicalValidator = require('./canonicalValidator');
const imageExtractor = require('./imageExtractor');
const sitemapIndexGenerator = require('./sitemapIndexGenerator');
const coverageValidator = require('./coverageValidator');
const seoQualityScorer = require('./seoQualityScorer');

module.exports = {
  // Main orchestrator
  orchestrator,

  // Individual modules
  xmlStructureValidator,
  lastModResolver,
  priorityCalculator,
  canonicalValidator,
  imageExtractor,
  sitemapIndexGenerator,
  coverageValidator,
  seoQualityScorer,

  // Convenient wrapper
  async generateEnhancedSitemap(urls, options) {
    return orchestrator.generateEnhancedSitemap(urls, options);
  },

  getStatistics(result) {
    return orchestrator.getStatistics(result);
  },

  getRecommendations(result) {
    return orchestrator.getRecommendations(result);
  }
};
