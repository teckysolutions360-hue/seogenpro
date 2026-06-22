const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Metadata Analyzer Module
 * Extracts and analyzes website metadata for AI compliance
 */

class MetadataAnalyzer {
  /**
   * Analyze website metadata
   */
  async analyzeMetadata(baseUrl) {
    try {
      const response = await axios.get(baseUrl, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        maxRedirects: 5,
        validateStatus: () => true,
        httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
      });

      const $ = cheerio.load(response.data);
      const html = response.data;

      return {
        title: this.extractTitle($, baseUrl),
        description: this.extractDescription($),
        language: this.extractLanguage($, html),
        favicon: this.extractFavicon($, baseUrl),
        socialMeta: this.extractSocialMeta($),
        schemaMarkup: this.extractSchemaMarkup($),
        canonical: $('link[rel="canonical"]').attr('href') || baseUrl,
        robots: $('meta[name="robots"]').attr('content') || 'index, follow'
      };
    } catch (error) {
      console.error('[MetadataAnalyzer] Error analyzing metadata:', error.message);
      return {
        title: new URL(baseUrl).hostname,
        description: '',
        language: 'unknown',
        favicon: '',
        socialMeta: {},
        schemaMarkup: {},
        canonical: baseUrl,
        robots: 'unknown'
      };
    }
  }

  /**
   * Extract page title
   */
  extractTitle($, baseUrl) {
    const title = $('title').text() || 
                  $('meta[property="og:title"]').attr('content') || 
                  $('meta[name="title"]').attr('content') ||
                  new URL(baseUrl).hostname;
    return title.trim().substring(0, 200);
  }

  /**
   * Extract meta description
   */
  extractDescription($) {
    const description = $('meta[name="description"]').attr('content') ||
                       $('meta[property="og:description"]').attr('content') ||
                       '';
    return description.substring(0, 500);
  }

  /**
   * Extract language
   */
  extractLanguage($, html) {
    const lang = $('html').attr('lang') || 'en';
    if (lang && lang.length >= 2) {
      return lang.split('-')[0].toLowerCase();
    }
    
    try {
      const { detect } = require('language-detect');
      return detect(html.substring(0, 1000)) || 'unknown';
    } catch (e) {
      return 'unknown';
    }
  }

  /**
   * Extract favicon
   */
  extractFavicon($, baseUrl) {
    const favicon = $('link[rel="icon"]').attr('href') ||
                   $('link[rel="shortcut icon"]').attr('href') ||
                   '/favicon.ico';
    
    try {
      return new URL(favicon, baseUrl).toString();
    } catch (e) {
      return favicon;
    }
  }

  /**
   * Extract Open Graph and social metadata
   */
  extractSocialMeta($) {
    const social = {
      ogTitle: $('meta[property="og:title"]').attr('content'),
      ogImage: $('meta[property="og:image"]').attr('content'),
      ogUrl: $('meta[property="og:url"]').attr('content'),
      twitterCard: $('meta[name="twitter:card"]').attr('content'),
      twitterImage: $('meta[name="twitter:image"]').attr('content'),
      author: $('meta[name="author"]').attr('content')
    };

    return Object.fromEntries(
      Object.entries(social).filter(([_, v]) => v !== undefined)
    );
  }

  /**
   * Extract JSON-LD schema markup
   */
  extractSchemaMarkup($) {
    const result = { raw: [], types: {} };
    const scripts = $('script[type="application/ld+json"]');

    scripts.each((i, elem) => {
      try {
        const rawText = $(elem).html() || '';
        const data = JSON.parse(rawText);

        // normalize arrays and @graph
        const entries = Array.isArray(data) ? data : (data['@graph'] ? data['@graph'] : [data]);

        entries.forEach(item => {
          if (!item || typeof item !== 'object') return;
          result.raw.push(item);
          const type = item['@type'] || 'Unknown';
          // support multiple types like ["Article","NewsArticle"]
          const types = Array.isArray(type) ? type : [type];

          types.forEach(t => {
            const key = String(t);
            if (!result.types[key]) result.types[key] = { count: 0, examples: [], valid: false };
            result.types[key].count += 1;
            result.types[key].examples.push(item);
          });
        });
      } catch (e) {
        // skip invalid JSON
      }
    });

    // Validate common schema types for minimal required fields
    Object.entries(result.types).forEach(([type, info]) => {
      const sample = info.examples[0] || {};
      info.valid = this.validateSchemaType(type, sample);
    });

    return result;
  }

  /**
   * Quick validator for common schema types (minimal required fields)
   */
  validateSchemaType(type, obj) {
    if (!type || !obj || typeof obj !== 'object') return false;
    const t = type.toLowerCase();

    if (t.includes('article') || t === 'newsarticle' || t === 'blogposting') {
      return !!(obj.headline || obj.name || obj.datePublished || obj.author || obj.mainEntityOfPage);
    }

    if (t === 'product') {
      return !!(obj.name || obj.offers || obj.sku || obj.brand);
    }

    if (t === 'organization' || t === 'localbusiness') {
      return !!(obj.name && (obj.url || obj.logo));
    }

    if (t === 'website' || t === 'webpage') {
      return !!(obj.name || obj.url);
    }

    // default: mark as valid if has at least one URL or name
    return !!(obj.name || obj.url);
  }

  /**
   * Detect content type from schema and metadata
   */
  detectContentType($, metadata) {
    const schema = metadata.schemaMarkup || {};
    const description = (metadata.description || '').toLowerCase();
    const title = (metadata.title || '').toLowerCase();

    // Check schema types
    const hasNewsArticle = schema['NewsArticle'] || schema['Article'];
    const hasProduct = schema['Product'] || schema['AggregateOffer'];
    const hasOrganization = schema['Organization'] || schema['LocalBusiness'];
    const hasSoftware = schema['SoftwareApplication'];
    const hasBreadcrumb = schema['BreadcrumbList'];

    if (hasNewsArticle) return 'news';
    if (hasProduct) return 'ecommerce';
    if (hasSoftware) return 'saas';
    if (hasOrganization && hasBreadcrumb) return 'marketplace';

    // Keyword detection
    const keywords = ['blog', 'article', 'news', 'magazine'];
    if (keywords.some(k => description.includes(k) || title.includes(k))) {
      return 'blog';
    }

    const ecommerceKeywords = ['shop', 'store', 'buy', 'product', 'price'];
    if (ecommerceKeywords.some(k => description.includes(k) || title.includes(k))) {
      return 'ecommerce';
    }

    const saasKeywords = ['software', 'platform', 'tool', 'service', 'application'];
    if (saasKeywords.some(k => description.includes(k) || title.includes(k))) {
      return 'saas';
    }

    return 'general';
  }

  /**
   * Detect if sitemap exists
   */
  async checkSitemap(baseUrl) {
    try {
      const sitemapUrl = new URL('/sitemap.xml', baseUrl).toString();
      const response = await axios.head(sitemapUrl, { timeout: 5000 });
      return response.status === 200;
    } catch (e) {
      return false;
    }
  }

  /**
   * Detect if robots.txt exists
   */
  async checkRobots(baseUrl) {
    try {
      const robotsUrl = new URL('/robots.txt', baseUrl).toString();
      const response = await axios.head(robotsUrl, { timeout: 5000 });
      return response.status === 200;
    } catch (e) {
      return false;
    }
  }

  /**
   * Extract primary topics from content
   */
  extractTopics($, limit = 5) {
    const topics = {};
    
    // From headings
    $('h1, h2, h3').each((i, elem) => {
      const text = $(elem).text().trim();
      if (text.length > 3 && text.length < 100) {
        topics[text] = (topics[text] || 0) + 1;
      }
    });

    // From keywords meta tag
    const keywords = $('meta[name="keywords"]').attr('content');
    if (keywords) {
      keywords.split(',').forEach(k => {
        const trimmed = k.trim();
        topics[trimmed] = (topics[trimmed] || 0) + 1;
      });
    }

    return Object.entries(topics)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([topic]) => topic);
  }
}

module.exports = new MetadataAnalyzer();
