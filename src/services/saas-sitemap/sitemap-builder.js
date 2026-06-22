/*
 * sitemap-builder.js
 * ------------------
 * Produces clean sitemap XML and handles splitting/indexing when the data set
 * exceeds search-engine limits (50,000 URLs or 50 MB uncompressed).  This file
 * contains two exported helpers:
 *
 *   const { xmlFiles, indexXml } = SitemapBuilder.build(pages, opts);
 *
 * where `pages` is an array of {url,lastmod} objects.
 *
 * Options:
 *   maxUrls      - maximum URLs per single sitemap (defaults to 50000)
 *   maxBytes     - approximate byte limit per file (defaults to 50*1024*1024)
 *   advancedMode - if true include <changefreq> and <priority> tags (requires
 *                  a metadata object that supplies them).
 */

class SitemapBuilder {
  static build(pages, options = {}) {
    const maxUrls = options.maxUrls || 50000;
    const maxBytes = options.maxBytes || 50 * 1024 * 1024;
    // Allow optional SEO-friendly output (changefreq/priority) via advancedMode
    const advanced = options.advancedMode === true;
    const baseUrl = options.baseUrl || '';

    // dedupe and optionally sort pages by URL for consistent output
    const seen = new Set();
    pages = pages.filter(p => {
      if (seen.has(p.url)) return false;
      seen.add(p.url);
      return true;
    });
    pages.sort((a,b) => a.url.localeCompare(b.url));

    const files = [];
    let current = [];
    let currentSize = 0;

    function flush() {
      if (current.length === 0) return;
      const xml = SitemapBuilder._buildXml(current, { advanced }); // advanced always false
      files.push(xml);
      current = [];
      currentSize = 0;
    }

    for (const page of pages) {
      const entry = SitemapBuilder._urlEntry(page, { advanced });
      const entrySize = Buffer.byteLength(entry, 'utf8');
      if (current.length >= maxUrls || currentSize + entrySize > maxBytes) {
        flush();
      }
      current.push(page);
      currentSize += entrySize;
    }

    flush();

    // if more than one sitemap, produce index
    let indexXml = null;
    if (files.length > 1) {
      indexXml = SitemapBuilder._buildIndex(files, baseUrl);
    }

    return { xmlFiles: files, indexXml };
  }

  static _buildXml(pages, opts) {
    const lines = ['<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'];
    for (const p of pages) {
      lines.push(SitemapBuilder._urlEntry(p, opts));
    }
    lines.push('</urlset>');
    return lines.join('\n');
  }

  static _escape(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  static _inferSeoValues(page) {
    // Basic heuristics for SEO-friendly changefreq/priority when not provided.
    const url = (page.url || '').toLowerCase();
    const defaults = { changefreq: 'monthly', priority: '0.5' };

    if (url === '' || url.endsWith('/') || url.endsWith('/index.html')) {
      return { changefreq: 'weekly', priority: '1.0' };
    }

    if (url.includes('/blog') || url.includes('/post') || url.includes('/article')) {
      return { changefreq: 'monthly', priority: '0.7' };
    }

    if (url.includes('/product') || url.includes('/service') || url.includes('/pricing')) {
      return { changefreq: 'weekly', priority: '0.8' };
    }

    if (url.includes('/category') || url.includes('/tag') || url.includes('/archive')) {
      return { changefreq: 'monthly', priority: '0.6' };
    }

    if (url.includes('/privacy') || url.includes('/terms') || url.includes('/policy')) {
      return { changefreq: 'yearly', priority: '0.4' };
    }

    return defaults;
  }

  static _urlEntry(page, opts) {
    const parts = ['  <url>', `    <loc>${SitemapBuilder._escape(page.url)}</loc>`];
    if (page.lastmod) {
      parts.push(`    <lastmod>${SitemapBuilder._escape(page.lastmod.split('T')[0])}</lastmod>`);
    }

    if (opts.advanced) {
      const seo = SitemapBuilder._inferSeoValues(page);
      const changefreq = page.changefreq || seo.changefreq;
      const priority = page.priority || seo.priority;

      if (changefreq) {
        parts.push(`    <changefreq>${SitemapBuilder._escape(changefreq)}</changefreq>`);
      }
      if (priority) {
        parts.push(`    <priority>${SitemapBuilder._escape(priority)}</priority>`);
      }
    }

    parts.push('  </url>');
    return parts.join('\n');
  }

  static _buildIndex(xmlFiles, baseUrl = '') {
    const lines = ['<?xml version="1.0" encoding="UTF-8"?>',
      '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'];
    xmlFiles.forEach((xml, i) => {
      lines.push('  <sitemap>');
      const loc = baseUrl ? `${baseUrl.replace(/\/$/, '')}/sitemap-${i + 1}.xml` : `sitemap-${i + 1}.xml`;
      lines.push(`    <loc>${SitemapBuilder._escape(loc)}</loc>`);
      lines.push(`    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>`);
      lines.push('  </sitemap>');
    });
    lines.push('</sitemapindex>');
    return lines.join('\n');
  }
}

module.exports = SitemapBuilder;
