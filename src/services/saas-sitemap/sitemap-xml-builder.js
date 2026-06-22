/**
 * sitemap-xml-builder.js (DEPRECATED)
 * ------------------------------------
 * Legacy XML generator with hardcoded changefreq/priority logic and support
 * for multiple sitemap types.  The new `sitemap-builder.js` replaced this
 * module with a much simpler, size-aware splitter and default that omits
 * changefreq/priority unless `advancedMode` is enabled.
 *
 * Keep this file only for backwards compatibility; new jobs use the modern
 * builder located alongside the crawler.
 */

class SitemapXmlBuilder {
  /**
   * Build standard sitemap (URLs only)
   */
  buildStandardSitemap(pages) {
    const lines = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
    ];
    
    pages.forEach(page => {
      if (page.noindex) return; // Skip noindex pages
      
      lines.push('  <url>');
      lines.push(`    <loc>${this.escapeXml(page.url)}</loc>`);
      lines.push(`    <lastmod>${page.lastmod}</lastmod>`);
      lines.push(`    <changefreq>${page.changefreq}</changefreq>`);
      lines.push(`    <priority>${page.priority}</priority>`);
      lines.push('  </url>');
    });
    
    lines.push('</urlset>');
    return lines.join('\n');
  }

  /**
   * Build news sitemap (for blog/news content)
   */
  buildNewsSitemap(pages) {
    const lines = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
      '         xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">'
    ];
    
    pages
      .filter(p => p.isBlog || p.title) // Only pages with content
      .forEach(page => {
        lines.push('  <url>');
        lines.push(`    <loc>${this.escapeXml(page.url)}</loc>`);
        lines.push('    <news:news>');
        lines.push('      <news:publication>');
        lines.push(`        <news:name>News</news:name>`);
        lines.push(`        <news:language>en</news:language>`);
        lines.push('      </news:publication>');
        lines.push(`      <news:publication_date>${page.lastmod}</news:publication_date>`);
        lines.push(`      <news:title>${this.escapeXml(page.title || 'Article')}</news:title>`);
        lines.push('    </news:news>');
        lines.push('  </url>');
      });
    
    lines.push('</urlset>');
    return lines.join('\n');
  }

  /**
   * Build image sitemap
   */
  buildImageSitemap(pages) {
    const lines = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
      '        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">'
    ];
    
    pages.forEach(page => {
      if (!page.images || page.images.length === 0) return;
      
      lines.push('  <url>');
      lines.push(`    <loc>${this.escapeXml(page.url)}</loc>`);
      
      page.images.forEach(image => {
        lines.push('    <image:image>');
        lines.push(`      <image:loc>${this.escapeXml(image)}</image:loc>`);
        lines.push('    </image:image>');
      });
      
      lines.push('  </url>');
    });
    
    lines.push('</urlset>');
    return lines.join('\n');
  }

  /**
   * Build video sitemap
   */
  buildVideoSitemap(pages) {
    const lines = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
      '        xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">'
    ];
    
    pages.forEach(page => {
      if (!page.videos || page.videos.length === 0) return;
      
      lines.push('  <url>');
      lines.push(`    <loc>${this.escapeXml(page.url)}</loc>`);
      
      page.videos.forEach(video => {
        lines.push('    <video:video>');
        lines.push(`      <video:content_loc>${this.escapeXml(video)}</video:content_loc>`);
        lines.push(`      <video:title>${this.escapeXml(page.title || 'Video')}</video:title>`);
        lines.push(`      <video:description>${this.escapeXml(page.description || 'Video content')}</video:description>`);
        lines.push(`      <video:player_loc>${this.escapeXml(video)}</video:player_loc>`);
        lines.push('    </video:video>');
      });
      
      lines.push('  </url>');
    });
    
    lines.push('</urlset>');
    return lines.join('\n');
  }

  /**
   * Build sitemap index (for 50k+ URLs split across multiple sitemaps)
   */
  buildSitemapIndex(sitemapUrls) {
    const lines = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
    ];
    
    sitemapUrls.forEach(url => {
      lines.push('  <sitemap>');
      lines.push(`    <loc>${this.escapeXml(url)}</loc>`);
      lines.push(`    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>`);
      lines.push('  </sitemap>');
    });
    
    lines.push('</sitemapindex>');
    return lines.join('\n');
  }

  /**
   * Escape special XML characters
   */
  escapeXml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Get XML size
   */
  getXmlSize(xml) {
    return Buffer.byteLength(xml, 'utf8');
  }
}

module.exports = SitemapXmlBuilder;
