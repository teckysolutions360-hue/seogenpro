/**
 * Optimized Sitemap Service
 * ========================
 * Generates SEO-optimized and AI-compliant XML sitemaps with:
 * - Intelligent URL classification and filtering
 * - Dynamic priority and changefreq assignment
 * - Image and video metadata support
 * - Low-value URL detection and removal
 * - Duplicate and canonical issue handling
 */

class OptimizedSitemapService {
  constructor() {
    this.DEBUG_SITEMAP = process.env.DEBUG_SITEMAP === 'true';
    this.config = {
      excludePatterns: [
        /\/(admin|dashboard|internal|api|dev|beta)\//i,
        /\/(cart|checkout|payment|cart\/item)\//i,
        /\/(account|profile|login|signup|register|logout|forgot|reset)\//i,
        /\/(search|results|query|default\.aspx)\//i,
        /\/(print|pdf|export|download-center)\//i,
        /\.(pdf|doc|docx|zip|exe|jpg|png|gif|css|js)$/i,
        /[\?&](utm_|fbclid|gclid|session|cookie|token)/i,
        /\?page=\d+$/i, // Pagination
        /\?sort=/i,     // Sort parameters
        /\?filter=/i,   // Filter parameters
        /\/tag\//i,     // Tag archive pages
        /\/category\/[^\/]+\/page\/\d+$/i, // Category pagination
        /\/author\//i,  // Author pages
        /\/archive\//i, // Archive pages
        /\/related\//i  // Related content pages
      ],
      lowValuePatterns: [
        /\/page\/\d+$/i,     // Pagination
        /\/tag\/[^\/]+$/i,   // Tag pages
        /\/search\//i,       // Search pages
        '\?s=',              // Search queries
        '/comment-page-',    // Comment pagination
        '/feed/',            // RSS feeds
        '/trackback/'        // Trackbacks
      ]
    };
  }

  /**
   * Classify a URL and determine its priority
   */
  classifyUrl(url, baseUrl) {
    const urlObj = new URL(url);
    const path = urlObj.pathname.toLowerCase();
    const domain = new URL(baseUrl).hostname;

    // Extract path segments
    const segments = path.split('/').filter(s => s);

    // Check if it's homepage
    if (segments.length === 0 || path === '/') {
      return {
        type: 'homepage',
        priority: 1.0,
        changefreq: 'weekly',
        importance: 'critical'
      };
    }

    // Check if it's a main landing page
    if (this.isMainLandingPage(path, segments)) {
      return {
        type: 'landing',
        priority: 0.9,
        changefreq: 'monthly',
        importance: 'high'
      };
    }

    // Check if it's blog/article content
    if (this.isBlogContent(path, segments)) {
      return {
        type: 'blog',
        priority: 0.8,
        changefreq: 'never',
        importance: 'high'
      };
    }

    // Check if it's product/service page
    if (this.isProductPage(path, segments)) {
      return {
        type: 'product',
        priority: 0.8,
        changefreq: 'weekly',
        importance: 'high'
      };
    }

    // Check if it's category or collection
    if (this.isCategoryPage(path, segments)) {
      return {
        type: 'category',
        priority: 0.6,
        changefreq: 'weekly',
        importance: 'medium'
      };
    }

    // Check if it's company info (about, contact, team)
    if (this.isCompanyInfo(path, segments)) {
      return {
        type: 'company',
        priority: 0.7,
        changefreq: 'monthly',
        importance: 'medium'
      };
    }

    // Check if it's legal page (privacy, terms)
    if (this.isLegalPage(path, segments)) {
      return {
        type: 'legal',
        priority: 0.5,
        changefreq: 'yearly',
        importance: 'medium'
      };
    }

    // Check if it's pagination or low-value
    if (this.isLowValuePage(path, segments)) {
      return {
        type: 'low-value',
        priority: 0.3,
        changefreq: 'monthly',
        importance: 'low',
        exclude: true // Mark for potential exclusion
      };
    }

    // Default classification
    return {
      type: 'general',
      priority: 0.5,
      changefreq: 'monthly',
      importance: 'low'
    };
  }

  // Helper to optionally log classification details
  _debugLogClassification(url, classification) {
    if (this.DEBUG_SITEMAP) {
      try {
        console.log(`[SITEMAP] classify: ${url} => ${JSON.stringify(classification)}`);
      } catch (e) {
        // ignore logging errors
      }
    }
  }

  /**
   * Identify main landing pages
   */
  isMainLandingPage(path, segments) {
    const mainPagePatterns = [
      /^\/services?(?:\/|$)/i,      // /service or /services
      /^\/products?(?:\/|$)/i,      // /product or /products
      /^\/solutions?(?:\/|$)/i,     // /solution or /solutions
      /^\/features?(?:\/|$)/i,      // /feature or /features
      /^\/pricing(?:\/|$)/i,
      /^\/contact(?:\/|$)/i,
      /^\/blogs?(?:\/|$)/i,         // /blog or /blogs
      /^\/resources?(?:\/|$)/i,     // /resource or /resources
      /^\/about(?:\/|$)/i,
      /^\/help(?:\/|$)/i,
      /^\/faq(?:\/|$)/i,
      /^\/listings?(?:\/|$)/i,      // /listing or /listings (marketplace)
      /^\/browse(?:\/|$)/i,        // /browse (common for listings)
      /^\/marketplace(?:\/|$)/i     // /marketplace
    ];

    return mainPagePatterns.some(pattern => pattern.test(path));
  }

  /**
   * Identify blog and article content
   */
  isBlogContent(path, segments) {
    const blogIndicators = [
      /^\/blog\//i,
      /^\/article\//i,
      /^\/post\//i,
      /^\/news\//i,
      /^\/articles?\//i,
      /^\/posts?\//i,
      /^\/stories\//i,
      /^\/[0-9]{4}\/[0-9]{2}\//i, // Date-based archives (YYYY/MM/...)
      /^\/posts?\/\d+\//i
    ];

    // NOT pagination
    if (/page\/\d+/i.test(path)) {
      return false;
    }

    return blogIndicators.some(pattern => pattern.test(path));
  }

  /**
   * Identify product/service pages
   */
  isProductPage(path, segments) {
    const productIndicators = [
      /^\/product\//i,
      /^\/products\//i,
      /^\/service\//i,
      /^\/services\//i,
      /^\/solution\//i,
      /^\/solutions\//i,
      /^\/offer\//i,
      /^\/item\//i,
      /^\/sku\//i,
      /^\/software\//i,        // Software/tools marketplace
      /^\/tool\//i,            // Tools
      /^\/tools\//i,           // Tools
      /^\/application\//i,     // Applications
      /^\/app\//i,             // Apps
      /^\/listing\//i,         // Listings (marketplace)
      /^\/job\//i,             // Job listings
      /^\/vacancy\//i          // Job vacancies
    ];

    // NOT cart or checkout related
    if (/cart|checkout|payment/i.test(path)) {
      return false;
    }

    return productIndicators.some(pattern => pattern.test(path));
  }

  /**
   * Identify category/collection pages
   */
  isCategoryPage(path, segments) {
    const categoryIndicators = [
      /^\/category\//i,
      /^\/categories\//i,
      /^\/collection\//i,
      /^\/collections\//i,
      /^\/browse\//i
    ];

    // NOT pagination
    if (/page\/\d+/i.test(path)) {
      return false;
    }

    return categoryIndicators.some(pattern => pattern.test(path));
  }

  /**
   * Identify company information pages
   */
  isCompanyInfo(path, segments) {
    const companyIndicators = [
      /^\/about/i,
      /^\/team/i,
      /^\/contact/i,
      /^\/company/i,
      /^\/careers?(?:\/|$)/i,
      /^\/press/i,
      /^\/community/i,
      /^\/partners?(?:\/|$)/i
    ];

    return companyIndicators.some(pattern => pattern.test(path));
  }

  /**
   * Identify legal pages
   */
  isLegalPage(path, segments) {
    const legalIndicators = [
      /^\/privacy/i,
      /^\/terms/i,
      /^\/legal/i,
      /^\/disclaimer/i,
      /^\/cookie/i,
      /^\/policy/i,
      /^\/compliance/i
    ];

    return legalIndicators.some(pattern => pattern.test(path));
  }

  /**
   * Identify low-value pages (pagination, archives, tags, etc.)
   */
  isLowValuePage(path, segments) {
    return this.config.lowValuePatterns.some(pattern => {
      if (typeof pattern === 'string') {
        return path.includes(pattern);
      }
      return pattern.test(path);
    });
  }

  /**
   * Check if URL should be excluded
   */
  shouldExcludeUrl(url) {
    return this.config.excludePatterns.some(pattern => pattern.test(url));
  }

  /**
   * Filter and deduplicate URLs
   */
  filterAndDeduplicateUrls(urls, options = {}) {
    const filtered = [];
    const seen = new Set();
    const duplicates = [];

    for (const url of urls) {
      // Skip if duplicate
      if (seen.has(url)) {
        duplicates.push(url);
        continue;
      }

      // Skip if matches exclude patterns
      if (this.shouldExcludeUrl(url)) {
        continue;
      }

      // Skip low-value pages if configured
      if (options.excludeLowValue && this.isLowValuePage(url)) {
        continue;
      }

      seen.add(url);
      filtered.push(url);
    }

    return {
      filtered,
      removed: duplicates,
      count: filtered.length
    };
  }

  /**
   * Generate optimized sitemap XML
   */
  generateOptimizedSitemapXml(urls, options = {}) {
    const {
      baseUrl,
      includeImages = false,
      includeVideos = false,
      excludeLowValue = true,
      maxUrls = 50000
    } = options;

    // Filter and deduplicate
    const { filtered: cleanUrls } = this.filterAndDeduplicateUrls(urls, { excludeLowValue });
    const urlsToInclude = cleanUrls.slice(0, maxUrls);

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n';
    
    if (includeImages) {
      xml += '         xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"\n';
    }
    
    if (includeVideos) {
      xml += '         xmlns:video="http://www.mplayerhq.hu/schemas/sitemap-video/1.1"\n';
    }
    
    xml += '         xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n\n';

    // Add URLs with optimized metadata
    urlsToInclude.forEach(url => {
      const classification = this.classifyUrl(url, baseUrl);
      this._debugLogClassification(url, classification);

      xml += '  <url>\n';
      xml += `    <loc>${this.escapeXml(url)}</loc>\n`;
      
      // Add last modification date (ISO 8601 full timestamp)
      const lastmod = this.getLastModDate(url);
      xml += `    <lastmod>${lastmod}</lastmod>\n`;
      
      // Add change frequency
      xml += `    <changefreq>${classification.changefreq}</changefreq>\n`;
      
      // Add priority
      xml += `    <priority>${classification.priority.toFixed(1)}</priority>\n`;

      // Add metadata comment for AI systems
      xml += `    <!-- Type: ${classification.type} | Importance: ${classification.importance} -->\n`;

      xml += '  </url>\n\n';
    });

    xml += '</urlset>';
    return xml;
  }

  /**
   * Generate sitemap with advanced AI compliance features
   */
  generateAiCompliantSitemap(urls, options = {}) {
    const {
      baseUrl,
      excludeLowValue = true,
      maxUrls = 50000,
      includeMetadata = true
    } = options;

    const { filtered: cleanUrls } = this.filterAndDeduplicateUrls(urls, { excludeLowValue });
    const urlsToInclude = cleanUrls.slice(0, maxUrls);

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<!-- AI-Compliant Sitemap for Enhanced LLM Visibility -->\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n\n';

    // Add metadata header
    if (includeMetadata) {
      xml += '  <!-- METADATA -->\n';
      xml += `  <!-- Generated: ${new Date().toISOString()} -->\n`;
      xml += `  <!-- Total URLs: ${urlsToInclude.length} -->\n`;
      xml += `  <!-- Base URL: ${baseUrl} -->\n`;
      xml += `  <!-- Purpose: SEO & AI/LLM Compliance -->\n\n`;
    }

    // Categorize URLs
    const urlsByType = {};
    urlsToInclude.forEach(url => {
      const classification = this.classifyUrl(url, baseUrl);
      if (!urlsByType[classification.type]) {
        urlsByType[classification.type] = [];
      }
      urlsByType[classification.type].push({ url, ...classification });
    });

    // Generate XML by category
    const categoryOrder = ['homepage', 'landing', 'blog', 'product', 'category', 'company', 'legal'];
    
    for (const category of categoryOrder) {
      if (urlsByType[category]) {
        xml += `  <!-- ${category.toUpperCase()} PAGES (${urlsByType[category].length} URLs) -->\n`;
        
        urlsByType[category].forEach(item => {
          xml += '  <url>\n';
          xml += `    <loc>${this.escapeXml(item.url)}</loc>\n`;
          xml += `    <lastmod>${this.getLastModDate(item.url)}</lastmod>\n`;
          xml += `    <changefreq>${item.changefreq}</changefreq>\n`;
          xml += `    <priority>${item.priority.toFixed(1)}</priority>\n`;
          
          // Add metadata for AI systems
          xml += `    <!-- classification: ${item.type} -->\n`;
          xml += `    <!-- importance: ${item.importance} -->\n`;
          xml += `    <!-- ai-visible: true -->\n`;
          
          xml += '  </url>\n';
        });
        xml += '\n';
      }
    }

    xml += '</urlset>';
    return xml;
  }

  /**
   * Get appropriate last modification date
   */
  getLastModDate(url) {
    // For static pages, use a default date
    // For content, you'd integrate with your CMS/database
    const now = new Date();
    
    // Homepage changes weekly
    if (url.endsWith('/') && url.split('/').length <= 3) {
      now.setDate(now.getDate() - (now.getDay() || 7) + 1);
    }
    // Blog posts rarely change
    else if (/\/blog\/|\/article\//i.test(url)) {
      // Would be set from CMS publish date in production
    }
    // Product pages change frequently
    else if (/\/product\//i.test(url)) {
      now.setDate(now.getDate() - 3);
    }

    return now.toISOString();
  }

  /**
   * Escape XML special characters
   */
  escapeXml(unsafe) {
    return unsafe.replace(/[<>&'"]/g, (c) => {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '\'': return '&apos;';
        case '"': return '&quot;';
      }
    });
  }

  /**
   * Generate sitemap index for large sites
   */
  generateSitemapIndex(sitemapUrls) {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    sitemapUrls.forEach(url => {
      xml += '  <sitemap>\n';
      xml += `    <loc>${this.escapeXml(url)}</loc>\n`;
      xml += `    <lastmod>${new Date().toISOString()}</lastmod>\n`;
      xml += '  </sitemap>\n';
    });

    xml += '</sitemapindex>';
    return xml;
  }

  /**
   * Analyze sitemap quality and provide recommendations
   */
  analyzeSitemapQuality(urls, baseUrl) {
    const analysis = {
      totalUrls: urls.length,
      uniqueUrls: new Set(urls).size,
      byType: {},
      byPriority: {
        critical: 0,    // 0.9-1.0
        high: 0,        // 0.7-0.8
        medium: 0,      // 0.5-0.6
        low: 0          // 0.3-0.4
      },
      issues: [],
      recommendations: []
    };

    let duplicates = 0;
    const priorityDistribution = {};

    urls.forEach(url => {
      const classification = this.classifyUrl(url, baseUrl);
      
      // Count by type
      if (!analysis.byType[classification.type]) {
        analysis.byType[classification.type] = 0;
      }
      analysis.byType[classification.type]++;

      // Count by priority
      if (classification.priority >= 0.9) analysis.byPriority.critical++;
      else if (classification.priority >= 0.7) analysis.byPriority.high++;
      else if (classification.priority >= 0.5) analysis.byPriority.medium++;
      else analysis.byPriority.low++;

      // Check for duplicates
      if (priorityDistribution[url]) {
        duplicates++;
      }
      priorityDistribution[url] = true;
    });

    // Generate issues and recommendations
    if (duplicates > 0) {
      analysis.issues.push(`Found ${duplicates} duplicate URLs`);
      analysis.recommendations.push('Remove duplicate URLs to improve crawl efficiency');
    }

    if (analysis.byType['low-value'] > (analysis.totalUrls * 0.1)) {
      analysis.issues.push(`High percentage of low-value pages (${analysis.byType['low-value']} URLs)`);
      analysis.recommendations.push('Consider excluding pagination, tags, and archive pages');
    }

    if (analysis.byPriority.critical + analysis.byPriority.high < (analysis.totalUrls * 0.2)) {
      analysis.recommendations.push('Increase priority for primary content pages');
    }

    return analysis;
  }
}

module.exports = new OptimizedSitemapService();
