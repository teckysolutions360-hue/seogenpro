const crypto = require('crypto');
const llmsService = require('../services/llmsService');
const { validateUrl } = require('../utils/validators');

/**
 * LLMS Controller - Enhanced for AI Compliance Analysis
 * =====================================================
 */

// Job store for async LLMS generation
const jobStore = new Map();

/**
 * Generate AI Compliance Analysis
 */
exports.generateLlmsTxt = async (req, res) => {
  try {
    const { 
      url,
      maxPages = 50,
      allowAITraining = true,
      requireAttribution = true
    } = req.body;

    // Validate input
    if (!url || !validateUrl(url)) {
      return res.status(400).json({ error: 'Valid URL is required' });
    }

    // Create async job
    const jobId = crypto.randomUUID();
    
    jobStore.set(jobId, {
      status: 'processing',
      progress: 0,
      content: '',
      pageCount: 0,
      aiReadinessScore: 0,
      startedAt: new Date()
    });

    // Start generation in background
    (async () => {
      try {
        console.log(`[LLMS Controller] Starting compliance analysis for: ${url}`);
        
        const analysis = await llmsService.generateComplianceAnalysis(url, {
          maxPages,
          maxDepth: 3, // avoid deep crawls that can take very long
          concurrency: 10,
          timeout: 10000,
          requestDelay: 0,
          allowTraining: allowAITraining,
          allowSummary: true,
          allowQuotation: true,
          allowEmbedding: true,
          requireAttribution
        });

        const job = jobStore.get(jobId);
        if (job) {
          job.status = 'completed';
          job.content = analysis.generatedOutput;
          job.pageCount = analysis.pageCount;
          job.aiReadinessScore = analysis.scoreData.score;
          job.analysis = {
            title: analysis.metadata.title,
            description: analysis.metadata.description,
            contentType: analysis.contentType,
            language: analysis.metadata.language,
            hasSitemap: analysis.hasSitemap,
            hasRobots: analysis.hasRobots,
            schemaMarkup: analysis.metadata.schemaMarkup
          };
          job.progress = 100;
          console.log(`[LLMS Controller] Completed - ${analysis.pageCount} pages, score: ${analysis.scoreData.score}/100`);
        }
      } catch (error) {
        const job = jobStore.get(jobId);
        if (job) {
          job.status = 'failed';
          job.error = error.message;
        }
        console.error('[LLMS Controller] Generation error:', error.message);
      }
    })();

    // Return job ID immediately
    res.json({
      success: true,
      jobId,
      message: 'AI Compliance analysis started',
      statusUrl: `/api/llms/status/${jobId}`
    });

  } catch (error) {
    console.error('[LLMS Controller] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get compliance analysis status and results
 */
exports.getLlmsStatus = (req, res) => {
  const { jobId } = req.params;
  const job = jobStore.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  const response = {
    jobId,
    status: job.status,
    progress: job.progress,
    pageCount: job.pageCount,
    startedAt: job.startedAt
  };

  if (job.status === 'completed') {
    response.content = job.content;
    response.aiReadinessScore = job.aiReadinessScore || 0;
    response.analysis = job.analysis || {};
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

/**
 * Enhance with AI (placeholder for future integrations)
 */
exports.enhanceWithAI = async (req, res) => {
  try {
    const { content, enhancementType = 'summaries' } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    // Placeholder - can integrate with OpenAI, Claude, etc.
    const enhanced = content; // No-op for now

    res.json({
      success: true,
      original: content,
      enhanced,
      enhancements: enhancementType
    });

  } catch (error) {
    console.error('[LLMS Controller] Enhancement error:', error.message);
    res.status(500).json({ error: error.message });
  }
};
