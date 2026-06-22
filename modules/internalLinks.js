const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');

/**
 * Crawl a website to extract internal links, orphan pages, link depth, anchor diversity, and suggest internal linking improvements.
 * @param {string} url - Root URL to crawl
 * @param {object} options - { depth, concurrency }
 * @returns {object} Internal link report
 */
async function analyzeInternalLinks(url, options = {}) {
  const depth = options.depth || 2;
  const concurrency = options.concurrency || 5;
  const visited = new Set();
  const linkGraph = {};
  const anchorTexts = {};
  const queue = [{ url, level: 0 }];
  let rootDomain;
  
  try {
    rootDomain = new URL(url).hostname;
  } catch (err) {
    throw new Error(`Invalid URL: ${url}`);
  }

  // Simple async crawl with concurrency
  async function crawl() {
    let active = 0;
    let idx = 0;
    return new Promise((resolve) => {
      function next() {
        while (active < concurrency && idx < queue.length) {
          const item = queue[idx++];
          if (!item) continue;
          
          const { url: pageUrl, level } = item;
          if (visited.has(pageUrl) || level > depth) continue;
          visited.add(pageUrl);
          active++;
          
          axios.get(pageUrl, { timeout: 10000 }).then((res) => {
            const $ = cheerio.load(res.data);
            const links = [];
            $('a[href]').each((_, el) => {
              const href = $(el).attr('href');
              const anchor = $(el).text().trim();
              try {
                const absUrl = new URL(href, pageUrl);
                if (absUrl.hostname === rootDomain && !visited.has(absUrl.href)) {
                  links.push(absUrl.href);
                  anchorTexts[absUrl.href] = anchorTexts[absUrl.href] || [];
                  if (anchor && anchor.length > 0) anchorTexts[absUrl.href].push(anchor);
                  if (!visited.has(absUrl.href) && level < depth) {
                    queue.push({ url: absUrl.href, level: level + 1 });
                  }
                }
              } catch {}
            });
            linkGraph[pageUrl] = links;
          }).catch((err) => {
            linkGraph[pageUrl] = [];
          }).finally(() => {
            active--;
            if (active === 0 && idx >= queue.length) resolve();
            else next();
          });
        }
      }
      next();
    });
  }

  await crawl();

  // Orphan pages: pages with no incoming links (except root)
  const allPages = Object.keys(linkGraph);
  const incomingLinks = {};
  allPages.forEach((page) => {
    linkGraph[page].forEach((target) => {
      incomingLinks[target] = incomingLinks[target] || [];
      incomingLinks[target].push(page);
    });
  });
  const orphanPages = allPages.filter((page) => !incomingLinks[page] && page !== url);

  // Link depth: shortest path from root
  const linkDepth = {};
  linkDepth[url] = 0;
  const queueDepth = [url];
  while (queueDepth.length) {
    const current = queueDepth.shift();
    const depthVal = linkDepth[current];
    (linkGraph[current] || []).forEach((target) => {
      if (linkDepth[target] === undefined || linkDepth[target] > depthVal + 1) {
        linkDepth[target] = depthVal + 1;
        queueDepth.push(target);
      }
    });
  }

  // Anchor diversity
  const anchorDiversity = {};
  Object.keys(anchorTexts).forEach((page) => {
    const unique = Array.from(new Set(anchorTexts[page].filter(a => a.length > 0)));
    anchorDiversity[page] = {
      count: unique.length,
      anchors: unique.slice(0, 10) // Top 10 anchors
    };
  });

  // Internal linking suggestions
  const suggestions = orphanPages.map((page) => ({
    page,
    depth: linkDepth[page] || 'unreachable',
    suggestion: 'Add internal links to this orphan page from relevant content pages.',
    recommendedSources: allPages.filter(p => linkGraph[p] && !linkGraph[p].includes(page)).slice(0, 3)
  }));

  return {
    summary: {
      totalPages: allPages.length,
      orphanPages: orphanPages.length,
      averageDepth: allPages.length > 0 ? Object.values(linkDepth).reduce((a, b) => a + b, 0) / allPages.length : 0
    },
    pages: allPages.sort(),
    orphanPages: orphanPages.sort(),
    linkDepth,
    anchorDiversity,
    suggestions,
    linkGraph
  };
}

module.exports = {
  analyzeInternalLinks
};
