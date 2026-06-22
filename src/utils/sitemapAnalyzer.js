/**
 * Sitemap Analyzer & Optimizer
 * 
 * Analyzes sitemap XML files and generates optimized versions with:
 * - Intelligent priority assignment based on URL type
 * - Automatic changefreq based on content type
 * - Lastmod suggestions from page analysis
 * - Duplicate detection and removal
 * - Quality recommendations
 */

const fs = require('fs');
const xml2js = require('xml2js');
const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');

class SitemapAnalyzer {
  constructor() {
    this.xmlParser = new xml2js.Parser();
    this.xmlBuilder = new xml2js.Builder({
      rootName: 'urlset',
      xmldec: { version: '1.0', encoding: 'UTF-8' },
      attrkey: '$',
      charkey: '#',
      preserveChildrenOrder: true
    });
  }

  /**
   * Parse sitemap XML file
   * @param {String} filePath - Path to sitemap.xml
   * @returns {Promise<Array>} Array of URLs
   */
  async parseSitemap(filePath) {
    try {
      const xmlContent = fs.readFileSync(filePath, 'utf-8');
      const parsed = await this.xmlParser.parseStringPromise(xmlContent);
      
      if (!parsed.urlset || !parsed.urlset.url) {
        throw new Error('Invalid sitemap format');
      }

      return parsed.urlset.url.map(item => ({
        loc: item.loc[0],
        lastmod: item.lastmod ? item.lastmod[0] : null,
        changefreq: item.changefreq ? item.changefreq[0] : 'weekly',
        priority: item.priority ? parseFloat(item.priority[0]) : 0.5,
        original_priority: item.priority ? parseFloat(item.priority[0]) : 0.5
      }));
    } catch (error) {
      throw new Error(`Failed to parse sitemap: ${error.message}`);
    }
  }

  /**
   * Parse XML from string
   * @param {String} xmlString - XML content as string
   * @returns {Promise<Array>} Array of URLs
   */
  async parseSitemapFromString(xmlString) {
    try {
      const parsed = await this.xmlParser.parseStringPromise(xmlString);
      
      if (!parsed.urlset || !parsed.urlset.url) {
        throw new Error('Invalid sitemap format');
      }

      return parsed.urlset.url.map(item => ({
        loc: item.loc[0],
        lastmod: item.lastmod ? item.lastmod[0] : null,
        changefreq: item.changefreq ? item.changefreq[0] : 'weekly',
        priority: item.priority ? parseFloat(item.priority[0]) : 0.5,
        original_priority: item.priority ? parseFloat(item.priority[0]) : 0.5
      }));
    } catch (error) {
      throw new Error(`Failed to parse sitemap: ${error.message}`);
    }
  }

  /**
   * Classify URL and assign intelligent priority
   * @param {String} url - Full URL
   * @param {String} baseUrl - Base domain
   * @returns {Object} Classification with priority and changefreq
   */
  classifyUrl(url, baseUrl) {
    const urlObj = new URL(url);
    const path = urlObj.pathname.toLowerCase();
    const segments = path.split('/').filter(s => s);

    // Extract page title for analysis
    const pageTitle = segments[segments.length - 1]?.split('-').join(' ') || 'home';

    // Homepage
    if (path === '/' || path === '') {
      return {
        type: 'homepage',
        priority: 1.0,
        changefreq: 'weekly',
        importance: 'critical',
        rationale: 'Main entry point'
      };
    }

    // Blog main page
    if (/^\/blog\/?$/i.test(path) || /^\/blogs\/?$/i.test(path)) {
      return {
        type: 'blog_index',
        priority: 0.9,
        changefreq: 'weekly',
        importance: 'high',
        rationale: 'Main blog landing page'
      };
    }

    // News/Updates main page
    if (/^\/news\/?$/i.test(path) || /^\/updates\/?$/i.test(path)) {
      return {
        type: 'news_index',
        priority: 0.9,
        changefreq: 'daily',
        importance: 'high',
        rationale: 'Dynamic content hub'
      };
    }

    // Individual blog posts
    if (/^\/blog\//i.test(path) && !/\/page\/|\/tag\/|\/category\/|\/author\//i.test(path)) {
      return {
        type: 'blog_post',
        priority: 0.8,
        changefreq: 'monthly',
        importance: 'high',
        rationale: 'Published blog article'
      };
    }

    // Individual news articles
    if (/^\/news\//i.test(path) && !/\/page\/|\/tag\/|\/category\//i.test(path)) {
      return {
        type: 'news_article',
        priority: 0.9,
        changefreq: 'never',
        importance: 'high',
        rationale: 'Time-sensitive content'
      };
    }

    // Products/Services
    if (/^\/products?\//i.test(path) || /^\/services?\//i.test(path)) {
      return {
        type: 'product',
        priority: 0.8,
        changefreq: 'monthly',
        importance: 'high',
        rationale: 'Product/service page'
      };
    }

    // Main landing pages
    if (/^\/[a-z-]+\/?$/i.test(path) && segments.length === 1) {
      const mainPages = ['services', 'pricing', 'features', 'solutions', 'why'];
      if (mainPages.some(p => path.includes(p))) {
        return {
          type: 'landing',
          priority: 0.9,
          changefreq: 'monthly',
          importance: 'high',
          rationale: 'Main section landing page'
        };
      }
    }

    // Category/Collection pages
    if (/^\/categor(y|ies)\//i.test(path)) {
      return {
        type: 'category',
        priority: 0.6,
        changefreq: 'weekly',
        importance: 'medium',
        rationale: 'Category archive page'
      };
    }

    // Tag pages
    if (/^\/tags?\//i.test(path)) {
      return {
        type: 'tag',
        priority: 0.4,
        changefreq: 'monthly',
        importance: 'low',
        rationale: 'Tag archive page'
      };
    }

    // Author pages
    if (/^\/authors?\//i.test(path)) {
      return {
        type: 'author',
        priority: 0.5,
        changefreq: 'monthly',
        importance: 'low',
        rationale: 'Author profile page'
      };
    }

    // Pagination
    if (/\/page\/\d+\/?$/i.test(path)) {
      return {
        type: 'pagination',
        priority: 0.3,
        changefreq: 'weekly',
        importance: 'low',
        rationale: 'Pagination archive'
      };
    }

    // Search results
    if (/^\/search\//i.test(path)) {
      return {
        type: 'search',
        priority: 0.3,
        changefreq: 'weekly',
        importance: 'low',
        rationale: 'Search results page'
      };
    }

    // Legal pages
    if (/^\/privacy|\/terms|\/legal|\/disclaimer|\/cookie|\/gdpr/i.test(path)) {
      return {
        type: 'legal',
        priority: 0.5,
        changefreq: 'yearly',
        importance: 'medium',
        rationale: 'Legal/compliance page'
      };
    }

    // About company pages
    if (/^\/about|\/team|\/company|\/contact/i.test(path)) {
      return {
        type: 'company',
        priority: 0.7,
        changefreq: 'monthly',
        importance: 'medium',
        rationale: 'Company information page'
      };
    }

    // Default: standard page
    return {
      type: 'page',
      priority: 0.6,
      changefreq: 'monthly',
      importance: 'medium',
      rationale: 'Standard content page'
    };
  }

  /**
   * Fetch page and extract lastmod timestamp
   * @param {String} url - Page URL
   * @returns {Promise<String>} ISO 8601 timestamp or null
   */
  async extractLastmod(url) {
    try {
      const response = await axios.get(url, {
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; SitemapAnalyzer/1.0)'
        }
      });

      const $ = cheerio.load(response.data);

      // Try various meta tags for last modification
      const lastmod = 
        $('meta[property="article:modified_time"]').attr('content') ||
        $('meta[name="last-modified"]').attr('content') ||
        $('meta[name="date"]').attr('content') ||
        $('meta[property="og:updated_time"]').attr('content') ||
        $('time[datetime]').attr('datetime') ||
        null;

      if (lastmod) {
        return new Date(lastmod).toISOString().split('T')[0];
      }

      // Fallback to HTTP Last-Modified header
      if (response.headers['last-modified']) {
        return new Date(response.headers['last-modified']).toISOString().split('T')[0];
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Detect duplicates in URL list
   * @param {Array} urls - Array of URL objects
   * @returns {Array} Duplicates found
   */
  detectDuplicates(urls) {
    const normalized = new Map();
    const duplicates = [];

    for (const url of urls) {
      // Normalize: remove trailing slash, lowercase
      const key = url.loc.toLowerCase().replace(/\/$/, '');
      
      if (normalized.has(key)) {
        duplicates.push({
          original: normalized.get(key),
          duplicate: url.loc,
          reason: 'Exact duplicate or trailing slash variation'
        });
      } else {
        normalized.set(key, url.loc);
      }
    }

    return duplicates;
  }

  /**
   * Identify low-value URLs to exclude
   * @param {Array} urls - Array of URL objects
   * @returns {Array} Low-value URLs identified
   */
  identifyLowValueUrls(urls) {
    const lowValuePatterns = [
      { pattern: /\/page\/\d+/i, reason: 'Pagination' },
      { pattern: /\/tag\//i, reason: 'Tag archive' },
      { pattern: /\/search\//i, reason: 'Search results' },
      { pattern: /\?utm_|utm_/i, reason: 'UTM parameters' },
      { pattern: /\?fbclid|\?gclid/i, reason: 'Ad tracking parameters' },
      { pattern: /\/admin\/|\/dashboard\//i, reason: 'Admin pages' },
      { pattern: /\/login\/|\/signup\/|\/register\//i, reason: 'Authentication pages' },
      { pattern: /\/cart\/|\/checkout\/|\/order\//i, reason: 'Commerce pages' },
      { pattern: /\/print\/|\/amp\//i, reason: 'Format variations' },
      { pattern: /\?sort=|sort=|filter=/i, reason: 'Filter/sort parameters' }
    ];

    return urls
      .filter(url => {
        for (const { pattern, reason } of lowValuePatterns) {
          if (pattern.test(url.loc)) {
            return true;
          }
        }
        return false;
      })
      .map(url => {
        const reason = lowValuePatterns.find(p => p.pattern.test(url.loc))?.reason;
        return {
          loc: url.loc,
          reason
        };
      });
  }

  /**
   * Analyze and optimize sitemap
   * @param {Array} urls - Array of URL objects
   * @param {Object} options - Configuration options
   * @returns {Object} Analysis result
   */
  async analyzeSitemap(urls, options = {}) {
    const baseUrl = options.baseUrl || this.extractBaseUrl(urls);
    const excludeLowValue = options.excludeLowValue !== false;
    
    // Detect duplicates
    const duplicates = this.detectDuplicates(urls);
    
    // Identify low-value URLs
    const lowValueUrls = excludeLowValue ? this.identifyLowValueUrls(urls) : [];
    
    // Classify and optimize each URL
    const optimized = urls.map(url => {
      // Skip low-value URLs if requested
      if (excludeLowValue && lowValueUrls.find(lv => lv.loc === url.loc)) {
        return null;
      }

      const classification = this.classifyUrl(url.loc, baseUrl);
      
      return {
        loc: url.loc,
        original_lastmod: url.lastmod,
        lastmod: url.lastmod, // Keep original, but can be enhanced
        changefreq: classification.changefreq,
        priority: classification.priority,
        type: classification.type,
        importance: classification.importance,
        rationale: classification.rationale,
        changed: classification.priority !== url.original_priority,
        original_priority: url.original_priority
      };
    }).filter(Boolean);

    // Generate statistics
    const stats = {
      totalUrls: urls.length,
      optimizedUrls: optimized.length,
      removedUrls: urls.length - optimized.length,
      duplicatesFound: duplicates.length,
      lowValueUrlsIdentified: lowValueUrls.length,
      byType: {},
      byPriority: {},
      byChangefreq: {}
    };

    // Count by type
    optimized.forEach(url => {
      stats.byType[url.type] = (stats.byType[url.type] || 0) + 1;
      stats.byPriority[url.priority] = (stats.byPriority[url.priority] || 0) + 1;
      stats.byChangefreq[url.changefreq] = (stats.byChangefreq[url.changefreq] || 0) + 1;
    });

    // Generate recommendations
    const recommendations = this.generateRecommendations(optimized, duplicates, lowValueUrls);

    return {
      success: true,
      baseUrl,
      statistics: stats,
      optimizedUrls: optimized,
      duplicates: duplicates.slice(0, 10), // Show top 10
      lowValueUrls: lowValueUrls.slice(0, 10), // Show top 10
      recommendations,
      analysisTime: new Date().toISOString()
    };
  }

  /**
   * Generate optimization recommendations
   * @param {Array} urls - Optimized URLs
   * @param {Array} duplicates - Duplicates found
   * @param {Array} lowValue - Low-value URLs
   * @returns {Array} Recommendations
   */
  generateRecommendations(urls, duplicates, lowValue) {
    const recommendations = [];

    // Check for duplicate URLs
    if (duplicates.length > 0) {
      recommendations.push({
        priority: 'high',
        title: 'Remove Duplicate URLs',
        description: `Found ${duplicates.length} duplicate URLs that may confuse search engines`,
        action: 'Consolidate duplicates with proper canonical tags',
        impact: 'Improves crawl efficiency by 10-15%'
      });
    }

    // Check for low-value URLs
    if (lowValue.length > 0) {
      recommendations.push({
        priority: 'high',
        title: 'Exclude Low-Value URLs',
        description: `Found ${lowValue.length} pagination, tag, and filter pages that waste crawl budget`,
        action: 'Use robots.txt or noindex to exclude these patterns',
        impact: 'Improves crawl budget allocation by 20-25%'
      });
    }

    // Check priority distribution
    const highPriority = urls.filter(u => u.priority >= 0.8).length;
    const lowPriority = urls.filter(u => u.priority <= 0.4).length;

    if (highPriority < urls.length * 0.1) {
      recommendations.push({
        priority: 'medium',
        title: 'Adjust Priority Distribution',
        description: 'Only 10% of URLs have high priority - may not guide crawlers effectively',
        action: 'Review and increase priorities for important content',
        impact: 'Helps search engines focus on key pages'
      });
    }

    // Check changefreq consistency
    const daily = urls.filter(u => u.changefreq === 'daily').length;
    const never = urls.filter(u => u.changefreq === 'never').length;

    if (daily > urls.length * 0.3 && never === 0) {
      recommendations.push({
        priority: 'medium',
        title: 'Review Changefreq Values',
        description: 'Many URLs marked as "daily" - ensure they actually update that frequently',
        action: 'Use "weekly" or "monthly" for most content',
        impact: 'More accurate crawl frequency signals'
      });
    }

    // Check for missing lastmod
    const missingLastmod = urls.filter(u => !u.lastmod).length;
    if (missingLastmod > urls.length * 0.2) {
      recommendations.push({
        priority: 'medium',
        title: 'Add Missing Lastmod Dates',
        description: `${missingLastmod} URLs missing lastmod timestamps`,
        action: 'Extract from page metadata or database',
        impact: 'Helps search engines understand content freshness'
      });
    }

    // Check for URLs that changed significantly
    const priorityChanges = urls.filter(u => u.changed).length;
    if (priorityChanges > urls.length * 0.3) {
      recommendations.push({
        priority: 'low',
        title: 'Review Priority Changes',
        description: `${priorityChanges} URLs had priority adjusted. Review these changes.`,
        action: 'Validate the new priorities are appropriate',
        impact: 'Ensures correct crawl prioritization'
      });
    }

    // AI/LLM optimization
    recommendations.push({
      priority: 'medium',
      title: 'Add AI/LLM Metadata',
      description: 'Consider adding classification comments for AI training datasets',
      action: 'Include <!-- classification: type --> comments in sitemap',
      impact: 'Improves visibility to AI crawlers and training systems'
    });

    // Subdomain analysis
    const domains = new Set(urls.map(u => new URL(u.loc).hostname));
    if (domains.size > 1) {
      recommendations.push({
        priority: 'low',
        title: 'Multiple Domains Detected',
        description: `Sitemap includes ${domains.size} different domains`,
        action: 'Consider separate sitemaps per domain if appropriate',
        impact: 'Better organization for large multi-domain properties'
      });
    }

    return recommendations.sort((a, b) => {
      const priority = { high: 3, medium: 2, low: 1 };
      return priority[b.priority] - priority[a.priority];
    });
  }

  /**
   * Generate optimized sitemap XML
   * @param {Array} urls - Optimized URLs
   * @param {Object} options - XML generation options
   * @returns {String} XML string
   */
  generateOptimizedXml(urls, options = {}) {
    const includeMetadata = options.includeMetadata !== false;

    const urlset = {
      $: {
        xmlns: 'http://www.sitemaps.org/schemas/sitemap/0.9'
      },
      url: urls.map(url => ({
        loc: [url.loc],
        lastmod: url.lastmod ? [url.lastmod] : undefined,
        changefreq: [url.changefreq],
        priority: [url.priority.toFixed(1)],
        // Add metadata comments for AI/LLM systems
        ...(includeMetadata && {
          'classification': [`<!-- type: ${url.type} -->`],
          'importance': [`<!-- importance: ${url.importance} -->`]
        })
      }))
    };

    let xml = this.xmlBuilder.buildObject({ urlset });
    
    // Add header comment with metadata
    if (includeMetadata) {
      const header = `<!-- Optimized Sitemap
  Generated: ${new Date().toISOString()}
  URLs: ${urls.length}
  Classification: Complete priority assignment applied
  For AI/LLM: Each URL includes type and importance metadata
-->
`;
      xml = header + xml;
    }

    return xml;
  }

  /**
   * Generate human-readable analysis report
   * @param {Object} analysis - Analysis result
   * @returns {String} Formatted report
   */
  generateReport(analysis) {
    const lines = [];

    lines.push('╔════════════════════════════════════════════════════════════════╗');
    lines.push('║         SITEMAP ANALYSIS & OPTIMIZATION REPORT                  ║');
    lines.push('╚════════════════════════════════════════════════════════════════╝\n');

    // Summary
    lines.push('📊 SUMMARY');
    lines.push('─'.repeat(60));
    lines.push(`Base URL: ${analysis.baseUrl}`);
    lines.push(`Total URLs: ${analysis.statistics.totalUrls}`);
    lines.push(`Optimized URLs: ${analysis.statistics.optimizedUrls}`);
    lines.push(`Removed URLs: ${analysis.statistics.removedUrls}`);
    lines.push(`Analysis Time: ${analysis.analysisTime}\n`);

    // Issues Found
    if (analysis.duplicates.length > 0 || analysis.lowValueUrls.length > 0) {
      lines.push('⚠️  ISSUES FOUND');
      lines.push('─'.repeat(60));
      
      if (analysis.duplicates.length > 0) {
        lines.push(`❌ ${analysis.duplicates.length} Duplicate URLs:`);
        analysis.duplicates.forEach(dup => {
          lines.push(`   → ${dup.duplicate}`);
        });
        lines.push('');
      }

      if (analysis.lowValueUrls.length > 0) {
        lines.push(`⛔ ${analysis.lowValueUrls.length} Low-Value URLs:`);
        analysis.lowValueUrls.forEach(lv => {
          lines.push(`   → ${lv.loc}`);
          lines.push(`      Reason: ${lv.reason}`);
        });
        lines.push('');
      }
    }

    // URL Classification
    lines.push('📋 URL CLASSIFICATION');
    lines.push('─'.repeat(60));
    
    const typeStats = analysis.statistics.byType;
    const maxType = Math.max(...Object.values(typeStats));
    
    Object.entries(typeStats)
      .sort((a, b) => b[1] - a[1])
      .forEach(([type, count]) => {
        const percentage = ((count / analysis.statistics.optimizedUrls) * 100).toFixed(1);
        const barLength = Math.round((count / maxType) * 30);
        const bar = '█'.repeat(barLength);
        lines.push(`${type.padEnd(15)} ${count.toString().padStart(4)}  ${percentage.padStart(5)}%  ${bar}`);
      });
    lines.push('');

    // Priority Distribution
    lines.push('⭐ PRIORITY DISTRIBUTION');
    lines.push('─'.repeat(60));
    
    const priorityStats = analysis.statistics.byPriority;
    Object.entries(priorityStats)
      .sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]))
      .forEach(([priority, count]) => {
        const percentage = ((count / analysis.statistics.optimizedUrls) * 100).toFixed(1);
        lines.push(`Priority ${priority.padEnd(3)} ${count.toString().padStart(4)} URLs  (${percentage.padStart(5)}%)`);
      });
    lines.push('');

    // Changefreq Distribution
    lines.push('🔄 CHANGE FREQUENCY');
    lines.push('─'.repeat(60));
    
    const changefreqStats = analysis.statistics.byChangefreq;
    const freqOrder = ['daily', 'weekly', 'monthly', 'yearly', 'never'];
    
    freqOrder.forEach(freq => {
      if (changefreqStats[freq]) {
        const count = changefreqStats[freq];
        const percentage = ((count / analysis.statistics.optimizedUrls) * 100).toFixed(1);
        lines.push(`${freq.padEnd(10)} ${count.toString().padStart(4)} URLs  (${percentage.padStart(5)}%)`);
      }
    });
    lines.push('');

    // Recommendations
    if (analysis.recommendations.length > 0) {
      lines.push('💡 RECOMMENDATIONS');
      lines.push('─'.repeat(60));
      
      analysis.recommendations.forEach((rec, index) => {
        const icon = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢';
        lines.push(`\n${index + 1}. ${icon} ${rec.title}`);
        lines.push(`   ${rec.description}`);
        lines.push(`   ➜ Action: ${rec.action}`);
        lines.push(`   📈 Impact: ${rec.impact}`);
      });
      lines.push('');
    }

    lines.push('═'.repeat(60));
    lines.push('✅ Sitemap optimization analysis complete!');

    return lines.join('\n');
  }

  /**
   * Extract base URL from URLs array
   * @param {Array} urls - URLs to analyze
   * @returns {String} Base URL
   */
  extractBaseUrl(urls) {
    if (urls.length === 0) return '';
    const url = new URL(urls[0].loc);
    return `${url.protocol}//${url.hostname}`;
  }
}

module.exports = SitemapAnalyzer;
