/*
 * crawler.js
 * ----------
 * Professional-grade crawling engine with:
 *   - depth limit
 *   - total URL cap
 *   - robots.txt respect
 *   - URL normalization & deduplication
 *   - filtering hooks
 *   - canonical handling and lastmod extraction
 *   - asynchronous (concurrent) fetching
 *
 * Usage example:
 *   const Crawler = require('./crawler');
 *   const c = new Crawler('https://example.com', { maxDepth:5, maxUrls:10000 });
 *   const pages = await c.crawl();
 *
 * Returned `pages` array contains objects:
 *   { url, depth, lastmod, canonical }
 */

const fetch = require('node-fetch');
const cheerio = require('cheerio');
const { URL } = require('url');
const Robots = require('./robots');
const { isAllowed } = require('./url-filter');
const Metadata = require('./metadata');
const { getCanonicalFor } = require('./canonicalHandler');

class Crawler {
  constructor(startUrl, options = {}) {
    this.startUrl = startUrl;
    const startUrlObj = new URL(startUrl);
    this.baseOrigin = startUrlObj.origin;
    // normalized origin for comparing (strips www.)
    this.baseOriginNormalized = this._normalizeOrigin(this.baseOrigin);

    // allow deeper traversals by default and larger URL budgets
    this.maxDepth = typeof options.maxDepth === 'number' ? options.maxDepth : 10;
    this.maxUrls = typeof options.maxUrls === 'number' ? options.maxUrls : 50000;
    // default concurrency bumped up for faster crawling of large sites
    this.concurrency = options.concurrency || 10;
    this.requestDelay = options.requestDelay || 0; // ms between requests
    // Use a browser-like default UA to avoid basic bot blocks on some sites.
    this.userAgent = options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36';

    this.filterOptions = Object.assign({
      baseOrigin: this.baseOrigin,
      includePagination: true,  // now enabled by default
      includeSearch: true        // now enabled by default
    }, options.filterOptions || {});

    // pro feature flags
    this.collectImages = !!options.collectImages;
    this.collectVideos = !!options.collectVideos;

    this.visited = new Set();
    this.inflight = new Set();
    this.discovered = [];
    this.queue = [];
    this.robots = new Robots(this.baseOrigin, this.userAgent);
    this._lastRequestTime = 0;
    this.verbose = !!options.verbose;
    // respect robots.txt by default; set to false to ignore rules (useful for testing)
    this.respectRobots = options.respectRobots !== false;

    this.abortController = new AbortController();
    this.signal = options.signal || this.abortController.signal;
    if (options.signal) {
      options.signal.addEventListener('abort', () => {
        if (!this.abortController.signal.aborted) {
          this.abortController.abort(options.signal.reason || new Error('Crawl aborted'));
        }
      });
    }
  }

  abort(reason = new Error('Crawl aborted')) {
    if (!this.abortController.signal.aborted) {
      this.abortController.abort(reason);
    }
  }

  _throwIfAborted() {
    if (this.signal && this.signal.aborted) {
      const reason = this.signal.reason || new Error('Crawl aborted');
      throw reason instanceof Error ? reason : new Error(String(reason));
    }
  }

  async crawl(progressCb) {
    if (typeof progressCb !== 'function') progressCb = () => {}
    this._throwIfAborted();
    await this.robots.init();
    // Seed queue from declared sitemaps (robots.txt Sitemap: entries) when available.
    const declaredSitemaps = this.robots.getSitemaps() || [];
    for (const sm of declaredSitemaps) {
      try {
        const r = await fetch(sm, { timeout: 3000 });
        if (!r.ok) continue;
        const txt = await r.text();
        const $ = cheerio.load(txt, { xmlMode: true });
        $('url > loc, loc').each((i, el) => {
          const loc = $(el).text().trim();
          const n = this.normalize(loc);
          if (!n) return;
          // filter sitemap entry just like any other URL
          if (this.robots.isDisallowed(n)) return;
          if (!isAllowed(n, this.filterOptions)) return;
          this.queue.push({ url: n, depth: 0 });
        });
      } catch (e) {
        // ignore sitemap fetch errors
      }
    }

    // always ensure the start URL is present (check filtering too)
    if ((this.respectRobots ? !this.robots.isDisallowed(this.startUrl) : true) && isAllowed(this.startUrl, this.filterOptions)) {
      if (this.verbose) console.log(`[Crawler] Adding start URL to queue: ${this.startUrl}`);
      this.queue.push({ url: this.startUrl, depth: 0 });
    } else {
      if (this.verbose) {
        console.log(`[Crawler] Start URL filtered out or blocked by robots: ${this.startUrl}`);
        console.log(`[Crawler] - respectRobots=${this.respectRobots}, isDisallowed=${this.robots.isDisallowed(this.startUrl)}, isAllowed=${isAllowed(this.startUrl, this.filterOptions)}`);
      }
    }

    const workers = [];
    const self = this;

    const processItem = async ({ url, depth }) => {
      this._throwIfAborted();

      if (depth > this.maxDepth) {
        if (this.verbose) console.log(`[Crawler] depth limit exceeded (${depth} > ${this.maxDepth}): ${url}`);
        return;
      }
      const norm = this.normalize(url);
      if (!norm) {
        if (this.verbose) console.log(`[Crawler] invalid URL: ${url}`);
        return;
      }
      if (this.visited.has(norm)) {
        if (this.verbose) console.log(`[Crawler] already visited: ${norm}`);
        return;
      }
      if (this.respectRobots && this.robots.isDisallowed(norm)) {
        if (this.verbose) console.log(`[Crawler] blocked by robots.txt: ${norm}`);
        return;
      }
      if (!isAllowed(norm, this.filterOptions)) {
        if (this.verbose) console.log(`[Crawler] filtered out: ${norm}`);
        return;
      }

      // prevent concurrent processing of the same URL
      if (this.inflight.has(norm)) return;
      this.inflight.add(norm);

      try {
        const { response, html, links } = await this.fetchPage(norm);
        // skip pages explicitly marked noindex
        if (links && links.noindex) {
          this.inflight.delete(norm);
          return;
        }
        const meta = Metadata.extract(norm, response, html);
        const canonicalNormalized = getCanonicalFor(norm, response, html, this.baseOrigin);
        const finalUrl = canonicalNormalized || norm;
        // lastmod: prefer extracted values, otherwise fall back to crawl date
        const lastmod = meta.lastmod || new Date().toISOString();
        if (this.visited.has(finalUrl)) {
          this.inflight.delete(norm);
          return; // canonical already visited
        }
        this.visited.add(finalUrl);

            const record = { url: finalUrl, depth, lastmod };
            if (this.collectImages && links.images && links.images.length) {
              record.images = links.images;
            }
            if (this.collectVideos && links.videos && links.videos.length) {
              record.videos = links.videos;
            }
            this.discovered.push(record);
            if (this.verbose) {
              console.log(`[Crawler] discovered: ${finalUrl} (depth=${depth}, total=${this.discovered.length})`);
            }

        for (const link of links.urls) {
          if (this.discovered.length + this.queue.length >= this.maxUrls) {
            if (this.verbose) console.log(`[Crawler] queue + discovered reached maxUrls limit (${this.maxUrls})`);
            break;
          }
          this.queue.push({ url: link, depth: depth + 1 });
        }
        if (this.verbose && links.urls.length > 0) {
          console.log(`[Crawler] queued ${links.urls.length} links, queue now has ${this.queue.length} items`);
        }
      } catch (err) {
        const isAbort = err && (err.name === 'AbortError' || err.message === 'Crawl aborted' || err.message === 'Job cancelled by user');
        if (isAbort) {
          this.inflight.delete(norm);
          throw err;
        }

        // log fetch errors when verbose
        if (this.verbose) {
          console.error(`[Crawler] failed to fetch ${norm}:`, err.message);
        }
      } finally {
        this.inflight.delete(norm);
      }
    };

    let hitMaxUrls = false;
    let maxVisitedDepth = 0;

    if (this.verbose) {
      console.log(`[Crawler] Starting crawl - queue size: ${this.queue.length}, maxDepth: ${this.maxDepth}, maxUrls: ${this.maxUrls}`);
    }

    while ((this.queue.length || workers.length) && this.discovered.length < this.maxUrls) {
      // keep progress updated even if the queue is empty while workers are running
      const percent = Math.min(100, Math.round((this.discovered.length / this.maxUrls) * 100));
      progressCb(percent);
      while (this.queue.length && workers.length < this.concurrency) {
        const item = this.queue.shift();
        const p = processItem(item).finally(() => {
          const idx = workers.indexOf(p);
          if (idx !== -1) workers.splice(idx, 1);
        });
        workers.push(p);
      }

      // Update progress based on discovered vs maxUrls
      progressCb(percent);

      if (workers.length) {
        await Promise.race(workers);
      }
    }

    await Promise.all(workers);

    // log crawl statistics
    console.log('[Crawler] ====== CRAWL SUMMARY ======');
    console.log(`[Crawler] discovered: ${this.discovered.length} URLs`);
    console.log(`[Crawler] visited: ${this.visited.size} unique URLs`);
    console.log(`[Crawler] max depth: ${this.maxDepth}`);
    if (this.discovered.length >= this.maxUrls) {
      console.log(`[Crawler] ⚠️  stopped early: reached maxUrls limit (${this.maxUrls})`);
    }
    // compute maxVisitedDepth from records
    maxVisitedDepth = 0;
    for (const r of this.discovered) {
      if (r.depth && r.depth > maxVisitedDepth) {
        maxVisitedDepth = r.depth;
      }
    }
    console.log(`[Crawler] max depth reached: ${maxVisitedDepth}`);
    if (maxVisitedDepth < this.maxDepth) {
      console.log(`[Crawler] ℹ️  site is shallower than maxDepth (no more links found after depth ${maxVisitedDepth})`);
    }
    console.log('[Crawler] ====== END SUMMARY ======');
    return this.discovered;
  }

  normalize(raw) {
    try {
      const url = new URL(raw, this.baseOrigin);
      const normalized = this._normalizeOrigin(url.origin);
      // allow same origin or www variant
      if (normalized !== this.baseOriginNormalized) return null;
      // strip fragment
      url.hash = '';
      // remove trailing slash except root
      if (url.pathname !== '/' && url.pathname.endsWith('/')) {
        url.pathname = url.pathname.slice(0, -1);
      }
      return url.href;
    } catch {
      return null;
    }
  }

  _normalizeOrigin(origin) {
    // strip www. from hostname for comparison
    try {
      const url = new URL(origin);
      url.hostname = url.hostname.replace(/^www\./, '');
      return url.origin;
    } catch {
      return origin;
    }
  }

  async fetchPage(url) {
    // enforce request delay
    const now = Date.now();
    const diff = now - this._lastRequestTime;
    if (diff < this.requestDelay) {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(resolve, this.requestDelay - diff);
        if (this.signal) {
          this.signal.addEventListener('abort', () => {
            clearTimeout(timeout);
            reject(this.signal.reason || new Error('Crawl aborted'));
          }, { once: true });
        }
      });
    }
    this._lastRequestTime = Date.now();

    const response = await fetch(url, {
      headers: { 'User-Agent': this.userAgent },
      redirect: 'follow',
      timeout: 30000,
      signal: this.signal
    })

    if (!response.ok) {
      if (this.verbose) console.log(`[Crawler] non-OK response for ${url}: ${response.status}`);
      throw new Error(`status ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    let html = '';
    let links = { urls: [], images: [], videos: [] };

    if (contentType.includes('html')) {
      html = await response.text();
      const $ = cheerio.load(html);

      // determine if this page is marked noindex
      const hasNoindex = !!$('meta[name="robots"][content*="noindex"]').length;

      $('a[href]').each((i, el) => {
        const href = $(el).attr('href');
        if (!href || href.startsWith('javascript:') || href.startsWith('mailto:')) return;
        // skip nofollow links
        const rel = ($(el).attr('rel') || '').toLowerCase();
        if (rel.includes('nofollow')) return;
        const norm = this.normalize(href);
        if (norm) {
          links.urls.push(norm);
        } else {
          if (this.verbose) console.log(`[Crawler] failed to normalize link: ${href}`);
        }
      });
      if (this.verbose) {
        console.log(`[Crawler] extracted ${links.urls.length} valid links from ${url}`);
      }
      if (this.collectImages) {
        $('img[src]').each((i, el) => {
          const src = $(el).attr('src');
          if (src) {
            try {
              links.images.push(new URL(src, url).href);
            } catch {}
          }
        });
      }
      if (this.collectVideos) {
        $('video source[src]').each((i, el) => {
          const src = $(el).attr('src');
          if (src) {
            try {
              links.videos.push(new URL(src, url).href);
            } catch {}
          }
        });
      }
      // dedupe
      links.urls = [...new Set(links.urls)];
      links.images = [...new Set(links.images)];
      links.videos = [...new Set(links.videos)];

      // pass flag upwards
      links.noindex = hasNoindex;
    }

    return { response, html, links };
  }
}

module.exports = Crawler;
