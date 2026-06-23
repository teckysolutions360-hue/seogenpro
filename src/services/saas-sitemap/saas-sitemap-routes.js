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

const redisUrlOptions = parseRedisUrl(process.env.REDIS_URL || process.env.REDIS_URI || process.env.REDIS_CONNECTION_STRING);
const redisConfig = {
  redis: Object.assign(
    {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT, 10) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      db: process.env.REDIS_DB ? parseInt(process.env.REDIS_DB, 10) : undefined
    },
    redisUrlOptions || {}
  )
};

redisConfig.redis.maxRetriesPerRequest = null; // disable node-redis per-request retry cap for Bull

const sitemapQueue = new Bull('sitemap-generation', redisConfig);

let redisConnected = true;
let lastRedisErrorMessage = null;
let lastRedisErrorTime = 0;
const REDIS_ERROR_LOG_THROTTLE_MS = 10000;

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

// Helper to make a Promise settle quickly so the API remains responsive even
// if Redis is down or unresponsive.
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
  ]);
}

// In-memory store for synchronous (fallback) job results so frontend can
// query status/download for local jobs when Redis/Bull is unavailable.
const localJobResults = new Map();

function startLocalFallbackJob(jobData) {
  const localJobId = `local-${Date.now()}`;
  localJobResults.set(localJobId, {
    status: 'queued',
    progress: 0,
    createdAt: Date.now(),
    url: jobData.url,
    sitemapType: jobData.sitemapType || 'standard'
  });

  setTimeout(() => localJobResults.delete(localJobId), 1000 * 60 * 60);

  processSitemapJob(jobData, localJobId, (p) => {
    const current = localJobResults.get(localJobId) || {};
    localJobResults.set(localJobId, {
      ...current,
      status: p >= 100 ? 'completed' : 'processing',
      progress: p
    });
  })
    .then((result) => {
      const current = localJobResults.get(localJobId) || {};
      localJobResults.set(localJobId, {
        ...current,
        status: 'completed',
        progress: 100,
        result
      });
    })
    .catch((procErr) => {
      console.error('[API] Background processing failed:', procErr && procErr.stack ? procErr.stack : procErr);
      const current = localJobResults.get(localJobId) || {};
      localJobResults.set(localJobId, {
        ...current,
        status: 'failed',
        progress: 100,
        error: procErr && procErr.message ? procErr.message : String(procErr)
      });
    });

  return {
    success: true,
    jobId: localJobId,
    status: 'queued',
    statusUrl: `/api/saas/sitemap/status/${localJobId}`,
    downloadUrl: `/api/saas/sitemap/download/${localJobId}`,
    message: 'Sitemap generation started in background (Redis/Bull unavailable). Check status endpoint.'
  };
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
 * API to fall back to synchronous processing when Redis/Bull is unavailable.
 */
async function processSitemapJob(jobData, jobId, progressCb) {
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

    if (typeof progressCb === 'function') progressCb(5);
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
      jsRenderTimeout: typeof jobData.jsRenderTimeout === 'number' ? jobData.jsRenderTimeout : 10000
    });

    const pages = await crawler.crawl(progressCb);
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
    console.error(`[Worker] Job ${jobId} failed:`, error && error.stack ? error.stack : error);
    throw error;
  }
}

// Use the worker function for Bull jobs as well
sitemapQueue.process(async (job) => {
  return processSitemapJob(job.data, job.id, (p) => { if (job && typeof job.progress === 'function') job.progress(p); });
});

// Handle job completion
sitemapQueue.on('completed', (job) => {
  console.log(`[Queue] Job ${job.id} completed successfully`);
});

// Handle job failure
sitemapQueue.on('failed', (job, error) => {
  console.error(`[Queue] Job ${job.id} failed:`, error.message);
});

// ============================================================================
// EXPRESS ROUTES
// ============================================================================

/**
 * GET /api/saas/health
 * Lightweight healthcheck for the sitemap service. Checks Redis connectivity
 * and reports service readiness.
 */
router.get('/health', async (req, res) => {
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

    // Submit job to Bull. If Bull/Redis is unavailable, fall back to processing synchronously
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

    if (!redisConnected) {
      console.warn('[API] Redis unavailable - falling back to local background job');
      return res.json(startLocalFallbackJob(jobPayload));
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
            timeout: parseInt(process.env.SITEMAP_JOB_TIMEOUT_MS, 10) || 600000, // allow override via env
            removeOnComplete: false // Keep job history
          }
        ),
        5000 // max time to wait for Redis/queue before falling back
      );

      console.log(`[API] New job submitted: ${job.id} for ${url}`);

      return res.json({
        success: true,
        jobId: job.id,
        status: 'queued',
        statusUrl: `/api/saas/sitemap/status/${job.id}`,
        downloadUrl: `/api/saas/sitemap/download/${job.id}`,
        message: 'Sitemap generation queued. Check status URL for progress.'
      });
    } catch (queueErr) {
      // Likely Redis/Bull connectivity issue or timeout - fall back to background processing.
      // We avoid blocking the HTTP request by running the crawl/sitemap job in the
      // background and returning a jobId immediately.
      console.error('[API] Queue add failed (Redis/timeout), running background job instead:', queueErr && queueErr.message ? queueErr.message : queueErr);
      const localJobId = `local-${Date.now()}`;

      // Initialize a local job record so status endpoint can report it
      localJobResults.set(localJobId, {
        status: 'queued',
        progress: 0,
        createdAt: Date.now(),
        url,
        sitemapType: sitemapType || 'standard'
      });

      // Ensure cleanup after 1 hour
      setTimeout(() => localJobResults.delete(localJobId), 1000 * 60 * 60);

      // Start processing in the background (don't await)
      processSitemapJob(
        {
          url,
          maxDepth: clientMaxDepth,
          maxUrls: Math.min(maxUrls || 50000, 500000),
          sitemapType: sitemapType || 'standard',
          filterOptions: filterOptions || {},
          concurrency: concurrencyVal,
          advancedMode: !!advancedMode,
          clientId: req.ip,
          submittedAt: new Date().toISOString()
        },
        localJobId,
        (p) => {
          const current = localJobResults.get(localJobId) || {};
          localJobResults.set(localJobId, {
            ...current,
            status: p >= 100 ? 'completed' : 'processing',
            progress: p
          });
        }
      )
        .then((result) => {
          const current = localJobResults.get(localJobId) || {};
          localJobResults.set(localJobId, {
            ...current,
            status: 'completed',
            progress: 100,
            result
          });
        })
        .catch((procErr) => {
          console.error('[API] Background processing failed:', procErr && procErr.stack ? procErr.stack : procErr);
          const current = localJobResults.get(localJobId) || {};
          localJobResults.set(localJobId, {
            ...current,
            status: 'failed',
            progress: 100,
            error: procErr && procErr.message ? procErr.message : String(procErr)
          });
        });

      return res.json({
        success: true,
        jobId: localJobId,
        status: 'queued',
        statusUrl: `/api/saas/sitemap/status/${localJobId}`,
        downloadUrl: `/api/saas/sitemap/download/${localJobId}`,
        message: 'Sitemap generation started in background (Redis/Bull unavailable). Check status endpoint.'
      });
    }
  } catch (error) {
    console.error('[API] Generate endpoint error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit sitemap generation job',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/saas/sitemap/status/:jobId
 * Get job status and progress
 */
router.get('/status/:jobId', async (req, res) => {
  try {
    // If this is a local synchronous fallback job, return it immediately (no Redis needed)
    const local = localJobResults.get(req.params.jobId);
    if (local) {
      return res.json({
        success: true,
        jobId: req.params.jobId,
        status: local.status,
        progress: typeof local.progress === 'number' ? local.progress : 100,
        createdAt: new Date(local.createdAt).toISOString(),
        // top-level convenience fields expected by the frontend
        urlCount: local.result && local.result.urlCount ? local.result.urlCount : 0,
        sitemapXml: local.result && local.result.sitemap ? local.result.sitemap : '',
        stats: local.result && local.result.stats ? local.result.stats : {},
        data: local.result,
        failureReason: local.error || null,
        estimatedTimeRemaining: estimateTime(typeof local.progress === 'number' ? local.progress : 100)
      });
    }

    let job
    try {
      job = await sitemapQueue.getJob(req.params.jobId)
    } catch (err) {
      console.error('[API] Status endpoint Redis error:', err && err.message ? err.message : err)
      // If redis is unavailable, attempt to fall back to local record / disk record
      const localRetry = localJobResults.get(req.params.jobId)
      if (localRetry) {
        return res.json({
          success: true,
          jobId: req.params.jobId,
          status: localRetry.status,
          progress: typeof localRetry.progress === 'number' ? localRetry.progress : 100,
          createdAt: new Date(localRetry.createdAt).toISOString(),
          urlCount: localRetry.result && localRetry.result.urlCount ? localRetry.result.urlCount : 0,
          sitemapXml: localRetry.result && localRetry.result.sitemap ? localRetry.result.sitemap : '',
          stats: localRetry.result && localRetry.result.stats ? localRetry.result.stats : {},
          data: localRetry.result,
          failureReason: localRetry.error || null,
          estimatedTimeRemaining: estimateTime(typeof localRetry.progress === 'number' ? localRetry.progress : 100)
        });
      }

      // Try disk fallback if we can locate output
      try {
        const sitemapDir = path.join(__dirname, '../../tmp/sitemaps', String(req.params.jobId));
        if (fs.existsSync(sitemapDir)) {
          const indexPath = path.join(sitemapDir, 'sitemap-index.xml');
          let sitemapXml = '';

          if (fs.existsSync(indexPath)) {
            sitemapXml = fs.readFileSync(indexPath, 'utf8');
          } else {
            const files = fs.readdirSync(sitemapDir).filter((f) => f.endsWith('.xml'));
            if (files.length) {
              sitemapXml = fs.readFileSync(path.join(sitemapDir, files[0]), 'utf8');
            }
          }

          return res.json({
            success: true,
            jobId: req.params.jobId,
            status: 'completed',
            progress: 100,
            createdAt: new Date().toISOString(),
            urlCount: 0,
            sitemapXml,
            data: {},
            estimatedTimeRemaining: 'Complete'
          });
        }
      } catch (diskErr) {
        console.warn('[API] Status fallback disk check failed:', diskErr.message || diskErr);
      }

      return res.status(503).json({
        success: false,
        error: 'Redis unavailable, cannot query job status. Please try again later.'
      });
    }

    if (!job) {

      // If the job record is missing (e.g. cleaned from Redis/Bull), attempt to
      // locate the generated sitemap on disk so the frontend can still retrieve it.
      try {
        const sitemapDir = path.join(__dirname, '../../tmp/sitemaps', String(req.params.jobId));
        if (fs.existsSync(sitemapDir)) {
          const indexPath = path.join(sitemapDir, 'sitemap-index.xml');
          let sitemapXml = '';

          if (fs.existsSync(indexPath)) {
            sitemapXml = fs.readFileSync(indexPath, 'utf8');
          } else {
            const files = fs.readdirSync(sitemapDir).filter((f) => f.endsWith('.xml'));
            if (files.length) {
              sitemapXml = fs.readFileSync(path.join(sitemapDir, files[0]), 'utf8');
            }
          }

          return res.json({
            success: true,
            jobId: req.params.jobId,
            status: 'completed',
            progress: 100,
            createdAt: new Date().toISOString(),
            urlCount: 0,
            sitemapXml,
            data: {},
            estimatedTimeRemaining: 'Complete'
          });
        }
      } catch (diskErr) {
        console.warn('[API] Status fallback disk check failed:', diskErr.message || diskErr);
      }

      // If we cannot find a job record, return a "still processing" result
      // rather than a 404, so the frontend continues polling until completion.
      return res.json({
        success: true,
        jobId: req.params.jobId,
        status: 'processing',
        progress: 0,
        createdAt: new Date().toISOString(),
        data: {},
        estimatedTimeRemaining: 'Unknown - still processing'
      });
    }

    try {
      const state = await job.getState();
      const progress = job._progress || 0;
      const failureReason = job.failedReason || null;

      res.json({
        success: true,
        jobId: job.id,
        status: state,
        progress,
        createdAt: new Date(job.timestamp).toISOString(),
        data: job.data,
        failureReason,
        estimatedTimeRemaining: estimateTime(progress)
      });
    } catch (err) {
      console.error('[API] Status endpoint Redis error:', err && err.message ? err.message : err);

      // Attempt fallback based on local cache / disk output
      const localRetry = localJobResults.get(req.params.jobId);
      if (localRetry) {
        return res.json({
          success: true,
          jobId: req.params.jobId,
          status: localRetry.status,
          progress: typeof localRetry.progress === 'number' ? localRetry.progress : 100,
          createdAt: new Date(localRetry.createdAt).toISOString(),
          urlCount: localRetry.result && localRetry.result.urlCount ? localRetry.result.urlCount : 0,
          sitemapXml: localRetry.result && localRetry.result.sitemap ? localRetry.result.sitemap : '',
          stats: localRetry.result && localRetry.result.stats ? localRetry.result.stats : {},
          data: localRetry.result,
          failureReason: localRetry.error || null,
          estimatedTimeRemaining: estimateTime(typeof localRetry.progress === 'number' ? localRetry.progress : 100)
        });
      }

      try {
        const sitemapDir = path.join(__dirname, '../../tmp/sitemaps', String(req.params.jobId));
        if (fs.existsSync(sitemapDir)) {
          const indexPath = path.join(sitemapDir, 'sitemap-index.xml');
          let sitemapXml = '';

          if (fs.existsSync(indexPath)) {
            sitemapXml = fs.readFileSync(indexPath, 'utf8');
          } else {
            const files = fs.readdirSync(sitemapDir).filter((f) => f.endsWith('.xml'));
            if (files.length) {
              sitemapXml = fs.readFileSync(path.join(sitemapDir, files[0]), 'utf8');
            }
          }

          return res.json({
            success: true,
            jobId: req.params.jobId,
            status: 'completed',
            progress: 100,
            createdAt: new Date().toISOString(),
            urlCount: 0,
            sitemapXml,
            data: {},
            estimatedTimeRemaining: 'Complete'
          });
        }
      } catch (diskErr) {
        console.warn('[API] Status fallback disk check failed:', diskErr.message || diskErr);
      }

      return res.status(503).json({
        success: false,
        error: 'Redis unavailable, cannot retrieve job state. Please try again later.'
      });
    }
  } catch (error) {
    console.error('[API] Status endpoint error:', error);
    res.status(500).json({
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
    // Prefer local fallback jobs (no Redis required)
    const local = localJobResults.get(req.params.jobId);
    if (local) {
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      const result = local.result;
      const inline = req.query.inline === 'true';
      if (!inline) {
        res.setHeader('Content-Disposition', `attachment; filename="sitemap-${result.sitemapType || 'standard'}-${Date.now()}.xml"`);
      }
      if (result.indexPath) return res.sendFile(result.indexPath);
      if (result.filePaths && result.filePaths.length) return res.sendFile(result.filePaths[0]);
      return res.send(result.sitemap || '');
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
    res.status(500).json({
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
    const local = localJobResults.get(req.params.jobId);
    if (local) {
      const result = local.result;
      return res.json({
        success: true,
        url: result.url,
        sitemapType: result.sitemapType,
        stats: result.stats,
        previewUrls: result.pages,
        totalUrls: result.urlCount,
        message: `Showing first ${result.pages.length} of ${result.urlCount} URLs`
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
    res.status(500).json({
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
    const job = await sitemapQueue.getJob(req.params.jobId);

    if (!job) {
      const local = localJobResults.get(req.params.jobId);
      if (local) {
        const result = local.result;
        const { stats, xmlSize, generatedAt } = result;
        return res.json({
          success: true,
          stats: {
            ...stats,
            xmlSize,
            xmlSizeMB: (xmlSize / (1024 * 1024)).toFixed(2),
            generatedAt
          }
        });
      }

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
    res.status(500).json({
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
