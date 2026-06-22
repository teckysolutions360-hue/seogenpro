/*
 * metadata.js
 * -----------
 * Extracts canonical URLs and "last modified" information from a fetched page.
 * Used by the crawler so that duplicates and date stamps are handled correctly.
 *
 * The extraction order for lastmod is:
 *  1. HTTP `Last-Modified` header
 *  2. `<meta property="article:modified_time">`
 *  3. First `<time>` tag (`datetime` attr or text)
 *  4. fallback to crawl date (caller can assign this if `null`)
 *
 * The canonical link is read from `<link rel="canonical">` and normalized to
 * the same origin when necessary.
 */

const cheerio = require('cheerio');

class Metadata {
  /**
   * @param {string} url         - URL that was requested
   * @param {Response} response  - node-fetch Response object
   * @param {string} html        - text body, may be empty if not HTML
   * @returns {{canonical:string,lastmod:string|null}}
   */
  static extract(url, response, html) {
    const info = { canonical: url, lastmod: null };

    // header-based timestamp
    if (response && response.headers) {
      const lm = response.headers.get('last-modified');
      if (lm) {
        const d = new Date(lm);
        if (!isNaN(d)) info.lastmod = d.toISOString();
      }
    }

    if (html) {
      const $ = cheerio.load(html);

      // canonical
      const canon = $('link[rel="canonical"]').attr('href');
      if (canon) {
        try {
          info.canonical = new URL(canon, url).href;
        } catch {} // ignore malformed
      }

      // meta property article:modified_time
      if (!info.lastmod) {
        const m = $('meta[property="article:modified_time"]').attr('content');
        if (m) {
          const d = new Date(m);
          if (!isNaN(d)) info.lastmod = d.toISOString();
        }
      }

      // <time> tag
      if (!info.lastmod) {
        const t = $('time').first();
        const dt = t.attr('datetime') || t.text();
        if (dt) {
          const d = new Date(dt);
          if (!isNaN(d)) info.lastmod = d.toISOString();
        }
      }
    }

    return info;
  }
}

module.exports = Metadata;
