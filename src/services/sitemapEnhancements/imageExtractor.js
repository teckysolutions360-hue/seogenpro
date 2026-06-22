/**
 * Image Extractor
 * 
 * Extracts images from pages for image sitemap:
 * - Featured image / hero image
 * - Open Graph image
 * - Article images
 * - Product images
 */

const axios = require('axios');
const cheerio = require('cheerio');

class ImageExtractor {
  constructor() {
    this.cache = new Map();
    this.CACHE_TTL = 3600000; // 1 hour
  }

  /**
   * Extract images from a URL
   */
  async extract(url, options = {}) {
    const {
      cache = true,
      timeout = 8000,
      maxImages = 5,
      types = ['featured', 'og', 'article']
    } = options;

    // Check cache
    if (cache && this.cache.has(url)) {
      const cached = this.cache.get(url);
      if (Date.now() - cached.timestamp < this.CACHE_TTL) {
        return cached.value;
      }
    }

    try {
      const images = await this._fetchAndExtract(url, {
        timeout,
        maxImages,
        types
      });

      // Cache result
      if (cache) {
        this.cache.set(url, {
          value: images,
          timestamp: Date.now()
        });
      }

      return images;
    } catch (error) {
      return {
        url,
        images: [],
        error: error.message,
        status: 'error'
      };
    }
  }

  /**
   * Fetch page and extract images
   */
  async _fetchAndExtract(url, options = {}) {
    const response = await axios.get(url, {
      timeout: options.timeout || 8000,
      maxRedirects: 3,
      headers: {
        'User-Agent': 'SitemapGenerator/1.0'
      },
      validateStatus: () => true
    });

    if (response.status !== 200) {
      return {
        url,
        images: [],
        httpStatus: response.status
      };
    }

    const images = [];
    const $ = cheerio.load(response.data);

    // Extract featured/hero image
    if (options.types.includes('featured')) {
      const featured = this._extractFeaturedImage(url, $);
      if (featured) images.push(featured);
    }

    // Extract OG image
    if (options.types.includes('og')) {
      const og = this._extractOgImage(url, $);
      if (og) images.push(og);
    }

    // Extract article/content images
    if (options.types.includes('article')) {
      const articleImages = this._extractArticleImages($, url);
      images.push(...articleImages.slice(0, options.maxImages - images.length));
    }

    // Deduplicate by URL
    const uniqueImages = Array.from(new Map(images.map(img => [img.loc, img])).values());

    return {
      url,
      images: uniqueImages.slice(0, options.maxImages),
      totalFound: uniqueImages.length,
      status: 'success'
    };
  }

  /**
   * Extract featured/hero image
   */
  _extractFeaturedImage(url, $) {
    // Look for hero/featured image in various places
    const selectors = [
      'img.hero',
      'img.featured',
      '.hero img',
      '.featured-image img',
      'img[data-featured="true"]',
      'img.wp-post-image', // WordPress
      '.post-thumbnail img',
      '.article-hero img'
    ];

    for (const selector of selectors) {
      const img = $(selector).first();
      if (img.length) {
        const src = img.attr('src');
        if (src) {
          return this._normalizeImage({
            loc: this._resolveUrl(src, url),
            title: img.attr('alt') || img.attr('title'),
            caption: img.attr('alt'),
            type: 'featured'
          });
        }
      }
    }

    return null;
  }

  /**
   * Extract Open Graph image
   */
  _extractOgImage(url, $) {
    const ogImage = $('meta[property="og:image"]').attr('content');
    if (ogImage) {
      return this._normalizeImage({
        loc: ogImage,
        title: 'Open Graph Image',
        type: 'og'
      });
    }
    return null;
  }

  /**
   * Extract article/content images
   */
  _extractArticleImages($, url) {
    const images = [];

    // Look for images in article content
    $('article img, .content img, .post-content img, .article-content img').each((i, elem) => {
      const src = $(elem).attr('src');
      const alt = $(elem).attr('alt');

      if (src && i < 5) { // Limit to 5
        images.push(this._normalizeImage({
          loc: this._resolveUrl(src, url),
          title: alt || $(elem).attr('title'),
          caption: alt,
          type: 'article',
          index: i
        }));
      }
    });

    return images;
  }

  /**
   * Normalize image object
   */
  _normalizeImage(image) {
    return {
      loc: image.loc || '',
      caption: image.caption || '',
      title: image.title || '',
      type: image.type || 'unknown'
    };
  }

  /**
   * Resolve relative URLs to absolute
   */
  _resolveUrl(relativeUrl, baseUrl) {
    try {
      return new URL(relativeUrl, baseUrl).href;
    } catch (error) {
      return relativeUrl;
    }
  }

  /**
   * Batch extract images
   */
  async extractBatch(urls, options = {}) {
    const {
      concurrency = 3
    } = options;

    const results = {};
    const chunks = this._chunkArray(urls, concurrency);

    for (const chunk of chunks) {
      const promises = chunk.map(url => this.extract(url, options));
      const chunkResults = await Promise.allSettled(promises);

      chunkResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          results[result.value.url] = result.value;
        }
      });
    }

    return results;
  }

  /**
   * Get statistics about extracted images
   */
  getStatistics(extractedData) {
    let totalImages = 0;
    let urlsWithImages = 0;
    const imageTypes = {};

    Object.values(extractedData).forEach(data => {
      if (data.images && data.images.length > 0) {
        urlsWithImages++;
        data.images.forEach(img => {
          totalImages++;
          imageTypes[img.type] = (imageTypes[img.type] || 0) + 1;
        });
      }
    });

    return {
      totalUrls: Object.keys(extractedData).length,
      urlsWithImages,
      coveragePercentage: ((urlsWithImages / Object.keys(extractedData).length) * 100).toFixed(2),
      totalImages,
      averageImagesPerUrl: (totalImages / urlsWithImages || 0).toFixed(2),
      imageTypes
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    return { cleared: true };
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

module.exports = new ImageExtractor();
