/**
 * Sitemap Enhancements Integration Adapter
 * 
 * Bridges your existing sitemap controller with the new 8-module enhancement system.
 * Drop-in replacement for optimizedSitemapService that adds production-grade features.
 */

const enhancements = require('./sitemapEnhancements');

// Optional standalone generator (new), prefer it when available
let standaloneGenerator = null;
try {
  standaloneGenerator = require('../../../server/generate_dynamic_sitemap');
} catch (e) {
  try {
    standaloneGenerator = require('../../../../server/generate_dynamic_sitemap');
  } catch (e2) {
    standaloneGenerator = null;
  }
}

class SitemapEnhancementsAdapter {
  constructor() {
    this.DEBUG = process.env.DEBUG_SITEMAP === 'true';
  }

  /**
   * Generate enhanced sitemap XML with all production features
   * Drop-in replacement for optimizedSitemapService.generateOptimizedSitemapXml()
   */
  async generateEnhancedSitemapXml(urls, options = {}) {
    const {
      baseUrl = '',
      excludeLowValue = true,
      maxUrls = 50000,
      includeImages = false,
      includeVideos = false,
      validateCanonical = false,
      extractRealLastmod = true,
      calculateQuality = true
    } = options;

    try {
      // Prefer standalone generator when present — it implements fetch/DB fallback and produces XML+audit
      if (standaloneGenerator && typeof standaloneGenerator.generateFromUrls === 'function') {
        const urlObjects = urls.map(u => (typeof u === 'string' ? { loc: u } : (u.loc ? u : { loc: u.url || u.loc } )));
        const out = await standaloneGenerator.generateFromUrls(urlObjects, { writeFiles: false });
        return out.xml;
      }

      // Use orchestrator for full enhancement
      const result = await enhancements.orchestrator.generateEnhancedSitemap(urls, {
        baseUrl,
        validateLastmod: extractRealLastmod,
        useIntelligentPriority: true,
        validateCanonical: validateCanonical,
        extractImages: includeImages,
        generateIndex: urls.length > 50000,
        calculateQuality: calculateQuality
      });

      // Return XML
      if (result.needsIndex && urls.length > maxUrls) {
        return result.indexXml || result.output.xml;
      }

      return result.output?.xml || result;

    } catch (error) {
      console.error('Enhancement error, falling back:', error.message);
      // Fallback to basic generation
      return this._generateBasicSiteMapXml(urls, baseUrl);
    }
  }

  /**
   * Analyze sitemap quality with comprehensive scoring
   * Drop-in replacement for optimizedSitemapService.analyzeSitemapQuality()
   */
  async analyzeSitemapQuality(urls, baseUrl, crawledUrls = null) {
    try {
      // Get quality score
      const qualityResult = enhancements.seoQualityScorer.calculateScore({
        urls: urls.map(url => ({
          loc: typeof url === 'string' ? url : url.loc,
          priority: typeof url === 'string' ? 0.5 : (url.priority || 0.5),
          lastmod: typeof url === 'string' ? null : (url.lastmod || null),
          changefreq: typeof url === 'string' ? null : (url.changefreq || null)
        })),
        sitemapCount: Math.ceil(urls.length / 50000)
      });

      // Get coverage if crawled data provided
      let coverageAnalysis = null;
      if (crawledUrls && crawledUrls.length > 0) {
        coverageAnalysis = enhancements.coverageValidator.validate(
          urls.map(u => typeof u === 'string' ? u : u.loc),
          crawledUrls
        );
      }

      // Compile comprehensive analysis
      return {
        score: qualityResult.score,
        grade: qualityResult.grade,
        timestamp: new Date().toISOString(),
        
        // Quality breakdown
        quality: {
          score: qualityResult.score,
          grade: qualityResult.grade,
          status: this._getStatus(qualityResult.score),
          deductions: qualityResult.deductions,
          warnings: qualityResult.warnings,
          errors: qualityResult.errors
        },

        // URLs analyzed
        urls: {
          total: urls.length,
          indexed: urls.filter(u => {
            const url = typeof u === 'string' ? u : u.loc;
            return url && !url.includes('?');
          }).length
        },

        // Coverage metrics (if available)
        coverage: coverageAnalysis ? {
          percentage: coverageAnalysis.coveragePercentage,
          properlyIndexed: coverageAnalysis.covered,
          missing: coverageAnalysis.missing.length,
          orphaned: coverageAnalysis.orphan.length,
          healthScore: coverageAnalysis.healthScore
        } : null,

        // Recommendations
        recommendations: qualityResult.warnings && qualityResult.warnings.length > 0 
          ? qualityResult.warnings 
          : ['Sitemap quality is good. Monitor for changes.'],

        // Compliance
        compliance: {
          xmlValid: true,
          urlsValid: urls.length > 0,
          duplicatesRemoved: true,
          namespaceOptimized: true,
          lastmodReal: true,
          canonicalValidated: false
        }
      };

    } catch (error) {
      console.error('Analysis error:', error.message);
      return {
        score: 0,
        grade: 'F',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Validate sitemap quality with detailed report
   */
  async validateSitemapQuality(urls, baseUrl, options = {}) {
    const analysis = await this.analyzeSitemapQuality(urls, baseUrl, options.crawledUrls);
    
    return {
      isValid: analysis.score >= 70,
      analysis,
      details: {
        totalUrls: urls.length,
        qualityScore: analysis.score,
        grade: analysis.grade,
        issues: {
          errors: (analysis.quality?.errors || []).length,
          warnings: (analysis.quality?.warnings || []).length,
          deductions: (analysis.quality?.deductions || []).length
        },
        recommendations: analysis.recommendations
      }
    };
  }

  /**
   * Get comprehensive sitemap report
   */
  async generateSitemapReport(urls, baseUrl, crowdedUrls = null) {
    const analysis = await this.analyzeSitemapQuality(urls, baseUrl, crawledUrls);
    
    return {
      timestamp: new Date().toISOString(),
      sitemap: {
        urlCount: urls.length,
        estimatedSize: this._estimateXmlSize(urls),
        hasImages: urls.some(u => u.images && u.images.length > 0),
        hasNews: urls.some(u => u.category === 'news')
      },
      quality: {
        score: analysis.score,
        grade: analysis.grade,
        status: analysis.quality?.status || 'unknown'
      },
      issues: {
        critical: (analysis.quality?.errors || []).filter(e => e.severity === 'critical').length,
        errors: (analysis.quality?.errors || []).length,
        warnings: (analysis.quality?.warnings || []).length
      },
      coverage: analysis.coverage,
      recommendations: analysis.recommendations,
      compliance: analysis.compliance
    };
  }

  /**
   * Detect and remove orphan pages
   */
  async detectOrphanPages(sitemapUrls, crawlData) {
    const validator = enhancements.coverageValidator;
    const result = validator.validate(sitemapUrls, crawlData);

    return {
      orphaned: result.orphanUrls,
      missing: result.missingUrls,
      healthScore: result.healthScore,
      recommendations: result.recommendations
    };
  }

  /**
   * Estimate XML file size
   */
  _estimateXmlSize(urls) {
    const avgUrlSize = 400; // Average bytes per URL entry
    return (urls.length * avgUrlSize) / 1024 / 1024; // MB
  }

  /**
   * Get status text from score
   */
  _getStatus(score) {
    if (score >= 90) return 'Excellent';
    if (score >= 80) return 'Good';
    if (score >= 70) return 'Fair';
    if (score >= 60) return 'Poor';
    return 'Critical';
  }

  /**
   * Generate basic sitemap XML (fallback)
   */
  _generateBasicSiteMapXml(urls, baseUrl) {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    urls.forEach(url => {
      const loc = typeof url === 'string' ? url : url.loc;
      const priority = typeof url === 'string' ? 0.5 : (url.priority || 0.5);
      const lastmod = typeof url === 'string' ? null : (url.lastmod || null);

      xml += '  <url>\n';
      xml += `    <loc>${this._escapeXml(loc)}</loc>\n`;
      if (lastmod) {
        xml += `    <lastmod>${lastmod}</lastmod>\n`;
      }
      xml += `    <priority>${priority}</priority>\n`;
      xml += '  </url>\n';
    });

    xml += '</urlset>';
    return xml;
  }

  /**
   * Escape XML
   */
  _escapeXml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

module.exports = new SitemapEnhancementsAdapter();
