/**
 * Sitemap Analyzer Controller
 * 
 * API endpoints for sitemap analysis and optimization
 * Exposes the SitemapAnalyzer as REST API endpoints
 */

const crypto = require('crypto');
const SitemapAnalyzer = require('../utils/sitemapAnalyzer');

// Store active analysis jobs
const activeJobs = new Map();

class SitemapAnalyzerController {
  /**
   * Analyze sitemap XML (POST /api/analyze/sitemap)
   * 
   * Request body:
   * {
   *   "sitemapUrl": "https://example.com/sitemap.xml",  // Or...
   *   "sitemapXml": "<?xml...?>",                        // ...raw XML
   *   "baseUrl": "https://example.com",
   *   "excludeLowValue": true,
   *   "generateOptimizedXml": true,
   *   "fetchLastmod": false
   * }
   */
  static async analyzeSitemap(req, res) {
    const jobId = crypto.randomUUID();
    
    try {
      const { sitemapUrl, sitemapXml, baseUrl, excludeLowValue = true, generateOptimizedXml = true, fetchLastmod = false } = req.body;

      if (!sitemapUrl && !sitemapXml) {
        return res.status(400).json({
          error: 'Either sitemapUrl or sitemapXml is required'
        });
      }

      // Mark job as in progress
      activeJobs.set(jobId, {
        status: 'processing',
        startTime: new Date(),
        progress: 0
      });

      res.json({
        jobId,
        statusUrl: `/api/analyze/sitemap/status/${jobId}`,
        message: 'Analysis started. Check status URL for results.'
      });

      // Process in background
      (async () => {
        try {
          const analyzer = new SitemapAnalyzer();
          let urls;

          // Parse sitemap from URL or XML
          if (sitemapXml) {
            urls = await analyzer.parseSitemapFromString(sitemapXml);
          } else {
            // Would need axios to fetch from URL
            const axios = require('axios');
            const response = await axios.get(sitemapUrl, { timeout: 10000 });
            urls = await analyzer.parseSitemapFromString(response.data);
          }

          // Analyze
          const analysis = await analyzer.analyzeSitemap(urls, {
            baseUrl: baseUrl || analyzer.extractBaseUrl(urls),
            excludeLowValue
          });

          // Optionally fetch lastmod dates
          if (fetchLastmod && urls.length <= 100) {
            console.log(`Fetching lastmod for ${urls.length} URLs...`);
            for (let i = 0; i < analysis.optimizedUrls.length; i++) {
              const url = analysis.optimizedUrls[i];
              if (!url.lastmod) {
                const lastmod = await analyzer.extractLastmod(url.loc);
                if (lastmod) {
                  url.lastmod = lastmod;
                }
              }
              activeJobs.get(jobId).progress = Math.round((i / analysis.optimizedUrls.length) * 100);
            }
          }

          // Generate optimized XML
          let optimizedXml = null;
          if (generateOptimizedXml) {
            optimizedXml = analyzer.generateOptimizedXml(analysis.optimizedUrls, {
              includeMetadata: true
            });
          }

          // Generate report
          const report = analyzer.generateReport(analysis);

          // Store results
          activeJobs.set(jobId, {
            status: 'completed',
            startTime: activeJobs.get(jobId).startTime,
            completedTime: new Date(),
            analysis,
            optimizedXml,
            report,
            baseUrl: analysis.baseUrl
          });

        } catch (error) {
          activeJobs.set(jobId, {
            status: 'error',
            error: error.message,
            startTime: activeJobs.get(jobId).startTime
          });
        }
      })();

    } catch (error) {
      return res.status(500).json({
        error: 'Failed to start analysis',
        message: error.message
      });
    }
  }

  /**
   * Get analysis status and results (GET /api/analyze/sitemap/status/:jobId)
   */
  static getAnalysisStatus(req, res) {
    const { jobId } = req.params;

    if (!activeJobs.has(jobId)) {
      return res.status(404).json({
        error: 'Job not found',
        jobId
      });
    }

    const job = activeJobs.get(jobId);

    // If completed, return full results
    if (job.status === 'completed') {
      return res.json({
        jobId,
        status: 'completed',
        completedTime: job.completedTime,
        analysis: {
          baseUrl: job.analysis.baseUrl,
          statistics: job.analysis.statistics,
          recommendations: job.analysis.recommendations,
          duplicates: job.analysis.duplicates,
          lowValueUrls: job.analysis.lowValueUrls
        },
        downloadLinks: {
          report: `/api/analyze/sitemap/report/${jobId}`,
          optimizedXml: `/api/analyze/sitemap/xml/${jobId}`,
          json: `/api/analyze/sitemap/json/${jobId}`
        }
      });
    }

    // If processing, return status
    if (job.status === 'processing') {
      return res.json({
        jobId,
        status: 'processing',
        progress: job.progress || 0,
        message: 'Analysis in progress...',
        elapsedSeconds: Math.round((new Date() - job.startTime) / 1000)
      });
    }

    // If error
    if (job.status === 'error') {
      return res.status(500).json({
        jobId,
        status: 'error',
        error: job.error
      });
    }
  }

  /**
   * Download analysis report as text (GET /api/analyze/sitemap/report/:jobId)
   */
  static downloadReport(req, res) {
    const { jobId } = req.params;

    const job = activeJobs.get(jobId);
    if (!job || job.status !== 'completed') {
      return res.status(404).json({ error: 'Report not found or still processing' });
    }

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="sitemap-analysis-${jobId}.txt"`);
    res.send(job.report);
  }

  /**
   * Download optimized sitemap XML (GET /api/analyze/sitemap/xml/:jobId)
   */
  static downloadOptimizedXml(req, res) {
    const { jobId } = req.params;

    const job = activeJobs.get(jobId);
    if (!job || job.status !== 'completed' || !job.optimizedXml) {
      return res.status(404).json({ error: 'Sitemap not found or still processing' });
    }

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="sitemap-optimized-${jobId}.xml"`);
    res.send(job.optimizedXml);
  }

  /**
   * Download analysis as JSON (GET /api/analyze/sitemap/json/:jobId)
   */
  static downloadJson(req, res) {
    const { jobId } = req.params;

    const job = activeJobs.get(jobId);
    if (!job || job.status !== 'completed') {
      return res.status(404).json({ error: 'Data not found or still processing' });
    }

    const data = {
      jobId,
      completedTime: job.completedTime,
      analysis: {
        baseUrl: job.analysis.baseUrl,
        statistics: job.analysis.statistics,
        urls: job.analysis.optimizedUrls.map(u => ({
          loc: u.loc,
          type: u.type,
          priority: u.priority,
          changefreq: u.changefreq,
          lastmod: u.lastmod,
          importance: u.importance
        })),
        recommendations: job.analysis.recommendations,
        duplicates: job.analysis.duplicates,
        lowValueUrls: job.analysis.lowValueUrls
      }
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="sitemap-analysis-${jobId}.json"`);
    res.json(data);
  }

  /**
   * Quick classifier API - Classify a single URL (POST /api/analyze/classify)
   * 
   * Request body:
   * {
   *   "url": "https://example.com/blog/article",
   *   "baseUrl": "https://example.com"
   * }
   */
  static classifyUrl(req, res) {
    try {
      const { url, baseUrl } = req.body;

      if (!url) {
        return res.status(400).json({ error: 'URL is required' });
      }

      const analyzer = new SitemapAnalyzer();
      const classification = analyzer.classifyUrl(url, baseUrl || analyzer.extractBaseUrl([{ loc: url }]));

      return res.json({
        url,
        classification: {
          type: classification.type,
          priority: classification.priority,
          changefreq: classification.changefreq,
          importance: classification.importance,
          rationale: classification.rationale
        }
      });

    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }

  /**
   * Bulk classify URLs (POST /api/analyze/classify-bulk)
   * 
   * Request body:
   * {
   *   "urls": ["https://example.com/", "https://example.com/blog/article"],
   *   "baseUrl": "https://example.com"
   * }
   */
  static classifyBulk(req, res) {
    try {
      const { urls, baseUrl } = req.body;

      if (!urls || !Array.isArray(urls)) {
        return res.status(400).json({ error: 'urls array is required' });
      }

      const analyzer = new SitemapAnalyzer();
      const results = urls.map(url => {
        const classification = analyzer.classifyUrl(url, baseUrl || analyzer.extractBaseUrl([{ loc: url }]));
        return {
          url,
          type: classification.type,
          priority: classification.priority,
          changefreq: classification.changefreq,
          importance: classification.importance
        };
      });

      return res.json({
        count: results.length,
        classifications: results
      });

    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }

  /**
   * Get job statistics (GET /api/analyze/stats/:jobId)
   */
  static getJobStats(req, res) {
    const { jobId } = req.params;

    const job = activeJobs.get(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const duration = job.completedTime 
      ? (job.completedTime - job.startTime) / 1000 
      : (new Date() - job.startTime) / 1000;

    return res.json({
      jobId,
      status: job.status,
      duration: `${duration.toFixed(2)}s`,
      startTime: job.startTime,
      completedTime: job.completedTime,
      ...(job.analysis && {
        statistics: job.analysis.statistics
      })
    });
  }

  /**
   * Clear completed jobs (DELETE /api/analyze/jobs/:jobId)
   */
  static clearJob(req, res) {
    const { jobId } = req.params;

    if (!activeJobs.has(jobId)) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const job = activeJobs.get(jobId);
    activeJobs.delete(jobId);

    return res.json({
      message: 'Job deleted',
      jobId,
      status: job.status
    });
  }

  /**
   * List all jobs (GET /api/analyze/jobs)
   */
  static listJobs(req, res) {
    const jobs = Array.from(activeJobs.entries()).map(([jobId, job]) => ({
      jobId,
      status: job.status,
      created: job.startTime,
      completed: job.completedTime,
      ...(job.analysis && {
        urlsAnalyzed: job.analysis.statistics.optimizedUrls
      })
    }));

    return res.json({
      total: jobs.length,
      jobs
    });
  }
}

module.exports = SitemapAnalyzerController;
