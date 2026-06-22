/**
 * metadata-extractor.js
 * Extracts metadata and calculates priority/changefreq
 * 
 * Logic:
 * - Priority based on URL structure, depth, recency
 * - Changefreq based on content type and update patterns
 */

class MetadataExtractor {
  /**
   * Calculate priority (0.0 - 1.0)
   */
  calculatePriority(pageData, baseUrl) {
    let priority = 0.5; // Default
    
    // Homepage gets highest priority
    if (this.isHomepage(pageData.url, baseUrl)) {
      return 1.0;
    }
    
    // Priority by depth (pages closer to root are more important)
    if (pageData.depth === 0) priority = 0.9;
    else if (pageData.depth === 1) priority = 0.8;
    else if (pageData.depth === 2) priority = 0.7;
    else if (pageData.depth === 3) priority = 0.6;
    else priority = Math.max(0.3, 0.7 - (pageData.depth * 0.15));
    
    // Content type adjustments
    if (this.isProductPage(pageData)) priority = Math.min(1.0, priority + 0.15);
    if (this.isBlogPage(pageData)) priority = Math.min(1.0, priority + 0.1);
    if (this.isLegalPage(pageData)) priority = Math.max(0.3, priority - 0.15);
    
    // Recency boost: Recently updated pages get higher priority
    if (this.isRecent(pageData.lastmod, 7)) {
      priority = Math.min(1.0, priority + 0.15);
    } else if (this.isRecent(pageData.lastmod, 30)) {
      priority = Math.min(1.0, priority + 0.1);
    }
    
    return parseFloat(priority.toFixed(1));
  }

  /**
   * Calculate changefreq
   */
  calculateChangefreq(pageData) {
    // Homepage and main pages change frequently
    if (pageData.depth === 0) return 'daily';
    
    // Product/blog pages: check recency
    if (this.isProductPage(pageData) || this.isBlogPage(pageData)) {
      if (this.isRecent(pageData.lastmod, 7)) return 'daily';
      if (this.isRecent(pageData.lastmod, 30)) return 'weekly';
      return 'bi-weekly';
    }
    
    // Category/collection pages
    if (this.isCategoryPage(pageData)) return 'weekly';
    
    // Legal pages: almost never change
    if (this.isLegalPage(pageData)) return 'yearly';
    
    // Default: monthly
    return 'monthly';
  }

  /**
   * Content type detection
   */
  isHomepage(url, baseUrl) {
    const baseOrigin = new URL(baseUrl).origin;
    return url === baseOrigin || url === baseOrigin + '/';
  }

  isProductPage(pageData) {
    const keywords = ['product', 'service', 'item', 'listing', 'offer', 'deal', 'shop', 'store', 'price'];
    const url = pageData.url.toLowerCase();
    const title = (pageData.title || '').toLowerCase();
    
    return keywords.some(kw => url.includes(kw) || title.includes(kw));
  }

  isBlogPage(pageData) {
    const keywords = ['blog', 'article', 'post', 'news', 'story', 'update', 'press'];
    const url = pageData.url.toLowerCase();
    const title = (pageData.title || '').toLowerCase();
    
    return keywords.some(kw => url.includes(kw) || title.includes(kw));
  }

  isCategoryPage(pageData) {
    const keywords = ['category', 'tag', 'archive', 'collection', 'list', 'browse'];
    const url = pageData.url.toLowerCase();
    
    return keywords.some(kw => url.includes(kw));
  }

  isLegalPage(pageData) {
    const keywords = ['privacy', 'terms', 'legal', 'disclaimer', 'policy', 'cookie', 'tos', 'legal-notice'];
    const url = pageData.url.toLowerCase();
    
    return keywords.some(kw => url.includes(kw));
  }

  /**
   * Recency check
   */
  isRecent(lastmod, days) {
    try {
      const date = new Date(lastmod);
      const now = new Date();
      const diffMs = now - date;
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      return diffDays <= days && diffDays >= 0;
    } catch {
      return false;
    }
  }

  /**
   * Get all statistics
   */
  getStats(pages) {
    return {
      total: pages.length,
      byDepth: this.groupByDepth(pages),
      byType: this.groupByType(pages),
      averageDepth: pages.length > 0
        ? (pages.reduce((sum, p) => sum + p.depth, 0) / pages.length).toFixed(1)
        : 0,
      recentPages: pages.filter(p => this.isRecent(p.lastmod, 7)).length,
      imagePages: pages.filter(p => p.images && p.images.length > 0).length,
      videoPages: pages.filter(p => p.videos && p.videos.length > 0).length,
      totalImages: pages.reduce((s, p) => s + (p.images ? p.images.length : 0), 0),
      totalVideos: pages.reduce((s, p) => s + (p.videos ? p.videos.length : 0), 0)
    };
  }

  groupByDepth(pages) {
    const groups = {};
    pages.forEach(p => {
      if (!groups[p.depth]) groups[p.depth] = 0;
      groups[p.depth]++;
    });
    return groups;
  }

  groupByType(pages) {
    const groups = {
      homepage: 0,
      product: 0,
      blog: 0,
      category: 0,
      legal: 0,
      other: 0
    };

    pages.forEach(p => {
      if (this.isHomepage(p.url, p.baseUrl)) groups.homepage++;
      else if (this.isProductPage(p)) groups.product++;
      else if (this.isBlogPage(p)) groups.blog++;
      else if (this.isCategoryPage(p)) groups.category++;
      else if (this.isLegalPage(p)) groups.legal++;
      else groups.other++;
    });

    return groups;
  }
}

module.exports = MetadataExtractor;
