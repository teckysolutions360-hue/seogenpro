/**
 * Enhanced Sitemap Controller
 * 
 * Production-grade sitemap generation with:
 * - Real lastmod dates (DB, HTTP, Meta, FileSystem)
 * - Intelligent dynamic priorities (22 URL types)
 * - Canonical validation
 * - Image extraction
 * - Quality scoring (0-100)
 * - Coverage analysis
 * - Structured JSON audit output
 */

const crawlerService = require('../services/crawlerService');
const sitemapAdapter = require('../services/sitemapEnhancementsAdapter');
const { validateUrl } = require('../utils/validators');
const { v4: uuidv4 } = require('uuid');

const DEBUG_SITEMAP = process.env.DEBUG_SITEMAP === 'true';

// In-memory store for job status
const jobStore = new Map();
const MAX_PAGES = parseInt(process.env.MAX_PAGES_PER_SITEMAP) || 50000;

/**
 * Generate production-grade sitemap
 */
exports.generateEnhancedSitemap = async (req, res) => {
  try {
    const {
      url,
      maxPages = MAX_PAGES,
      maxDepth = Infinity,
      excludePatterns = [],
      respectRobotsTxt = true,
      
      // Enhancement options
      validateLastmod = true,          // Get real lastmod dates
      useIntelligentPriority = true,   // 22-type classification
      validateCanonical = false,       // Check canonical tags
      extractImages = false,           // Get featured images
      validateCoverage = false,        // Compare with crawl
      generateQualityReport = true,    // Calculate score
      
      // Output formats
      outputFormat = 'xml'             // 'xml' | 'json' | 'both'
    } = req.body;

    if (!url || !validateUrl(url)) {
      return res.status(400).json({ error: 'Valid URL is required' });
    }

    const jobId = uuidv4();
    jobStore.set(jobId, {
      status: 'processing',
      progress: 0,
      urls: [],
      startedAt: new Date(),
      options: {
        validateLastmod,
        useIntelligentPriority,
        validateCanonical,
        extractImages,
        validateCoverage,
        generateQualityReport
      }
    });

    // Start crawling in background
    crawlerService.crawlSite({
      url,
      maxPages,
      maxDepth,
      excludePatterns,
      respectRobotsTxt,

      onProgress: (progress, currentUrl) => {
        const job = jobStore.get(jobId);
        if (job) {
          job.progress = progress;
          if (currentUrl) job.urls.push(currentUrl);
        }
      },

      onComplete: async (crawledUrls) => {
        const job = jobStore.get(jobId);
        if (job) {
          try {
            // Generate enhanced sitemap
            job.sitemapXml = await sitemapAdapter.generateEnhancedSitemapXml(
              crawledUrls,
              {
                baseUrl: url,
                excludeLowValue: true,
                maxUrls: maxPages,
                includeImages: extractImages,
                validateCanonical: validateCanonical,
                extractRealLastmod: validateLastmod,
                calculateQuality: generateQualityReport
              }
            );

            // Generate quality analysis
            if (generateQualityReport) {
              job.analysis = await sitemapAdapter.analyzeSitemapQuality(
                crawledUrls,
                url
              );
            }

            // Generate comprehensive report
            job.report = await sitemapAdapter.generateSitemapReport(
              crawledUrls,
              url
            );

            // Calculate statistics
            job.stats = {
              totalUrlsCrawled: crawledUrls.length,
              urlsInSitemap: job.sitemapXml.match(/<loc>/g)?.length || 0,
              estimatedSize: new Blob([job.sitemapXml]).size,
              generationTime: new Date() - job.startedAt,
              qualityScore: job.analysis?.score || null,
              qualityGrade: job.analysis?.grade || null
            };

            job.status = 'completed';

            if (DEBUG_SITEMAP) {
              console.log(`[SITEMAP] Enhanced sitemap generated:`, {
                jobId,
                urls: job.stats.urlsInSitemap,
                score: job.stats.qualityScore,
                size: `${(job.stats.estimatedSize / 1024).toFixed(2)} KB`,
                time: `${job.stats.generationTime}ms`
              });
            }

          } catch (error) {
            console.error('[SITEMAP] Generation error:', error);
            job.status = 'failed';
            job.error = error.message;
          }
        }
      },

      onError: (error) => {
        const job = jobStore.get(jobId);
        if (job) {
          job.status = 'failed';
          job.error = error.message;
        }
      }
    });

    res.json({
      success: true,
      jobId,
      message: 'Enhanced sitemap generation started',
      statusUrl: `/api/sitemap/enhanced-status/${jobId}`,
      options: {
        validateLastmod,
        useIntelligentPriority,
        validateCanonical,
        extractImages,
        generateQualityReport
      }
    });

  } catch (error) {
    console.error('Sitemap request error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get enhanced sitemap status
 */
exports.getEnhancedSitemapStatus = (req, res) => {
  const { jobId } = req.params;
  const { format = 'full' } = req.query; // 'full', 'stats', 'analysis', 'xml'

  const job = jobStore.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  const response = {
    jobId,
    status: job.status,
    progress: job.progress,
    startedAt: job.startedAt,
    options: job.options
  };

  if (job.status === 'processing') {
    response.urlsProcessed = job.urls?.length || 0;
  }

  if (job.status === 'completed') {
    // Add different formats based on request
    if (format === 'xml' || format === 'full') {
      response.sitemapXml = job.sitemapXml;
    }

    if (format === 'analysis' || format === 'full') {
      response.analysis = job.analysis;
    }

    if (format === 'stats' || format === 'full') {
      response.stats = job.stats;
      response.report = job.report;
    }

    // Full audit output
    if (format === 'audit' || format === 'full') {
      response.audit = {
        timestamp: new Date().toISOString(),
        quality: {
          score: job.analysis?.score || null,
          grade: job.analysis?.grade || null,
          status: job.analysis?.quality?.status || null,
          deductions: job.analysis?.quality?.deductions || [],
          errors: job.analysis?.quality?.errors || [],
          warnings: job.analysis?.quality?.warnings || []
        },
        coverage: job.analysis?.coverage || null,
        compliance: job.analysis?.compliance || {},
        recommendations: job.analysis?.recommendations || []
      };
    }

    response.urls = job.urls;
  }

  if (job.status === 'failed') {
    response.error = job.error;
  }

  // Clean up old jobs
  if (job.startedAt < new Date(Date.now() - 3600000)) {
    jobStore.delete(jobId);
  }

  res.json(response);
};

/**
 * Get sitemap XML directly
 */
exports.getEnhancedSitemapXml = (req, res) => {
  const { jobId } = req.params;
  const job = jobStore.get(jobId);

  if (!job) {
    return res.status(404).send('Sitemap not found');
  }

  if (job.status !== 'completed') {
    return res.status(202).send('Sitemap still processing');
  }

  res.set('Content-Type', 'application/xml');
  res.send(job.sitemapXml);
};

/**
 * Get sitemap quality report in JSON
 */
exports.getEnhancedSitemapReport = (req, res) => {
  const { jobId } = req.params;
  const job = jobStore.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  if (job.status !== 'completed') {
    return res.status(202).json({ status: 'processing' });
  }

  res.json({
    timestamp: new Date().toISOString(),
    sitemap: {
      status: job.status,
      totalUrls: job.urls?.length || 0,
      sitemapUrls: job.stats.urlsInSitemap,
      estimatedSize: `${(job.stats.estimatedSize / 1024).toFixed(2)} KB`,
      generationTime: `${job.stats.generationTime}ms`
    },
    quality: {
      score: job.analysis?.score || 0,
      grade: job.analysis?.grade || 'F',
      status: job.analysis?.quality?.status || 'unknown',
      deductions: job.analysis?.quality?.deductions || [],
      warnings: job.analysis?.quality?.warnings || [],
      errors: job.analysis?.quality?.errors || []
    },
    coverage: job.analysis?.coverage || null,
    compliance: job.analysis?.compliance || {},
    issues: {
      critics: job.analysis?.quality?.errors?.length || 0,
      warnings: job.analysis?.quality?.warnings?.length || 0,
      deductions: job.analysis?.quality?.deductions?.length || 0
    },
    recommendations: job.analysis?.recommendations || []
  });
};

/**
 * Validation endpoint to check URLs without crawling
 */
exports.validateUrls = async (req, res) => {
  try {
    const { urls } = req.body;

    if (!Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: 'Array of URLs required' });
    }

    // Validate each URL format
    const validation = urls.map(url => ({
      url,
      valid: validateUrl(url),
      hasParams: url.includes('?'),
      hasFragment: url.includes('#')
    }));

    // Analyze quality
    const analysis = await sitemapAdapter.analyzeSitemapQuality(urls, urls[0]);

    res.json({
      urlsValidated: urls.length,
      validation,
      analysis: {
        score: analysis.score,
        grade: analysis.grade,
        issues: {
          invalidUrls: validation.filter(v => !v.valid).length,
          urlsWithParams: validation.filter(v => v.hasParams).length
        }
      }
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Cleanup old jobs
 */
exports.cleanup = (req, res) => {
  const now = Date.now();
  const oneHourAgo = now - (3600 * 1000);

  let cleaned = 0;
  for (const [jobId, job] of jobStore.entries()) {
    if (job.startedAt < new Date(oneHourAgo)) {
      jobStore.delete(jobId);
      cleaned++;
    }
  }

  res.json({
    message: 'Cleanup completed',
    jobsRemoved: cleaned,
    activeJobs: jobStore.size
  });
};
