/**
 * saas-sitemap-routes.js
 * Express routes for SaaS sitemap generation
 * 
 * Endpoints:
 * POST   /api/saas/sitemap/generate  - Submit URL for crawling
 * GET    /api/saas/sitemap/status/:jobId - Check job status
 * GET    /api/saas/sitemap/download/:jobId - Download sitemap
 */

const express = require('express');
const Bull = require('bull');
// modern generator modules
const Crawler = require('./crawler');
const SitemapBuilder = require('./sitemap-builder');
const sitemapGenerator = require('./sitemapGenerator');

// legacy helpers (no longer used)
// const WebCrawler = require('./web-crawler');
// const MetadataExtractor = require('./metadata-extractor');
// const SitemapXmlBuilder = require('./sitemap-xml-builder');

const net = require('net');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// Global error handlers to avoid silent crashes
process.on('unhandledRejection', (reason, p) => {
  console.error('[Global] Unhandled Rejection at:', p, 'reason:', reason && reason.stack ? reason.stack : reason);
});
process.on('uncaughtException', (err) => {
  console.error('[Global] Uncaught Exception:', err && err.stack ? err.stack : err);
});

// ============================================================================
// SETUP BULL QUEUE
// ============================================================================

function parseRedisUrl(redisUrl) {
  if (!redisUrl) return null;
  try {
    const url = new URL(redisUrl);
    const options = {
      host: url.hostname,
      port: Number(url.port) || 6379,
      password: url.password || undefined,
      db: url.pathname && url.pathname.length > 1 ? parseInt(url.pathname.slice(1), 10) : undefined
    };
    if (url.protocol === 'rediss:') {
      options.tls = {};
    }
    return options;
  } catch (err) {
    console.warn('[Queue] Invalid REDIS_URL, falling back to individual REDIS_* env vars:', err.message);
    return null;
  }
}

const redisUrlOptions = parseRedisUrl(
  process.env.REDIS_URL ||
  process.env.REDIS_URI ||
  process.env.REDIS_CONNECTION_STRING ||
  process.env.REDIS_TLS_URL ||
  process.env.REDIS_REDIS_URL
);
const explicitRedisConfig = Boolean(
  redisUrlOptions ||
  process.env.REDIS_HOST ||
  process.env.REDIS_ENDPOINT
);

const REDIS_REQUIRED_MESSAGE = '[Queue] Redis is not configured. SaaS sitemap queue requires REDIS_URL or REDIS_HOST/REDIS_PORT and must be restarted once configured.';

if (!explicitRedisConfig) {
  console.error(REDIS_REQUIRED_MESSAGE);
}

const redisConfigBase = {
  ...(process.env.REDIS_HOST ? { host: process.env.REDIS_HOST } : {}),
  ...(process.env.REDIS_ENDPOINT && !process.env.REDIS_HOST ? { host: process.env.REDIS_ENDPOINT } : {}),
  ...(process.env.REDIS_PORT ? { port: parseInt(process.env.REDIS_PORT, 10) } : {}),
  ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
  ...(process.env.REDIS_DB ? { db: parseInt(process.env.REDIS_DB, 10) } : {})
};

const redisConfig = explicitRedisConfig ? {
  redis: Object.assign({}, redisConfigBase, redisUrlOptions || {})
} : null;

if (!explicitRedisConfig && (process.env.REDIS_PORT || process.env.REDIS_PASSWORD || process.env.REDIS_DB)) {
  console.error('[Queue] Redis configuration incomplete. REDIS_HOST or REDIS_URL is required. SaaS sitemap queue cannot start.');
}

if (redisConfig && redisConfig.redis) {
  redisConfig.redis.maxRetriesPerRequest = null; // disable node-redis per-request retry cap for Bull
}

// Make the Redis/Bull connection more tolerant for managed TLS providers
// (e.g. Upstash) which may not behave like a long-lived Redis instance.
// - `REDIS_DISABLE_READY_CHECK=1` forces `enableReadyCheck=false`.
// - For Upstash hosts we automatically disable the ready check.
if (redisConfig && redisConfig.redis) {
  try {
    const host = redisUrlOptions && redisUrlOptions.host ? redisUrlOptions.host : redisConfig.redis.host;
    const disableReady = process.env.REDIS_DISABLE_READY_CHECK === '1' || (host && host.includes('upstash.io'));
    if (disableReady) {
      redisConfig.redis.enableReadyCheck = false;
    }

    // Respect connect timeout env if provided (ms)
    redisConfig.redis.connectTimeout = parseInt(process.env.REDIS_CONNECT_TIMEOUT_MS, 10) || redisConfig.redis.connectTimeout || 10000;

    // Keepalive option may help with transient disconnects
    if (typeof redisConfig.redis.socket_keepalive === 'undefined') {
      redisConfig.redis.socket_keepalive = true;
    }
  } catch (err) {
    console.warn('[Queue] Failed to apply resilient Redis options:', err && err.message ? err.message : err);
  }
}

let sitemapQueue = null;
let redisConnected = false;
let lastRedisErrorMessage = null;
let lastRedisErrorTime = 0;
let queueReadyPromise = null;
const QUEUE_CONNECT_TIMEOUT_MS = parseInt(process.env.REDIS_CONNECT_TIMEOUT_MS, 10) || 10000;

const activeSitemapAbortControllers = new Map();

if (explicitRedisConfig && redisConfig && redisConfig.redis) {
  try {
    sitemapQueue = new Bull('sitemap-generation', redisConfig);
    queueReadyPromise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`[Queue] Redis queue did not become ready within ${QUEUE_CONNECT_TIMEOUT_MS}ms`));
      }, QUEUE_CONNECT_TIMEOUT_MS);

      sitemapQueue.once('ready', () => {
        clearTimeout(timeoutId);
        console.log('[Queue] Redis queue is ready');
        resolve();
      });

      // Handle connection errors before the ready event
      sitemapQueue.once('error', (err) => {
        clearTimeout(timeoutId);
        reject(err);
      });
    }).catch((err) => {
      // Attach a catch handler immediately to prevent unhandled rejection warnings.
      console.error('[Queue] Queue ready promise failed:', err && err.message ? err.message : err);
      // Return the error but don't throw - let the server start
      return Promise.resolve(false);
    });
  } catch (err) {
    console.error('[Queue] Failed to create Bull queue:', err && err.message ? err.message : err);
    sitemapQueue = null;
  }
} else {
  if (!explicitRedisConfig) {
    console.error(REDIS_REQUIRED_MESSAGE);
  }
}
const REDIS_ERROR_LOG_THROTTLE_MS = 10000;

if (sitemapQueue) {
  [sitemapQueue.client, sitemapQueue.bclient, sitemapQueue.eclient].forEach((client) => {
    if (client && typeof client.setMaxListeners === 'function') {
      client.setMaxListeners(20);
    }
  });

  sitemapQueue.on('error', (err) => {
    redisConnected = false;
    const message = err && err.message ? err.message : String(err);
    const now = Date.now();
    if (message !== lastRedisErrorMessage || now - lastRedisErrorTime > REDIS_ERROR_LOG_THROTTLE_MS) {
      console.error('[Queue] Redis/Bull connection error:', err && err.stack ? err.stack : err);
      lastRedisErrorMessage = message;
      lastRedisErrorTime = now;
    }
  });

  sitemapQueue.on('ready', () => {
    if (!redisConnected) {
      console.log('[Queue] Redis/Bull connection restored');
    }
    redisConnected = true;
    lastRedisErrorMessage = null;
    lastRedisErrorTime = 0;
  });
}

async function initSaasSitemapQueue() {
  if (!explicitRedisConfig) {
    const msg = REDIS_REQUIRED_MESSAGE;
    if (require.main === module) {
      console.warn(msg);
      console.warn('[Queue] Server will start but sitemap queue will return error responses');
      return; // Don't crash the server, just log a warning
    }
    console.error(msg);
    return;
  }

  if (!queueReadyPromise) {
    throw new Error('[Queue] No Redis queue configured to initialize');
  }

  try {
    await queueReadyPromise;
    console.log('[Queue] Sitemap queue initialized successfully');
  } catch (err) {
    console.error('[Queue] Failed to initialize sitemap queue:', err && err.message ? err.message : err);
    console.error('[Queue] Server will start but sitemap generation will fail until Redis is available');
    // Don't crash the server - sitemap endpoints will return 503 errors when Redis is unavailable
  }
}

// Helper to make a Promise settle quickly so the API remains responsive even
// if Redis is down or unresponsive.
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
  ]);
}

// ---------------------------------------------------------------------------
// Note: rate limiting removed for sitemap generation
// ---------------------------------------------------------------------------

// ============================================================================
// QUEUE WORKER
// ============================================================================

/**
 * processSitemapJob
 * Helper to run the same job logic used by the Bull worker. This allows the
 * API used by the Bull worker for job processing.
 */
async function processSitemapJob(jobData, jobId, progressCb) {
  const normalizedJobId = String(jobId);
  const abortController = new AbortController();
  activeSitemapAbortControllers.set(normalizedJobId, abortController);

  try {
    // Ensure numeric, safe depth bounds to avoid runaway crawls when called
    // directly or via user input.
    const MAX_DEPTH = parseInt(process.env.SITEMAP_MAX_DEPTH, 10) || 20;
    const MAX_URLS = parseInt(process.env.SITEMAP_MAX_URLS, 10) || 50000;

    let { url, maxDepth = undefined, maxUrls = MAX_URLS, sitemapType = 'standard', concurrency } = jobData;
    let depthVal = typeof maxDepth === 'number' && !isNaN(maxDepth) ? maxDepth : (typeof maxDepth === 'string' && /^\d+$/.test(maxDepth) ? parseInt(maxDepth, 10) : undefined);
    if (typeof depthVal === 'undefined' || !isFinite(depthVal)) depthVal = 3; // default to 3 levels
    // clamp to reasonable safety bounds
    depthVal = Math.max(0, Math.min(depthVal, MAX_DEPTH));

    maxUrls = Math.min(maxUrls || MAX_URLS, MAX_URLS);

    if (typeof progressCb === 'function') progressCb({ percent: 5, urlCount: 0 });
    console.log(`[Worker] Processing job ${jobId} for ${url} (maxDepth=${maxDepth})`);

    const requestDelayMs = parseInt(process.env.SITEMAP_REQUEST_DELAY_MS, 10);
    const crawler = new Crawler(url, {
      maxDepth: depthVal,
      maxUrls,
      concurrency: typeof concurrency === 'number' ? concurrency : undefined,
      requestDelay: Number.isFinite(requestDelayMs) ? requestDelayMs : 0,
      filterOptions: Object.assign({ includePagination: true, includeSearch: true }, jobData.filterOptions || {}),
      // Allow caller to override robots.txt respect (boolean). By default DISABLE robots checking
      // to allow more forgiving crawling. Set `respectRobots: true` to enable robots.txt respect.
      respectRobots: typeof jobData.respectRobots === 'boolean' ? jobData.respectRobots : false,
      collectImages: !!jobData.collectImages,
      collectVideos: !!jobData.collectVideos,
      verbose: true,
      jsRendering: !!jobData.jsRendering,
      jsRenderTimeout: typeof jobData.jsRenderTimeout === 'number' ? jobData.jsRenderTimeout : 10000,
      signal: abortController.signal
    });

    const crawlProgressCb = (value) => {
      if (typeof progressCb !== 'function') return;
      const payload = typeof value === 'number'
        ? { percent: value, urlCount: crawler.discovered.length }
        : value;
      progressCb(payload);
    };

    const pages = await crawler.crawl(crawlProgressCb);
    console.log(`[Worker] Crawled ${pages.length} URLs`);

    const outputDir = require('path').join(__dirname, '../../tmp/sitemaps', String(jobId));
    const { files: xmlFiles, index: indexXml, outputDir: savedDir, filePaths, indexPath } = sitemapGenerator.generate(pages, { outputDir, baseUrl: url, advancedMode: !!jobData.advancedMode });

    let sitemap = xmlFiles.join('\n');
    if (indexXml) sitemap = indexXml + '\n<!-- individual files generated separately -->';

    const xmlSize = Buffer.byteLength(sitemap, 'utf8');
    if (typeof progressCb === 'function') progressCb(100);

    const stats = {
      total: pages.length,
      byDepth: pages.reduce((acc, p) => { acc[p.depth] = (acc[p.depth]||0)+1; return acc; }, {}),
    };

    console.log(`[Worker] Completed job ${jobId}:`, stats);

    const result = {
      url,
      sitemapType,
      sitemap,
      xmlSize,
      urlCount: pages.length,
      stats,
      generatedAt: new Date().toISOString(),
      pages: pages.slice(0, 100)
    };
    if (savedDir) result.outputDir = savedDir;
    if (filePaths) result.filePaths = filePaths;
    if (indexPath) result.indexPath = indexPath;
    return result;
  } catch (error) {
    const isCancelled = error && (
      error.name === 'AbortError' ||
      error.message === 'Job cancelled by user' ||
      error.message === 'Crawl aborted'
    )

    if (isCancelled) {
      console.warn(`[Worker] Job ${jobId} cancelled by user`);
      throw new Error('Job cancelled by user');
    }

    console.error(`[Worker] Job ${jobId} failed:`, error && error.stack ? error.stack : error);
    throw error;
  } finally {
    activeSitemapAbortControllers.delete(String(jobId));
  }
}

if (sitemapQueue) {
  // Use the worker function for Bull jobs as well
  sitemapQueue.process(async (job) => {
    const jobId = job?.id || job?.jobId || 'unknown';
    return processSitemapJob(job.data, jobId, (p) => {
      // Update job with progress data for frontend polling (non-blocking)
      if (job && typeof job.update === 'function') {
        const progressData = typeof p === 'object' && p !== null
          ? p
          : { percent: Number(p || 0), urlCount: 0 };
        
        job.update({
          ...job.data,
          _jobProgress: progressData
        }).catch(err => {
          console.error('[Worker] Failed to update job progress:', err.message);
        });
      }
      
      // Also try job.progress() as fallback
      if (job && typeof job.progress === 'function') {
        try {
          const percent = typeof p === 'object' ? (p.percent || 0) : Number(p || 0);
          job.progress(percent);
        } catch (err) {
          console.error('[Worker] Failed to set job progress:', err.message);
        }
      }
    });
  });

  // Handle job completion
  sitemapQueue.on('completed', (job) => {
    const completedJobId = job?.id || job?.jobId || 'unknown';
    console.log(`[Queue] Job ${completedJobId} completed successfully`);
  });

  // Handle job failure
  sitemapQueue.on('failed', (job, error) => {
    console.error(`[Queue] Job ${job.id} failed:`, error.message);
  });
} else {
  console.error('[Queue] No Redis queue configured. SaaS sitemap queue is disabled.');
}

// ============================================================================
// EXPRESS ROUTES
// ============================================================================

/**
 * GET /api/saas/health
 * Lightweight healthcheck for the sitemap service. Checks Redis connectivity
 * and reports service readiness.
 */
router.get('/health', async (req, res) => {
  if (!sitemapQueue) {
    return res.json({
      success: true,
      redis: { configured: false, reachable: false, error: 'Redis not configured' },
      ready: false
    });
  }

  const redisHost = redisConfig.redis.host || 'localhost';
  const redisPort = parseInt(redisConfig.redis.port, 10) || 6379;
  const timeout = 1500; // ms

  const socket = new net.Socket();
  let called = false;

  const onError = (err) => {
    if (called) return; called = true;
    socket.destroy();
    return res.json({ success: true, redis: { reachable: false, error: String(err) }, ready: false });
  };

  socket.setTimeout(timeout, () => onError(new Error('timeout')));
  socket.once('error', onError);
  socket.connect(redisPort, redisHost, () => {
    if (called) return;
    called = true;
    socket.end();
    return res.json({ success: true, redis: { reachable: true, host: redisHost, port: redisPort }, ready: true });
  });
});

/**
 * POST /api/saas/sitemap/generate
 * Submit website URL for sitemap generation
 */
router.post('/generate', async (req, res) => {
  try {
    const { url, maxDepth, maxUrls, sitemapType, filterOptions, concurrency, advancedMode } = req.body;

    // Coerce and clamp maxDepth coming from the client (may be string)
    let depthInput = typeof maxDepth === 'number' && !isNaN(maxDepth) ? maxDepth : (typeof maxDepth === 'string' && /^\d+$/.test(maxDepth) ? parseInt(maxDepth, 10) : undefined);
    // Default to 3 levels if client omitted value; clamp to [0, 10]
    const clientMaxDepth = typeof depthInput === 'number' ? Math.max(0, Math.min(depthInput, 10)) : 3;

    // Validation
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return res.status(400).json({
        success: false,
        error: 'Invalid URL format'
      });
    }

    // Validate sitemap type
    const validTypes = ['standard', 'news', 'image', 'video'];
    if (sitemapType && !validTypes.includes(sitemapType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid sitemap type. Must be one of: ${validTypes.join(', ')}`
      });
    }

    // normalize concurrency if provided
    let concurrencyVal;
    if (typeof concurrency !== 'undefined') {
      const cnum = parseInt(concurrency, 10);
      if (isNaN(cnum) || cnum < 1) {
        return res.status(400).json({ success: false, error: 'Concurrency must be a positive integer' });
      }
      // clamp to reasonable upper bound (50)
      concurrencyVal = Math.min(cnum, 50);
    }

    // Submit job to Bull. If Bull/Redis is unavailable, reject the request with 503.
    const jobPayload = {
      url,
      // allow unlimited depth if user omitted value; clamp only to a generous upper bound if provided
      maxDepth: clientMaxDepth,
      maxUrls: Math.min(maxUrls || 50000, 500000),
      sitemapType: sitemapType || 'standard',
      filterOptions: filterOptions || {},
      concurrency: concurrencyVal,
      advancedMode: !!advancedMode,
      jsRendering: !!req.body.jsRendering,
      jsRenderTimeout: typeof req.body.jsRenderTimeout === 'number' ? req.body.jsRenderTimeout : undefined,
      clientId: req.ip,
      submittedAt: new Date().toISOString()
    };

    if (!sitemapQueue) {
      return res.status(503).json({
        success: false,
        error: 'Redis queue not configured. Please set REDIS_URL or REDIS_HOST/REDIS_PORT and restart the service.'
      });
    }

    let job;
    try {
      job = await withTimeout(
        sitemapQueue.add(
          jobPayload,
          {
            attempts: 2,
            backoff: {
              type: 'exponential',
              delay: 2000
            },
            timeout: parseInt(process.env.SITEMAP_JOB_TIMEOUT_MS, 10) || 600000,
            removeOnComplete: false
          }
        ),
        5000
      );

      const submittedJobId = job?.id || job?.jobId || String(job);
      console.log(`[API] New job submitted: ${submittedJobId} for ${url}`);

      return res.json({
        success: true,
        jobId: submittedJobId,
        status: 'queued',
        statusUrl: `/api/saas/sitemap/status/${submittedJobId}`,
        downloadUrl: `/api/saas/sitemap/download/${submittedJobId}`,
        message: 'Sitemap generation queued. Check status URL for progress.'
      });
    } catch (queueErr) {
      console.error('[API] Queue add failed:', queueErr && queueErr.message ? queueErr.message : queueErr);
      return res.status(503).json({
        success: false,
        error: 'Failed to queue sitemap generation job. Redis is unavailable or the queue rejected the request.'
      });
    }
  } catch (error) {
    console.error('[API] Generate endpoint error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to submit sitemap generation job',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/saas/sitemap/cancel/:jobId
 * Cancel a sitemap generation job if it is still queued or running
 */
router.post('/cancel/:jobId', async (req, res) => {
  try {
    if (!sitemapQueue) {
      return res.status(503).json({
        success: false,
        error: 'Redis queue not configured. Please set REDIS_URL or REDIS_HOST and REDIS_PORT.'
      });
    }

    let job;
    try {
      job = await sitemapQueue.getJob(req.params.jobId);
    } catch (err) {
      console.error('[API] Cancel endpoint Redis error:', err && err.message ? err.message : err);
      return res.status(503).json({
        success: false,
        error: 'Redis unavailable, cannot cancel job. Please try again later.'
      });
    }

    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    const state = await job.getState();
    const activeController = activeSitemapAbortControllers.get(String(req.params.jobId));

    if (activeController) {
      activeController.abort(new Error('Job cancelled by user'));
    }

    if (['waiting', 'delayed', 'paused'].includes(state)) {
      try {
        await job.remove();
        return res.json({ success: true, cancelled: true, state: 'removed' });
      } catch (removeErr) {
        console.warn('[API] Failed to remove queued job, falling back to abort:', removeErr && removeErr.message ? removeErr.message : removeErr);
      }
    }

    return res.json({ success: true, cancelled: true, state });
  } catch (error) {
    console.error('[API] Cancel endpoint error:', error);
    return res.status(500).json({ success: false, error: 'Failed to cancel sitemap job' });
  }
});

/**
 * GET /api/saas/sitemap/status/:jobId
 * Get job status and progress
 */
router.get('/status/:jobId', async (req, res) => {
  try {
    if (!sitemapQueue) {
      return res.status(503).json({
        success: false,
        error: 'Redis queue not configured. Please set REDIS_URL or REDIS_HOST and REDIS_PORT.'
      });
    }

    let job;
    try {
      job = await sitemapQueue.getJob(req.params.jobId);
    } catch (err) {
      console.error('[API] Status endpoint Redis error:', err && err.message ? err.message : err);
      return res.status(503).json({
        success: false,
        error: 'Redis unavailable, cannot query job status. Please try again later.'
      });
    }

    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }

    try {
      const state = await job.getState();
      const rawProgress = job._progress || 0;
      let progress = 0;
      let urlCount = 0;

      // Check if progress data was updated via job.update()
      if (job.data && job.data._jobProgress) {
        const jobProgress = job.data._jobProgress;
        progress = Number(jobProgress.percent || 0);
        urlCount = Number(jobProgress.urlCount || 0);
      } else if (typeof rawProgress === 'string') {
        try {
          const parsed = JSON.parse(rawProgress);
          progress = Number(parsed.percent || 0);
          urlCount = Number(parsed.urlCount || 0);
        } catch {
          progress = Number(rawProgress || 0);
        }
      } else if (typeof rawProgress === 'object' && rawProgress !== null) {
        progress = Number(rawProgress.percent || 0);
        urlCount = Number(rawProgress.urlCount || 0);
      } else {
        progress = Number(rawProgress || 0);
      }

      const failureReason = job.failedReason || null;
      const result = job.returnvalue || {};
      const returnedJobId = job.id || job.jobId || null;

      console.log(`[Status] Job ${returnedJobId}: ${state}, progress=${progress}%, urls=${urlCount}`);

      return res.json({
        success: true,
        jobId: returnedJobId,
        status: state,
        progress,
        urlCount: result.urlCount !== undefined ? result.urlCount : urlCount,
        sitemap: state === 'completed' ? result.sitemap : undefined,
        createdAt: new Date(job.timestamp).toISOString(),
        data: job.data,
        failureReason,
        estimatedTimeRemaining: estimateTime(progress)
      });
    } catch (err) {
      console.error('[API] Status endpoint Redis error:', err && err.message ? err.message : err);
      return res.status(503).json({
        success: false,
        error: 'Redis unavailable, cannot retrieve job state. Please try again later.'
      });
    }
  } catch (error) {
    console.error('[API] Status endpoint error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get job status'
    });
  }
});

/**
 * GET /api/saas/sitemap/download/:jobId
 * Download generated sitemap XML
 */
router.get('/download/:jobId', async (req, res) => {
  try {
if (!sitemapQueue) {
    return res.status(503).json({
      success: false,
      error: 'Redis queue not configured. Please set REDIS_URL or REDIS_HOST and REDIS_PORT.'
      });
    }

    let job;
    try {
      job = await sitemapQueue.getJob(req.params.jobId);
    } catch (err) {
      console.error('[API] Download endpoint Redis error:', err && err.message ? err.message : err);
      return res.status(503).json({
        success: false,
        error: 'Redis unavailable, cannot retrieve sitemap. Please try again later.'
      });
    }

    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    const state = await job.getState();

    if (state !== 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Job not completed yet',
        status: state,
        progress: job._progress || 0
      });
    }

    const result = job.returnvalue;
    const { sitemap, url, sitemapType, outputDir, filePaths, indexPath } = result;

    // Set content type
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');

    // If client requests inline display (e.g. ?inline=true) don't force download
    const inline = req.query.inline === 'true';
    if (!inline) {
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="sitemap-${sitemapType}-${Date.now()}.xml"`
      );
    }

    // if we have persisted files, serve index or first file
    if (indexPath) {
      return res.sendFile(indexPath);
    }
    if (filePaths && filePaths.length) {
      return res.sendFile(filePaths[0]);
    }

    // fallback to inline string
    res.send(sitemap);

    console.log(`[API] Downloaded job ${job.id}`);
  } catch (error) {
    console.error('[API] Download endpoint error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to download sitemap'
    });
  }
});

/**
 * GET /api/saas/sitemap/preview/:jobId
 * Get preview of first 100 URLs
 */
router.get('/preview/:jobId', async (req, res) => {
  try {
if (!sitemapQueue) {
    return res.status(503).json({
      success: false,
      error: 'Redis queue not configured. Please set REDIS_URL or REDIS_HOST and REDIS_PORT.'
      });
    }

    let job;
    try {
      job = await sitemapQueue.getJob(req.params.jobId);
    } catch (err) {
      console.error('[API] Preview endpoint Redis error:', err && err.message ? err.message : err);
      return res.status(503).json({
        success: false,
        error: 'Redis unavailable, cannot retrieve preview. Please try again later.'
      });
    }

    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    const state = await job.getState();

    if (state !== 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Job not completed yet',
        status: state
      });
    }

    const result = job.returnvalue;
    const { pages, stats, url, sitemapType } = result;

    res.json({
      success: true,
      url,
      sitemapType,
      stats,
      previewUrls: pages,
      totalUrls: result.urlCount,
      message: `Showing first ${pages.length} of ${result.urlCount} URLs`
    });
  } catch (error) {
    console.error('[API] Preview endpoint error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get preview'
    });
  }
});

/**
 * GET /api/saas/sitemap/stats/:jobId
 * Get detailed statistics
 */
router.get('/stats/:jobId', async (req, res) => {
  try {
    if (!sitemapQueue) {
      return res.status(503).json({
        success: false,
        error: 'Redis queue not configured. Please set REDIS_URL or REDIS_HOST and REDIS_PORT.'
      });
    }
    let job;
    try {
      job = await sitemapQueue.getJob(req.params.jobId);
    } catch (err) {
      console.error('[API] Stats endpoint Redis error:', err && err.message ? err.message : err);
      return res.status(503).json({
        success: false,
        error: 'Redis unavailable, cannot query job stats. Please try again later.'
      });
    }

    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    const state = await job.getState();

    if (state !== 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Job not completed yet'
      });
    }

    const result = job.returnvalue;
    const { stats, xmlSize, generatedAt } = result;

    res.json({
      success: true,
      stats: {
        ...stats,
        xmlSize,
        xmlSizeMB: (xmlSize / (1024 * 1024)).toFixed(2),
        generatedAt
      }
    });
  } catch (error) {
    console.error('[API] Stats endpoint error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get stats'
    });
  }
});

/**
 * Helper: Estimate time remaining
 */
function estimateTime(progress) {
  if (progress === 0) return 'Initializing...';
  if (progress >= 100) return 'Complete';
  
  const estimatedTotal = 300000; // 5 minutes
  const timePerPercent = estimatedTotal / 100;
  const remaining = (100 - progress) * timePerPercent;
  
  if (remaining < 60000) {
    return `~${Math.ceil(remaining / 1000)} seconds`;
  }
  return `~${Math.ceil(remaining / 60000)} minutes`;
}

module.exports = router;
module.exports.init = initSaasSitemapQueue;
