/**
 * LLM Integration Layer
 * 
 * Sends structured audit data to LLM API for:
 * - Reasoning and pattern detection
 * - Logical inconsistency identification
 * - Realistic score recalculation
 * - Priority ranking of fix proposals
 * - Strategic recommendations
 */

const axios = require('axios');

class LLMIntegrationLayer {
  constructor() {
    // Use free LLM API
    this.API_URL = 'https://api.together.ai/inference';
    this.MODEL = 'meta-llama/Llama-2-7b-chat-hf';
    
    // Fallback if key not set
    this.USE_MOCK_RESPONSE = process.env.LLM_API_KEY ? false : true;
    this.rateLimit = {
      maxRequests: 5,
      windowMs: 3600000, // 1 hour
      requests: []
    };
  }

  /**
   * Check rate limiting
   */
  checkRateLimit() {
    const now = Date.now();
    this.rateLimit.requests = this.rateLimit.requests.filter(
      t => now - t < this.rateLimit.windowMs
    );

    if (this.rateLimit.requests.length >= this.rateLimit.maxRequests) {
      throw new Error('Rate limit exceeded. Max 5 LLM requests per hour.');
    }

    this.rateLimit.requests.push(now);
  }

  /**
   * Analyze audit data with LLM
   */
  async analyzeAuditWithLLM(auditData) {
    try {
      this.checkRateLimit();

      // Clean and structure data for LLM
      const cleanedData = this.cleanDataForLLM(auditData);

      // Build prompt
      const prompt = this.buildAnalysisPrompt(cleanedData);

      // Call LLM
      let response;
      if (this.USE_MOCK_RESPONSE) {
        response = this.getMockResponse(cleanedData);
      } else {
        response = await this.callLLMAPI(prompt);
      }

      // Parse response
      const analysis = this.parseAnalysisResponse(response);

      return {
        success: true,
        llmAnalysis: analysis,
        rawResponse: response
      };
    } catch (error) {
      console.error('[LLMIntegration] Error:', error.message);
      
      // Return graceful fallback
      return {
        success: false,
        error: error.message,
        llmAnalysis: null,
        fallback: 'LLM analysis unavailable. Using local scoring only.'
      };
    }
  }

  /**
   * Clean data before sending to LLM
   */
  cleanDataForLLM(auditData) {
    const cleaning = {
      baseUrl: auditData.baseUrl,
      timestamp: new Date().toISOString(),
      
      crawlMetrics: {
        totalPages: auditData.crawlData?.stats?.totalPages || 0,
        totalLinks: auditData.crawlData?.stats?.totalLinks || 0,
        brokenLinks: auditData.crawlData?.stats?.brokenLinksCount || 0,
        externalLinks: auditData.crawlData?.stats?.externalLinksCount || 0
      },

      issuesSummaryByType: {
        technical: auditData.scoreData?.issues?.filter(i => i.type === 'technical') || [],
        content: auditData.scoreData?.issues?.filter(i => i.type === 'content') || [],
        structure: auditData.scoreData?.issues?.filter(i => i.type === 'structure') || [],
        security: auditData.scoreData?.issues?.filter(i => i.type === 'security') || [],
        usability: auditData.scoreData?.issues?.filter(i => i.type === 'usability') || []
      },

      issueCountBySeverity: {
        critical: auditData.scoreData?.issues?.filter(i => i.severity === 'critical').length || 0,
        warning: auditData.scoreData?.issues?.filter(i => i.severity === 'warning').length || 0,
        minor: auditData.scoreData?.issues?.filter(i => i.severity === 'minor').length || 0
      },

      keyFindings: {
        crawlabilityScore: auditData.scoreData?.score,
        robotsTxtScore: auditData.robotsData?.score,
        sitemapCoverage: auditData.sitemapData?.coverage,
        systemPagesIndexable: auditData.crawlData?.analysis?.systemPageIssues || 0,
        orphanPages: auditData.crawlData?.analysis?.orphanCount || 0
      },

      recommendations: auditData.scoreData?.recommendations?.slice(0, 5) || []
    };

    return cleaning;
  }

  /**
   * Build LLM analysis prompt
   */
  buildAnalysisPrompt(cleanedData) {
    return `You are an advanced SEO strategist analyzing website technical compliance.

AUDIT DATA:
${JSON.stringify(cleanedData, null, 2)}

TASK: Analyze this structured technical data and:

1. **Identify Critical SEO Risks**: List the 3 most damaging issues affecting search visibility
2. **Detect Logical Contradictions**: Are there conflicting signals in the data? (e.g., high crawlability but many broken links)
3. **Realistic Score Assessment**: Based on the issues, is the current score accurate or should it be adjusted?
4. **Priority Framework**: Rank the top 5 fixes by expected impact (High/Medium/Low)
5. **Strategic Direction**: What foundational work needs to happen first?

RESPONSE FORMAT (JSON):
{
  "critical_risks": [
    {"risk": "...", "impact": "...", "evidence": "..."}
  ],
  "contradictions": [
    {"contradiction": "...", "implication": "..."}
  ],
  "score_assessment": {
    "current_score": number,
    "realistic_score": number,
    "justification": "..."
  },
  "priority_actions": [
    {"action": "...", "impact": "...", "priority": "High/Medium/Low", "effort": "hours"}
  ],
  "strategic_insights": "..."
}`;
  }

  /**
   * Call LLM API
   */
  async callLLMAPI(prompt) {
    try {
      const response = await axios.post(
        this.API_URL,
        {
          model: this.MODEL,
          prompt: prompt,
          max_tokens: 2000,
          temperature: 0.7,
          top_p: 0.9
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.LLM_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      return response.data?.output?.choices?.[0]?.text || response.data;
    } catch (error) {
      if (error.response?.status === 429) {
        throw new Error('LLM API rate limited. Try again later.');
      }
      throw error;
    }
  }

  /**
   * Parse LLM response
   */
  parseAnalysisResponse(rawResponse) {
    try {
      // Try to extract JSON from response
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      // Fallback: return raw response wrapped
      return {
        analysis: rawResponse,
        parseError: 'Could not extract JSON structure'
      };
    } catch (error) {
      return {
        analysis: rawResponse,
        parseError: error.message
      };
    }
  }

  /**
   * Mock response for demo/fallback
   */
  getMockResponse(cleanedData) {
    const criticalCount = cleanedData.issueCountBySeverity.critical;
    const warningCount = cleanedData.issueCountBySeverity.warning;

    return {
      critical_risks: [
        {
          risk: `${cleanedData.keyFindings.systemPagesIndexable} system pages indexed`,
          impact: 'Severe - Search engines indexing admin/login pages wastes crawl budget and creates security risk',
          evidence: `Found ${cleanedData.keyFindings.systemPagesIndexable} indexable system pages in robots.txt analysis`
        },
        {
          risk: `${cleanedData.keyFindings.orphanPages} orphan pages detected`,
          impact: 'High - Pages with no internal links won\'t be discovered by search engines',
          evidence: `Graph analysis showed ${cleanedData.keyFindings.orphanPages} pages with zero incoming links`
        },
        {
          risk: `${cleanedData.crawlMetrics.brokenLinks} broken internal links`,
          impact: 'Medium - Damages user experience and wastes crawl efficiency',
          evidence: `${cleanedData.crawlMetrics.brokenLinks} internal links returned non-success status codes`
        }
      ],

      contradictions: [
        cleanedData.keyFindings.crawlabilityScore > 75 && cleanedData.issueCountBySeverity.critical > 0
          ? {
              contradiction: `High crawlability score (${cleanedData.keyFindings.crawlabilityScore}) despite critical issues`,
              implication: 'Scoring may be over-generous or issues are structural rather than affecting crawlability'
            }
          : null
      ].filter(Boolean),

      score_assessment: {
        current_score: cleanedData.keyFindings.crawlabilityScore,
        realistic_score: Math.max(0, Math.min(100, cleanedData.keyFindings.crawlabilityScore - (criticalCount * 15) - (warningCount * 5))),
        justification: `With ${criticalCount} critical and ${warningCount} warning issues, score should account for systemic problems affecting SEO performance.`
      },

      priority_actions: [
        cleanedData.keyFindings.systemPagesIndexable > 0 ? {
          action: 'Block system pages (admin, login, cart) in robots.txt',
          impact: `+${Math.min(30, cleanedData.keyFindings.systemPagesIndexable * 15)} points`,
          priority: 'High',
          effort: 0.5
        } : null,

        cleanedData.keyFindings.orphanPages > 0 ? {
          action: 'Add internal navigation links to orphan pages',
          impact: `+${Math.min(20, cleanedData.keyFindings.orphanPages * 3)} points`,
          priority: 'High',
          effort: cleanedData.keyFindings.orphanPages < 5 ? 1 : 4
        } : null,

        cleanedData.crawlMetrics.brokenLinks > 0 ? {
          action: 'Fix or remove broken internal links',
          impact: `+${Math.min(15, cleanedData.crawlMetrics.brokenLinks * 2)} points`,
          priority: 'High',
          effort: cleanedData.crawlMetrics.brokenLinks < 10 ? 1 : 3
        } : null,

        cleanedData.keyFindings.crawlabilityScore < 70 ? {
          action: 'Audit and expand thin content (<300 words)',
          impact: '+10 points',
          priority: 'Medium',
          effort: 8
        } : null,

        cleanedData.keyFindings.sitemapCoverage < 80 ? {
          action: 'Sync sitemap with crawled pages',
          impact: '+8 points',
          priority: 'Medium',
          effort: 2
        } : null
      ].filter(Boolean),

      strategic_insights: `Site has ${cleanedData.crawlMetrics.totalPages} pages with ${cleanedData.crawlMetrics.brokenLinks} broken links. ` +
        (cleanedData.keyFindings.systemPagesIndexable > 0 
          ? `URGENT: System pages are indexed - this is the highest priority. ` 
          : '') +
        `After fixing critical issues, focus on content quality and internal linking strategy. ` +
        `Recommend: 1) Fix robots.txt, 2) Remove broken links, 3) Link orphan pages, 4) Expand thin content.`
    };
  }

  /**
   * Generate strategic recommendations from LLM analysis
   */
  generateStrategicRecommendations(llmAnalysis) {
    if (!llmAnalysis || !llmAnalysis.llmAnalysis) {
      return {
        recommendations: [],
        confidence: 'low',
        source: 'fallback'
      };
    }

    const analysis = llmAnalysis.llmAnalysis;

    return {
      recommendations: [
        ...( analysis.priority_actions || []),
        {
          action: analysis.strategic_insights,
          type: 'strategic',
          priority: 'High'
        }
      ],
      confidence: analysis.parseError ? 'medium' : 'high',
      source: 'llm'
    };
  }
}

module.exports = new LLMIntegrationLayer();
