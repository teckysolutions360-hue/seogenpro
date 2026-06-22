// This controller used to implement the legacy sitemap generator (changefreq/priority)
// but has been upgraded to the SaaS-style crawler which produces clean XML only.
// A few of the old helper modules have been removed as they are no longer needed.

const Crawler = require('../services/saas-sitemap/crawler');
const sitemapGenerator = require('../services/saas-sitemap/sitemapGenerator');
const { validateUrl } = require('../utils/validators');
const crypto = require('crypto');
 const DEBUG_SITEMAP = process.env.DEBUG_SITEMAP === 'true';

// In-memory store for job status (this mirrors the saas queue behaviour but is
// purely in-memory for backward compatibility with the original API).
const jobStore = new Map();
const MAX_PAGES = parseInt(process.env.MAX_PAGES_PER_SITEMAP) || 50000;

exports.generateSitemap = async (req, res) => {
  try {
    const {
      url,
      maxPages = MAX_PAGES,
      // no hard default depth here; leave undefined to let crawler use its own default (which is 10 or unlimited)
      maxDepth,
      filterOptions = {},
      respectRobots = true,
      verbose = false // allow callers to request crawler debug output
    } = req.body;

    // Validate input
    if (!url || !validateUrl(url)) {
      return res.status(400).json({ error: 'Valid URL is required' });
    }

    const jobId = crypto.randomUUID();
    jobStore.set(jobId, {
      status: 'pending',
      progress: 0,
      urls: [],
      startedAt: new Date()
    });

    console.log(`[SITEMAP-CONTROLLER] Starting job ${jobId} for ${url}`);

    // Perform crawling with new engine
    // create crawler using supplied options; do not override pagination/search defaults
    const crawler = new Crawler(url, {
      maxDepth,
      maxUrls: maxPages,
      filterOptions: filterOptions, // Crawler constructor will merge with its built-in defaults
      respectRobots,
      verbose
    });

    const pages = await crawler.crawl();
    const job = jobStore.get(jobId);
    if (job) {
      job.progress = 60;
      job.urls = pages.map(p => p.url);
    }

    // record whether crawler hit the maxPages limit
    const stoppedEarly = pages.length >= maxPages;


    // Build SEO-friendly sitemap XML (includes changefreq/priority tags)
    const { files: xmlFiles, index: indexXml } = sitemapGenerator.generate(pages, { advancedMode: true });
    let sitemapXml = xmlFiles.join('\n');
    if (indexXml) sitemapXml = indexXml + '\n<!-- individual files generated separately -->';

    if (job) {
      job.status = 'completed';
      job.progress = 100;
      job.sitemapXml = sitemapXml;
      job.stats = {
        totalUrls: pages.length,
        byDepth: pages.reduce((acc, p) => { acc[p.depth] = (acc[p.depth]||0)+1; return acc; }, {}),
        stoppedEarly,
        estimatedSize: Buffer.byteLength(sitemapXml, 'utf8'),
        generationTime: new Date() - job.startedAt
      };
      console.log(`[SITEMAP-CONTROLLER] job ${jobId} updated to completed progress=${job.progress}`);
    }

    res.json({
      success: true,
      jobId,
      statusUrl: `/api/sitemap/status/${jobId}`,
      sitemap: sitemapXml,
      stats: job ? job.stats : null,
      stoppedEarly
    });

  } catch (error) {
    console.error('[SITEMAP-CONTROLLER] Sitemap generation error:', error);
    const job = jobStore.get(jobId);
    if (job) {
      job.status = 'failed';
      job.progress = 100;
      job.error = error.message;
    }
    res.status(500).json({ error: error.message });
  }
};

exports.getSitemapStatus = (req, res) => {
  const { jobId } = req.params;
  const job = jobStore.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  const response = {
    success: true,
    jobId,
    status: job.status,
    progress: job.status === 'completed' ? 100 : (job.progress || 0),
    urlCount: job.urls?.length || 0,
    startedAt: job.startedAt,
    stats: job.stats || {}
  };

  if (job.status === 'completed') {
    response.sitemapXml = job.sitemapXml;
    response.urls = job.urls;
    
    // Include multi-file info if applicable
    if (job.sitemapFiles) {
      response.sitemapFiles = job.sitemapFiles.map(f => ({
        filename: f.filename,
        urlCount: f.urlCount,
        size: Buffer.byteLength(f.content)
      }));
      response.sitemapIndex = {
        filename: job.sitemapIndex.filename,
        size: Buffer.byteLength(job.sitemapIndex.content)
      };
    }
    
    // Include analysis if available
    if (job.analysis) {
      response.analysis = job.analysis;
    }
  }

  if (job.status === 'failed') {
    response.error = job.error;
  }

  // Clean up old jobs (older than 1 hour)
  if (job.startedAt < new Date(Date.now() - 3600000)) {
    jobStore.delete(jobId);
  }

  res.json(response);
};

// legacy helper removed; generation now delegated to saas-sitemap/sitemapGenerator

// function generateSitemapXml(...) { /* no longer used */ }

// escapeXml helper removed; new sitemap generator handles escaping