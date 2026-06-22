/**
 * XML Structure Validator
 * 
 * Validates and cleans sitemap XML:
 * - Remove unused namespaces
 * - Only include news/image namespace if needed
 * - Validate XML structure
 * - Ensure valid element hierarchy
 */

const { parseStringPromise, Builder } = require('xml2js');

class XmlStructureValidator {
  constructor() {
    this.logger = console;
  }

  /**
   * Validate and clean XML structure
   */
  async validateAndClean(xmlString) {
    try {
      const parser = new (require('xml2js')).Parser({
        strict: true,
        normalize: true,
        normalizeTagName: false
      });

      const result = await parser.parseStringPromise(xmlString);
      
      return {
        valid: true,
        structure: result,
        errors: []
      };
    } catch (error) {
      return {
        valid: false,
        errors: [error.message],
        structure: null
      };
    }
  }

  /**
   * Generate clean XML with only needed namespaces
   */
  generateCleanXml(urls, options = {}) {
    const {
      baseUrl = '',
      includeImages = false,
      includeNews = false,
      includeVideos = false
    } = options;

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"';

    // Only add namespaces that will actually be used
    if (includeImages) {
      xml += '\n         xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"';
    }
    if (includeNews) {
      xml += '\n         xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"';
    }
    if (includeVideos) {
      xml += '\n         xmlns:video="http://www.mplayerhq.hu/schemas/sitemap-video/1.1"';
    }

    xml += '>\n';

    // Add URLs
    urls.forEach(url => {
      xml += this._buildUrlElement(url, options);
    });

    xml += '</urlset>';
    
    return xml;
  }

  /**
   * Build individual URL element
   */
  _buildUrlElement(url, options = {}) {
    let element = '  <url>\n';
    element += `    <loc>${this._escapeXml(url.loc || url.url || url)}</loc>\n`;

    // lastmod (if provided)
    if (url.lastmod) {
      element += `    <lastmod>${this._escapeXml(url.lastmod)}</lastmod>\n`;
    }

    // changefreq (if provided)
    if (url.changefreq) {
      element += `    <changefreq>${this._escapeXml(url.changefreq)}</changefreq>\n`;
    }

    // priority (if provided and valid)
    if (url.priority !== undefined && url.priority !== null) {
      const priority = Math.max(0, Math.min(1, parseFloat(url.priority)));
      element += `    <priority>${priority.toFixed(1)}</priority>\n`;
    }

    // images (if included and available)
    if (options.includeImages && url.images && Array.isArray(url.images)) {
      url.images.forEach(image => {
        element += '    <image:image>\n';
        element += `      <image:loc>${this._escapeXml(image.loc || image.url || image)}</image:loc>\n`;
        if (image.caption) {
          element += `      <image:caption>${this._escapeXml(image.caption)}</image:caption>\n`;
        }
        if (image.title) {
          element += `      <image:title>${this._escapeXml(image.title)}</image:title>\n`;
        }
        element += '    </image:image>\n';
      });
    }

    // news (if included and available)
    if (options.includeNews && url.news) {
      element += '    <news:news>\n';
      element += `      <news:publication_date>${this._escapeXml(url.news.pub_date)}</news:publication_date>\n`;
      if (url.news.title) {
        element += `      <news:title>${this._escapeXml(url.news.title)}</news:title>\n`;
      }
      element += '    </news:news>\n';
    }

    element += '  </url>\n';
    return element;
  }

  /**
   * Escape XML special characters
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
   * Validate individual URL element
   */
  validateUrlElement(url) {
    const errors = [];

    // Validate loc
    if (!url.loc && !url.url) {
      errors.push('Missing <loc> element');
    } else {
      const locUrl = url.loc || url.url;
      try {
        new URL(locUrl);
      } catch (e) {
        errors.push(`Invalid URL: ${locUrl}`);
      }
    }

    // Validate lastmod if present
    if (url.lastmod) {
      if (!this._isValidIsoDate(url.lastmod)) {
        errors.push(`Invalid lastmod format: ${url.lastmod}`);
      }
    }

    // Validate changefreq if present
    if (url.changefreq) {
      const validFreq = ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'];
      if (!validFreq.includes(url.changefreq.toLowerCase())) {
        errors.push(`Invalid changefreq: ${url.changefreq}`);
      }
    }

    // Validate priority if present
    if (url.priority !== undefined && url.priority !== null) {
      const priority = parseFloat(url.priority);
      if (isNaN(priority) || priority < 0 || priority > 1) {
        errors.push(`Invalid priority: ${url.priority} (must be 0.0-1.0)`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Check if string is valid ISO 8601 date
   */
  _isValidIsoDate(dateString) {
    if (!dateString) return false;
    const iso8601Regex = /^(\d{4})(-\d{2}){0,2}(T\d{2}(:\d{2}){0,2}Z?)?$/;
    if (!iso8601Regex.test(dateString)) return false;
    
    try {
      const date = new Date(dateString);
      return !isNaN(date.getTime());
    } catch (e) {
      return false;
    }
  }

  /**
   * Detect which namespaces are actually needed
   */
  detectRequiredNamespaces(urls) {
    let needsImage = false;
    let needsNews = false;
    let needsVideo = false;

    urls.forEach(url => {
      if (url.images && url.images.length > 0) needsImage = true;
      if (url.news) needsNews = true;
      if (url.video) needsVideo = true;
    });

    return {
      image: needsImage,
      news: needsNews,
      video: needsVideo
    };
  }

  /**
   * Remove duplicate URLs and normalize
   */
  removeDuplicates(urls) {
    const seen = new Set();
    const duplicates = [];
    const cleaned = [];

    urls.forEach(url => {
      const locUrl = typeof url === 'string' ? url : (url.loc || url.url);
      if (!locUrl) return;

      try {
        const normalized = new URL(locUrl).href;
        if (seen.has(normalized)) {
          duplicates.push(locUrl);
        } else {
          seen.add(normalized);
          cleaned.push(typeof url === 'string' ? { loc: normalized } : { ...url, loc: normalized });
        }
      } catch (e) {
        // Invalid URL, skip
      }
    });

    // Return cleaned array (preserves order) for downstream pipeline. Use
    // removeDuplicatesReport() for a detailed report if needed.
    return cleaned;
  }

  /**
   * Detailed duplicate report (keeps old behavior when needed)
   */
  removeDuplicatesReport(urls) {
    const seen = new Set();
    const duplicates = [];
    const cleaned = [];

    urls.forEach(url => {
      const locUrl = typeof url === 'string' ? url : (url.loc || url.url);
      if (!locUrl) return;

      try {
        const normalized = new URL(locUrl).href;
        if (seen.has(normalized)) {
          duplicates.push(locUrl);
        } else {
          seen.add(normalized);
          cleaned.push(url);
        }
      } catch (e) {
        // Invalid URL, skip
      }
    });

    return {
      cleaned,
      duplicatesRemoved: duplicates.length,
      duplicates
    };
  }
}

module.exports = new XmlStructureValidator();
