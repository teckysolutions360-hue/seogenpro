/*
 * robots.js
 * ---------
 * Simple wrapper around the `robots-parser` package that fetches and keeps
 * track of rules for a given origin.  It is asynchronous because we need to
 * retrieve /robots.txt before performing disallow checks.
 *
 * Exported class:
 *   const robots = new Robots('https://example.com');
 *   await robots.init();              // fetch & parse robots.txt
 *   robots.isDisallowed(urlString);   // true/false
 *   robots.getSitemaps();             // returns any sitemap declarations
 */

const fetch = require('node-fetch');
const robotsParser = require('robots-parser');
const { URL } = require('url');

class Robots {
  constructor(baseUrl, userAgent = '*') {
    this.baseOrigin = new URL(baseUrl).origin;
    this.userAgent = userAgent;
    this._parser = null;
    this._sitemaps = [];
  }

  async init() {
    try {
      const robotsUrl = `${this.baseOrigin}/robots.txt`;
      const res = await fetch(robotsUrl, { timeout: 3000 });
      const txt = res.ok ? await res.text() : '';
      this._parser = robotsParser(robotsUrl, txt);
      this._sitemaps = this._parser.getSitemaps() || [];
    } catch (err) {
      // network error: behave as if there are no rules
      this._parser = robotsParser('', '');
      this._sitemaps = [];
    }
  }

  isDisallowed(url) {
    if (!this._parser) return false;
    return !this._parser.isAllowed(url, this.userAgent);
  }

  getSitemaps() {
    return this._sitemaps;
  }
}

module.exports = Robots;
