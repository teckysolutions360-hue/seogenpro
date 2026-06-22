/**
 * Unified Comprehensive Audit Service v2.0
 * 
 * Orchestrates all audit components:
 * 1. Enhanced crawler (link graph, orphans, metadata)
 * 2. Robots.txt validator
 * 3. Sitemap validator
 * 4. Dynamic scoring engine
 * 5. LLM analysis layer
 * 6. Final report generation
 * 
 * Returns complete, actionable audit report
 */

const enhancedCrawler = require('../modules/enhancedCrawler');
const robotsValidator = require('../modules/robotsValidator');
const sitemapValidator = require('../modules/sitemapValidator');
const dynamicScoringEngine = require('../modules/dynamicScoringEngine');
const llmIntegration = require('../modules/llmIntegration');
const axios = require('axios');

class ComprehensiveAuditService {
  constructor() {
    this.timeout = 60000; // 60 second timeout for full audit
  }

  /**
   * Main audit orchestration
   */
  async runComprehensiveAudit(baseUrl, options = {}) {
    const startTime = Date.now();

    try {
      console.log(`[Audit] Starting comprehensive audit for: ${baseUrl}`);

      // 1. Enhanced crawl
      console.log('[Audit] Phase 1: Enhanced crawling...');
      const crawlData = await this.performEnhancedCrawl(baseUrl, options);

      // 2. Fetch robots.txt
      console.log('[Audit] Phase 2: Robots.txt validation...');
      const robotsData = await this.validateRobots(baseUrl);

      // 3. Validate sitemap
      console.log('[Audit] Phase 3: Sitemap validation...');
      const sitemapData = await sitemapValidator.validate(baseUrl, crawlData);

      // 4. Dynamic scoring
      console.log('[Audit] Phase 4: Dynamic scoring...');
      const scoreData = dynamicScoringEngine.calculateScore(crawlData, robotsData, sitemapData);

      // 5. LLM analysis (optional, graceful fallback)
      console.log('[Audit] Phase 5: LLM strategic analysis...');
      let llmAnalysis = { success: false };
      try {
        llmAnalysis = await llmIntegration.analyzeAuditWithLLM({
          baseUrl,
          crawlData,
          robotsData,
          sitemapData,
          scoreData
        });
      } catch (e) {
        console.warn('[Audit] LLM analysis skipped:', e.message);
      }

      // 6. Generate final report
      console.log('[Audit] Phase 6: Generating final report...');
      const report = this.generateFinalReport({
        baseUrl,
        crawlData,
        robotsData,
        sitemapData,
        scoreData,
        llmAnalysis,
        executionTime: Date.now() - startTime
      });

      console.log(`[Audit] Complete! Score: ${report.overall_score}/100 (${report.grade})`);
      return report;

    } catch (error) {
      console.error('[Audit] Error:', error.message);
      throw error;
    }
  }

  /**
   * Phase 1: Enhanced crawl
   */
  async performEnhancedCrawl(baseUrl, options) {
    const crawler = require('../modules/enhancedCrawler');
    
    const crawlOptions = {
      maxPages: options.maxPages || 200,
      depthLimit: options.depthLimit || 4,
      concurrency: options.concurrency || 3
    };

    const result = await crawler.crawl(baseUrl, crawlOptions);
    
    return result;
  }

  /**
   * Phase 2: Robots.txt validation
   */
  async validateRobots(baseUrl) {
    try {
      const robotsUrl = new URL('/robots.txt', baseUrl).href;
      const response = await axios.get(robotsUrl, {
        timeout: 5000,
        headers: { 'User-Agent': 'LLMS-Audit/2.0' }
      });

      const validation = await robotsValidator.validate(response.data, baseUrl);
      return validation;
    } catch (error) {
      console.warn('[Audit] Robots.txt not found or error:', error.message);
      return {
        score: 0,
        baseScore: 100,
        summary: '❌ robots.txt not found',
        errors: ['❌ robots.txt not found'],
        warnings: [],
        improvements: [
          '✓ Create robots.txt at domain.com/robots.txt',
          '✓ Add Sitemap: https://domain.com/sitemap.xml',
          '✓ Block system pages: Disallow: /admin /login /cart'
        ],
        parsed: {
          userAgents: [],
          disallowCount: 0,
          allowCount: 0,
          sitemaps: 0,
          crawlDelays: 0
        }
      };
    }
  }

  /**
   * Generate comprehensive final report
   */
  generateFinalReport(data) {
    const report = {
      // Metadata
      audit_timestamp: new Date().toISOString(),
      audit_url: data.baseUrl,
      execution_time_ms: data.executionTime,

      // Overall Scores (5-category model)
      score_breakdown: {
        technical_score: data.scoreData?.breakdown?.technical || 0,
        content_score: data.scoreData?.breakdown?.content || 0,
        structure_score: data.scoreData?.breakdown?.structure || 0,
        security_score: data.scoreData?.breakdown?.security || 0,
        usability_score: data.scoreData?.breakdown?.usability || 0
      },

      overall_score: data.scoreData?.score || 0,
      grade: data.scoreData?.grade || 'F',
      explanation: data.scoreData?.explanation || 'Unable to determine',

      // Crawl Analysis
      crawl_analysis: {
        total_pages: data.crawlData?.stats?.totalPages || 0,
        total_links: data.crawlData?.stats?.totalLinks || 0,
        external_links: data.crawlData?.stats?.externalLinksCount || 0,
        broken_links: data.crawlData?.stats?.brokenLinksCount || 0,
        
        depth_analysis: {
          average_depth: data.crawlData?.analysis?.avgDepth || 0,
          depth_distribution: data.crawlData?.analysis?.depthDistribution || {}
        },

        page_issues: {
          orphan_pages: data.crawlData?.analysis?.orphanCount || 0,
          duplicate_titles: data.crawlData?.analysis?.duplicateTitleCount || 0,
          missing_meta_descriptions: data.crawlData?.analysis?.missingMetaDescriptionCount || 0,
          missing_canonicals: data.crawlData?.analysis?.missingCanonicalCount || 0,
          thin_content_pages: data.crawlData?.analysis?.thinContentCount || 0,
          pages_with_query_params: data.crawlData?.analysis?.queryParamRiskCount || 0,
          system_pages_indexed: data.crawlData?.analysis?.systemPageIssues || 0,
          generic_anchor_texts: data.crawlData?.analysis?.genericAnchorCount || 0
        }
      },

      // Robots.txt Analysis
      robots_analysis: {
        score: data.robotsData?.score || 0,
        status: (data.robotsData?.score || 0) >= 80 ? 'Good' : (data.robotsData?.score || 0) >= 60 ? 'Fair' : 'Poor',
        summary: data.robotsData?.summary || 'No summary',
        errors: data.robotsData?.errors || [],
        warnings: data.robotsData?.warnings || [],
        improvements: data.robotsData?.improvements || [],
        structure: data.robotsData?.parsed || { userAgents: [], disallowCount: 0, allowCount: 0, sitemaps: 0, crawlDelays: 0 }
      },

      // Sitemap Analysis
      sitemap_analysis: {
        detected: !!data.sitemapData?.sitemapUrl,
        url: data.sitemapData?.sitemapUrl || 'N/A',
        coverage_percent: data.sitemapData?.coverage || 0,
        stats: data.sitemapData?.stats || { totalInSitemap: 0, coverage: 0 },
        status: (data.sitemapData?.stats?.totalInSitemap || 0) > 0 && (data.sitemapData?.errors || []).length === 0 ? 'Valid' : 'Issues',
        errors: data.sitemapData?.errors || [],
        warnings: data.sitemapData?.warnings || []
      },

      // Critical Issues
      critical_issues: (data.scoreData?.issues || [])
        .filter(i => i.severity === 'critical')
        .map(i => ({
          title: i.title,
          description: i.description,
          impact: i.impact,
          solution: i.solution
        })),

      // Warnings
      warnings: (data.scoreData?.issues || [])
        .filter(i => i.severity === 'warning')
        .map(i => ({
          title: i.title,
          description: i.description,
          solution: i.solution
        })),

      // Minor Issues
      minor_issues_count: (data.scoreData?.issues || [])
        .filter(i => i.severity === 'minor').length,

      // Recommendations (from dynamic scoring engine)
      recommendations: data.scoreData?.recommendations || [],

      // LLM Strategic Analysis (if available)
      llm_analysis: data.llmAnalysis?.success ? {
        source: 'LLM',
        confidence: 'high',
        critical_risks: data.llmAnalysis?.llmAnalysis?.critical_risks || [],
        contradictions: data.llmAnalysis?.llmAnalysis?.contradictions || [],
        score_assessment: data.llmAnalysis?.llmAnalysis?.score_assessment,
        priority_actions: data.llmAnalysis?.llmAnalysis?.priority_actions || [],
        strategic_insights: data.llmAnalysis?.llmAnalysis?.strategic_insights
      } : {
        source: 'local_only',
        note: data.llmAnalysis?.fallback || 'LLM analysis not available'
      },

      // Audit Quality
      audit_quality: {
        pages_analyzed: data.crawlData?.stats?.totalPages || 0,
        data_points_collected: this.countDataPoints(data),
        validation_complete: true
      }
    };

    return report;
  }

  /**
   * Count total data points collected
   */
  countDataPoints(data) {
    let count = 0;

    count += (data.crawlData?.stats?.totalPages || 0); // Pages
    count += (data.crawlData?.stats?.totalLinks || 0); // Links
    count += (data.crawlData?.analysis?.orphanCount || 0); // Orphans
    count += (data.crawlData?.analysis?.duplicateTitleCount || 0); // Duplicates
    count += (data.crawlData?.analysis?.missingMetaDescriptionCount || 0); // Missing desc
    count += (data.crawlData?.analysis?.missingCanonicalCount || 0); // Missing canonical
    count += (data.crawlData?.analysis?.thinContentCount || 0); // Thin content
    count += (data.robotsData?.parsed?.disallowCount || 0); // Robots rules
    count += (data.sitemapData?.stats?.totalInSitemap || 0); // Sitemap URLs
    count += (data.scoreData?.issues?.length || 0); // Issues

    return count;
  }
}

module.exports = new ComprehensiveAuditService();
