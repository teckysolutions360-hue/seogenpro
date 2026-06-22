/**
 * Sitemap Index Generator
 * 
 * Splits large sitemaps:
 * - If URL count > 50,000
 * - Split into multiple files
 * - Generate sitemap index
 */

class SitemapIndexGenerator {
  constructor() {
    this.MAX_URLS_PER_SITEMAP = 50000;
    this.MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
  }

  /**
   * Generate sitemap index for large sites
   */
  generate(urls, options = {}) {
    const {
      baseUrl = '',
      sitemapPath = '/sitemap',
      includeImages = false,
      includeNews = false
    } = options;

    // Check if we need an index
    if (urls.length <= this.MAX_URLS_PER_SITEMAP) {
      return {
        needsIndex: false,
        sitemaps: [{
          urls: urls,
          index: 1,
          count: urls.length
        }],
        indexUrl: null
      };
    }

    // Split URLs into chunks
    const chunks = this._chunkArray(urls, this.MAX_URLS_PER_SITEMAP);

    // Generate sitemaps info
    const sitemaps = chunks.map((chunk, index) => ({
      urls: chunk,
      index: index + 1,
      count: chunk.length,
      filename: `sitemap${index > 0 ? `-${index + 1}` : ''}.xml`,
      url: `${baseUrl}${sitemapPath}${index > 0 ? `-${index + 1}` : ''}.xml`
    }));

    // Generate sitemap index XML
    const indexXml = this._generateIndexXml(sitemaps);

    return {
      needsIndex: true,
      sitemaps,
      indexXml,
      indexUrl: `${baseUrl}/sitemap_index.xml`,
      indexFilename: 'sitemap_index.xml',
      totalChunks: sitemaps.length,
      totalUrls: urls.length
    };
  }

  /**
   * Generate sitemap index XML
   */
  _generateIndexXml(sitemaps) {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    sitemaps.forEach(sitemap => {
      xml += '  <sitemap>\n';
      xml += `    <loc>${this._escapeXml(sitemap.url)}</loc>\n`;
      xml += `    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>\n`;
      xml += '  </sitemap>\n';
    });

    xml += '</sitemapindex>';
    return xml;
  }

  /**
   * Generate all sitemap files
   */
  generateAllFiles(urls, sitemapGenerator, options = {}) {
    const {
      baseUrl = '',
      sitemapPath = '/sitemap'
    } = options;

    const split = this.generate(urls, { baseUrl, sitemapPath });

    if (!split.needsIndex) {
      // Single sitemap
      return {
        files: [{
          filename: 'sitemap.xml',
          content: sitemapGenerator(split.sitemaps[0].urls, options)
        }]
      };
    }

    // Multiple sitemaps + index
    const files = split.sitemaps.map(sitemap => ({
      filename: sitemap.filename,
      url: sitemap.url,
      content: sitemapGenerator(sitemap.urls, options)
    }));

    files.push({
      filename: split.indexFilename,
      content: split.indexXml
    });

    return {
      files,
      total: files.length,
      indexFile: split.indexFilename
    };
  }

  /**
   * Get size estimate for a sitemap
   */
  estimateSize(urls, perUrlSize = 500) {
    return urls.length * perUrlSize; // Rough estimate in bytes
  }

  /**
   * Check if URLs need splitting
   */
  needsSplitting(urls) {
    return urls.length > this.MAX_URLS_PER_SITEMAP;
  }

  /**
   * Get split recommendations
   */
  getRecommendations(urls) {
    if (!this.needsSplitting(urls)) {
      return {
        recommendation: 'Single sitemap is fine',
        reason: `${urls.length} URLs is within limit of ${this.MAX_URLS_PER_SITEMAP}`
      };
    }

    const neededChunks = Math.ceil(urls.length / this.MAX_URLS_PER_SITEMAP);
    return {
      recommendation: 'Use sitemap index',
      reason: `${urls.length} URLs exceeds limit`,
      neededSitemaps: neededChunks,
      urlsPerSitemap: this.MAX_URLS_PER_SITEMAP,
      structure: {
        files: neededChunks,
        indexFile: true
      }
    };
  }

  /**
   * Validate sitemap index structure
   */
  validateIndex(indexXml) {
    try {
      const sitemapUrls = (indexXml.match(/<loc>([^<]+)<\/loc>/g) || [])
        .map(match => match.replace(/<\/?loc>/g, ''));

      return {
        valid: true,
        sitemapCount: sitemapUrls.length,
        sitemaps: sitemapUrls
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Helper: escape XML
   */
  _escapeXml(unsafe) {
    if (!unsafe) return '';
    return String(unsafe)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Helper: chunk array
   */
  _chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

module.exports = new SitemapIndexGenerator();
