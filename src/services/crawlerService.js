const axios = require('axios');
const cheerio = require('cheerio');
const robotsParser = require('robots-parser');
const URL = require('url').URL;
const https = require('https');
const http = require('http');
const { JSDOM } = require('jsdom');

class CrawlerService {
  constructor() {
    this.visited = new Set();
    this.urlHashes = new Set();
    this.queue = [];
    this.robots = null;
    this.maxPages = parseInt(process.env.MAX_PAGES_PER_SITEMAP) || 50000;
    this.excludePatterns = [];
    this.isSPA = false;
    this.depthMap = new Map();  // Track URL depth
    this.maxDepth = Infinity;   // No depth limit by default
  }

// helper that strips leading www. for comparisons
  _stripWww(hostname) {
    return hostname.toLowerCase().replace(/^www\./, '');
  }

  shouldCrawlUrl(urlString) {
    try {
      const url = new URL(urlString);
      const path = url.pathname.toLowerCase();

      // Exclude WordPress admin and sitemap endpoints
      if (path.startsWith('/wp-admin') || path.includes('/wp-sitemap')) return false;

      // Exclude common auth/account/cart pages
      if (path.includes('/forgot-password')) return false;
      if (path.includes('/cart')) return false;
      if (path.includes('/checkout')) return false;
      if (path.includes('/login')) return false;
      if (path.includes('/signup')) return false;
      if (path.includes('/register')) return false;
      if (path.includes('/account')) return false;
      if (path.includes('/user')) return false;

      // Exclude XML files and sitemap index files
      if (path.endsWith('.xml') || path.includes('sitemapindex')) return false;

      // Exclude author and date archives
      if (/\/author\//i.test(path)) return false;
      if (/\/[0-9]{4}\/([0-9]{2}(\/[0-9]{2})?)?/.test(path)) return false;

      // Exclude common feed endpoints
      if (path.endsWith('/feed') || path.endsWith('/rss')) return false;

      return true;
    } catch (e) {
      return false;
    }
  }

  normalizeUrl(urlString) {
    try {
      const url = new URL(urlString);
      // canonicalize protocol and hostname
      url.protocol = url.protocol.toLowerCase();
      url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');

      // drop default ports
      if ((url.protocol === 'http:' && url.port === '80') || (url.protocol === 'https:' && url.port === '443')) {
        url.port = '';
      }

      // Remove common tracking parameters
      const params = new URLSearchParams(url.search);
      const keepParams = ['page', 'id', 'category', 'filter', 'sort'];
      const newParams = new URLSearchParams();
      keepParams.forEach(param => {
        if (params.has(param)) {
          newParams.set(param, params.get(param));
        }
      });
      url.search = newParams.toString();

      // strip trailing slash except root
      if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
        url.pathname = url.pathname.slice(0, -1);
      }

      url.hash = '';
      return url.toString();
    } catch (e) {
      return urlString;
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async crawlSite({ url, maxPages = null, maxDepth = Infinity, excludePatterns = [], respectRobotsTxt = true, concurrency = 6, timeout = 10000, requestDelay = 0, maxRetries = 1, maxDurationMs = 60000, onProgress, onComplete, onError }) {
    maxPages = maxPages || this.maxPages;
    this.visited.clear();
    this.urlHashes.clear();
    this.depthMap.clear();
    this.queue = [this.normalizeUrl(url)];
    this.maxPages = maxPages;
    this.maxDepth = maxDepth;
    this.excludePatterns = excludePatterns.map(p => new RegExp(p));
    this.isSPA = false; // Reset SPA detection
    this.concurrency = concurrency;
    this.requestTimeout = timeout;
    this.requestDelay = requestDelay;
    this.maxRetries = maxRetries;
    this.maxDurationMs = maxDurationMs;
    this.startTime = Date.now();

    // Set root URL depth to 0
    this.depthMap.set(this.normalizeUrl(url), 0);

    try {
      // Fetch robots.txt if needed
      if (respectRobotsTxt) {
        await this.fetchRobotsTxt(url);
      }

      // Try to fetch existing sitemap first (useful for SPAs)
      const sitemapUrls = await this.fetchAndParseSitemap(url);
      if (sitemapUrls.length > 0) {
        sitemapUrls.forEach(sitemapUrl => {
          // Only queue canonical content URLs from sitemap (skip xml/index entries)
          if (this.shouldCrawlUrl(sitemapUrl) && !this.visited.has(sitemapUrl)) {
            this.queue.push(sitemapUrl);
          }
        });
      }

      // Start crawling with a limited number of concurrent workers
      const workers = Array.from({ length: this.concurrency }, () => this._worker(onProgress));
      await Promise.all(workers);

      onComplete(Array.from(this.visited));
    } catch (error) {
      onError(error);
    }
  }

  async _worker(onProgress) {
    while (this.queue.length > 0 && this.visited.size < this.maxPages) {
      if (this.maxDurationMs && (Date.now() - this.startTime) > this.maxDurationMs) {
        console.warn('[Crawler] Max crawl duration reached, stopping early');
        break;
      }

      const nextUrl = this.queue.shift();
      if (!nextUrl) break;
      await this._processUrl(nextUrl, onProgress);
      if (this.requestDelay) await this.sleep(this.requestDelay);
    }
  }

  async _processUrl(url, onProgress, retries = this.maxRetries) {
    // Stop early if we exceeded max duration
    if (this.maxDurationMs && (Date.now() - this.startTime) > this.maxDurationMs) {
      return;
    }

    // Normalize URL to avoid duplicates
    const normalizedUrl = this.normalizeUrl(url);

    if (this.visited.size >= this.maxPages) return;
    if (this.visited.has(normalizedUrl)) return;

    // Apply strict URL filters
    if (!this.shouldCrawlUrl(normalizedUrl)) {
      console.log(`Skipped by filter: ${normalizedUrl}`);
      this.visited.add(normalizedUrl);
      return;
    }

    // Check depth limit
    const currentDepth = this.depthMap.get(normalizedUrl) || 0;
    if (currentDepth > this.maxDepth) {
      console.log(`⏹️  Depth limit exceeded (${currentDepth} > ${this.maxDepth}): ${normalizedUrl}`);
      return;
    }

    // Check robots.txt
    if (this.robots && !this.robots.isAllowed(normalizedUrl, 'SitemapGeneratorBot')) {
      console.log(`Blocked by robots.txt: ${normalizedUrl}`);
      return;
    }

    // Check exclude patterns
    for (const pattern of this.excludePatterns) {
      if (pattern.test(normalizedUrl)) {
        console.log(`Excluded by pattern: ${normalizedUrl}`);
        return;
      }
    }

    try {
      console.log(`Crawling: ${normalizedUrl} (attempt ${4 - retries}/3)`);
      const response = await axios.get(normalizedUrl, {
        timeout: this.requestTimeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5'
        },
        maxRedirects: 5,
        validateStatus: function(status) {
          return status >= 200 && status < 400;
        },
        httpsAgent: new https.Agent({
          keepAlive: true,
          rejectUnauthorized: false
        }),
        httpAgent: new http.Agent({
          keepAlive: true
        })
      });

      this.visited.add(normalizedUrl);
      onProgress && onProgress(Math.round((this.visited.size / this.maxPages) * 100), normalizedUrl);
      console.log(`✓ Successfully crawled: ${normalizedUrl}`);

      // Parse HTML and find links
      if (response.headers['content-type']?.includes('text/html') || response.status === 200) {
        try {
          let htmlToParse = response.data;
          let links = [];

          // Detect SPA on first page
          if (this.visited.size === 1) {
            if (this.detectSPA(htmlToParse)) {
              this.isSPA = true;

              // For SPAs, try multiple strategies
              console.log(`🔍 Using SPA-friendly extraction strategies...`);

              // Strategy 1: Extract from JSON-LD schema
              const schemaLinks = this.extractLinksFromSchema(htmlToParse, normalizedUrl);
              links = [...new Set([...links, ...schemaLinks])];

              // Strategy 2: Try JSDOM rendering on first few pages
              if (links.length === 0 && this.visited.size <= 3) {
                htmlToParse = await this.renderWithJSDOM(htmlToParse, normalizedUrl);
              }
            }
          }

          // If still no links found, extract from HTML
          if (links.length === 0) {
            links = this.extractLinks(htmlToParse, normalizedUrl);
          }

          console.log(`Found ${links.length} links on ${normalizedUrl}`);

          // Add new links to queue with depth tracking
          const nextDepth = currentDepth + 1;
          for (const link of links) {
            const normalizedLink = this.normalizeUrl(link);
            // Only consider links that pass the crawler filters
            if (!this.shouldCrawlUrl(normalizedLink)) continue;
            // avoid enqueueing duplicates
            if (!this.visited.has(normalizedLink) && !this.queue.includes(normalizedLink)) {
              // Only queue if within depth limit
              if (nextDepth <= this.maxDepth) {
                // respect overall page limit rather than arbitrary queue size
                if (this.visited.size + this.queue.length < this.maxPages) {
                  this.queue.push(normalizedLink);
                  this.depthMap.set(normalizedLink, nextDepth);
                }
              }
            }
          }
        } catch (parseError) {
          console.error(`Error parsing links from ${normalizedUrl}:`, parseError.message);
        }
      }

    } catch (error) {
      console.error(`Error crawling ${normalizedUrl} (${error.code || error.message})`);

      // Retry logic for network errors
      if (retries > 0 && (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND')) {
        console.log(`Retrying ${normalizedUrl}... (${retries} attempts left)`);
        await this.sleep(1000);
        return this._processUrl(normalizedUrl, onProgress, retries - 1);
      }

      // Mark as visited even if failed
      this.visited.add(normalizedUrl);
    }
  }

  async fetchRobotsTxt(baseUrl) {
    try {
      const robotsUrl = new URL('/robots.txt', baseUrl).toString();
      const response = await axios.get(robotsUrl, { 
        timeout: 10000,
        headers: {
          'User-Agent': 'SitemapGeneratorBot/1.0'
        }
      });
      this.robots = robotsParser(robotsUrl, response.data);
    } catch (error) {
      // If no robots.txt, assume everything is allowed
      console.log(`Could not fetch robots.txt: ${error.message}`);
      this.robots = null;
    }
  }

  async renderWithJSDOM(html, baseUrl) {
    try {
      console.log(`🔧 Rendering page with JSDOM for JavaScript execution...`);
      const dom = new JSDOM(html, {
        url: baseUrl,
        pretendToBeVisual: true,
        resources: 'usable',
        timeout: 15000
      });
      
      return dom.window.document.documentElement.outerHTML;
    } catch (error) {
      console.warn(`⚠️ JSDOM rendering failed: ${error.message}`);
      return html;
    }
  }

  detectSPA(html) {
    try {
      const $ = cheerio.load(html);
      const anchorCount = $('a[href]').length;
      
      // Also check for common SPA indicators
      const isSPAIndicator = html.includes('root') && html.includes('module') && html.includes('.js');
      
      if (anchorCount === 0 && isSPAIndicator) {
        console.log(`🚨 Detected Single-Page Application (SPA) - will use enhanced extraction`);
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  extractLinksFromSchema(html, baseUrl) {
    try {
      const links = new Set();
      const base = new URL(baseUrl);
      
      // Extract JSON-LD schema data
      const jsonLdRegex = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
      let match;
      
      while ((match = jsonLdRegex.exec(html)) !== null) {
        try {
          const schema = JSON.parse(match[1]);
          
          // Extract URLs from various schema types
          if (schema.url && typeof schema.url === 'string') {
            try {
              const urlObj = new URL(schema.url, baseUrl);
              if (urlObj.hostname === base.hostname) {
                links.add(urlObj.toString());
              }
            } catch (e) {}
          }
          
          // Some schemas have isPartOf with links
          if (schema.isPartOf?.url) {
            try {
              const urlObj = new URL(schema.isPartOf.url, baseUrl);
              if (urlObj.hostname === base.hostname) {
                links.add(urlObj.toString());
              }
            } catch (e) {}
          }
        } catch (parseError) {
          // Not valid JSON, skip
        }
      }
      
      if (links.size > 0) {
        console.log(`📋 Extracted ${links.size} URLs from JSON-LD schema`);
      }
      
      return Array.from(links);
    } catch (e) {
      return [];
    }
  }

  async fetchAndParseSitemap(baseUrl) {
    try {
      const sitemapUrl = new URL('/sitemap.xml', baseUrl).toString();
      const response = await axios.get(sitemapUrl, {
        timeout: 10000,
        headers: { 'User-Agent': 'SitemapGeneratorBot/1.0' }
      });
      
      const $ = cheerio.load(response.data);
      const links = new Set();
      const base = new URL(baseUrl);
      const baseHost = this._stripWww(base.hostname);
      
      $('loc').each((i, element) => {
        try {
          const url = $(element).text().trim();
          const urlObj = new URL(url);
          if (this._stripWww(urlObj.hostname) === baseHost) {
            links.add(url);
          }
        } catch (e) {}
      });
      
      if (links.size > 0) {
        console.log(`🗺️  Found ${links.size} URLs in existing sitemap.xml`);
        return Array.from(links);
      }
    } catch (error) {
      console.log(`No sitemap.xml available at ${baseUrl}`);
    }
    return [];
  }

  async crawl(url, onProgress) {
    // Legacy alias for crawlSite (backwards compatibility)
    await this.crawlSite({ url, maxPages: this.maxPages, onProgress });
    return;
  }

  // Legacy crawl implementation retained for reference / testing
  async crawl_legacy(url, onProgress, retries = 3) {
    // Normalize URL to avoid duplicates
    const normalizedUrl = this.normalizeUrl(url);
    
    if (this.visited.size >= this.maxPages) {
      return;
    }

    if (this.visited.has(normalizedUrl)) return;

    // Apply strict URL filters
    if (!this.shouldCrawlUrl(normalizedUrl)) {
      console.log(`Skipped by filter: ${normalizedUrl}`);
      this.visited.add(normalizedUrl);
      return;
    }
    
    // Check depth limit
    const currentDepth = this.depthMap.get(normalizedUrl) || 0;
    if (currentDepth > this.maxDepth) {
      console.log(`⏹️  Depth limit exceeded (${currentDepth} > ${this.maxDepth}): ${normalizedUrl}`);
      return;
    }

    // Check robots.txt
    if (this.robots && !this.robots.isAllowed(normalizedUrl, 'SitemapGeneratorBot')) {
      console.log(`Blocked by robots.txt: ${normalizedUrl}`);
      return;
    }

    // Check exclude patterns
    for (const pattern of this.excludePatterns) {
      if (pattern.test(normalizedUrl)) {
        console.log(`Excluded by pattern: ${normalizedUrl}`);
        return;
      }
    }

    try {
      console.log(`Crawling: ${normalizedUrl} (attempt ${4 - retries}/3)`);
      const response = await axios.get(normalizedUrl, {
        timeout: 20000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5'
        },
        maxRedirects: 5,
        validateStatus: function(status) {
          return status >= 200 && status < 400;
        },
        httpsAgent: new https.Agent({
          keepAlive: true,
          rejectUnauthorized: false
        }),
        httpAgent: new http.Agent({
          keepAlive: true
        })
      });

      this.visited.add(normalizedUrl);
      onProgress(Math.round((this.visited.size / this.maxPages) * 100), normalizedUrl);
      console.log(`✓ Successfully crawled: ${normalizedUrl}`);

      // Parse HTML and find links
      if (response.headers['content-type']?.includes('text/html') || response.status === 200) {
        try {
          let htmlToParse = response.data;
          let links = [];
          
          // Detect SPA on first page
          if (this.visited.size === 1) {
            if (this.detectSPA(htmlToParse)) {
              this.isSPA = true;
              
              // For SPAs, try multiple strategies
              console.log(`🔍 Using SPA-friendly extraction strategies...`);
              
              // Strategy 1: Extract from JSON-LD schema
              const schemaLinks = this.extractLinksFromSchema(htmlToParse, normalizedUrl);
              links = [...new Set([...links, ...schemaLinks])];
              
              // Strategy 2: Try JSDOM rendering on first few pages
              if (links.length === 0 && this.visited.size <= 3) {
                htmlToParse = await this.renderWithJSDOM(htmlToParse, normalizedUrl);
              }
            }
          }
          
          // If still no links found, extract from HTML
          if (links.length === 0) {
            links = this.extractLinks(htmlToParse, normalizedUrl);
          }
          
          console.log(`Found ${links.length} links on ${normalizedUrl}`);
          
          // Add new links to queue with depth tracking
          const nextDepth = currentDepth + 1;
          for (const link of links) {
            const normalizedLink = this.normalizeUrl(link);
            // Only consider links that pass the crawler filters
            if (!this.shouldCrawlUrl(normalizedLink)) continue;
            // avoid enqueueing duplicates
            if (!this.visited.has(normalizedLink) && !this.queue.includes(normalizedLink)) {
              // Only queue if within depth limit
              if (nextDepth <= this.maxDepth) {
                // respect overall page limit rather than arbitrary queue size
                if (this.visited.size + this.queue.length < this.maxPages) {
                  this.queue.push(normalizedLink);
                  this.depthMap.set(normalizedLink, nextDepth);
                }
              }
            }
          }
        } catch (parseError) {
          console.error(`Error parsing links from ${normalizedUrl}:`, parseError.message);
        }
      }

      // Process next URLs in queue recursively
      while (this.queue.length > 0 && this.visited.size < this.maxPages) {
        const nextUrl = this.queue.shift();
        await this.crawl(nextUrl, onProgress, 3);
      }

    } catch (error) {
      console.error(`Error crawling ${normalizedUrl} (${error.code || error.message})`);
      
      // Retry logic for network errors
      if (retries > 0 && (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND')) {
        console.log(`Retrying ${normalizedUrl}... (${retries} attempts left)`);
        await new Promise(r => setTimeout(r, 1000));
        return this.crawl(normalizedUrl, onProgress, retries - 1);
      }
      
      // Mark as visited even if failed
      this.visited.add(normalizedUrl);
      
      // Continue with remaining URLs in queue
      while (this.queue.length > 0 && this.visited.size < this.maxPages) {
        const nextUrl = this.queue.shift();
        await this.crawl(nextUrl, onProgress, 3);
      }
    }
  }

  extractLinks(html, baseUrl) {
    const $ = cheerio.load(html);
    const links = new Set();
    const base = new URL(baseUrl);
    const baseHost = this._stripWww(base.hostname);
    
    // Extract main navigation links
    $('a[href]').each((i, element) => {
      try {
        let href = $(element).attr('href');
        
        // Skip empty, hash, or mailto links
        if (!href || href.trim() === '' || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
          return;
        }

        // Resolve relative URLs
        const absoluteUrl = new URL(href, baseUrl).toString();
        const urlObj = new URL(absoluteUrl);

        // Normalize hostname comparison
        const linkHost = this._stripWww(urlObj.hostname);
        if (linkHost !== baseHost) {
          // different host (e.g. www vs non-www or external) – skip
          // console.log(`🔗 skipping external host ${urlObj.hostname}`);
          return;
        }

        // canonicalize URL and remove hash
        urlObj.hash = '';
        const cleanUrl = urlObj.toString();

        // Skip common unimportant pages and file types
        if (!cleanUrl.includes('logout') && 
            !cleanUrl.includes('login') && 
            !cleanUrl.includes('.pdf') &&
            !cleanUrl.includes('.jpg') &&
            !cleanUrl.includes('.jpeg') &&
            !cleanUrl.includes('.png') &&
            !cleanUrl.includes('.gif') &&
            !cleanUrl.includes('.svg') &&
            !cleanUrl.includes('.ico') &&
            !cleanUrl.includes('.css') &&
            !cleanUrl.includes('.js')) {
          links.add(cleanUrl);
        }
      } catch (e) {
        // Invalid URL, skip silently
      }
    });

    return Array.from(links);
  }
}

module.exports = new CrawlerService();