/**
 * JSON Data Transformer for AI Link Advisor
 * 
 * Transforms raw analysis data into frontend-ready JSON:
 * - Converts string numbers to actual numbers
 * - Ensures consistent array/object structures
 * - Adds null/empty checks
 * - Creates summary statistics for dashboard
 * - Structures data for easy frontend iteration
 */

/**
 * Safely convert string to number
 */
function toNumber(value, defaultValue = 0) {
  if (value === null || value === undefined) return defaultValue;
  const num = parseFloat(value);
  return isNaN(num) ? defaultValue : num;
}

/**
 * Ensure value is array, return empty array if not
 */
function ensureArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return [value];
}

/**
 * Transform Internal Links section into frontend-ready array
 */
function transformInternalLinks(internalAnalysis) {
  if (!internalAnalysis) return null;

  return {
    pages: {
      total_discovered: toNumber(internalAnalysis.pages_discovered, 0),
      total_links: toNumber(internalAnalysis.total_internal_links, 0),
      orphan_count: toNumber(internalAnalysis.orphan_pages, 0),
      average_links_per_page: toNumber(internalAnalysis.average_links_per_page, 0),
      average_click_depth: toNumber(internalAnalysis.average_click_depth, 0)
    },
    orphan_pages: {
      count: toNumber(internalAnalysis.orphan_pages, 0),
      urls: ensureArray(internalAnalysis.orphan_page_urls).filter(u => u && typeof u === 'string').slice(0, 10),
      display: ensureArray(internalAnalysis.orphan_page_urls).length > 0 
        ? `${internalAnalysis.orphan_pages} orphan pages with no internal links`
        : 'No orphan pages detected'
    },
    anchor_text: {
      total: toNumber(internalAnalysis.anchor_text_analysis?.total, 0),
      unique: toNumber(internalAnalysis.anchor_text_analysis?.unique, 0),
      generic_count: toNumber(internalAnalysis.anchor_text_analysis?.generic_anchors, 0),
      over_optimized_count: toNumber(internalAnalysis.anchor_text_analysis?.over_optimized_anchors, 0),
      diversity_score: toNumber(internalAnalysis.anchor_text_analysis?.diversity_score, 0),
      top_anchors: ensureArray(internalAnalysis.anchor_text_analysis?.top_anchors)
        .map(a => ({
          text: a.text || 'unknown',
          count: toNumber(a.count, 0)
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
    },
    score: toNumber(internalAnalysis.internal_link_score, 0)
  };
}

/**
 * Transform Backlinks section into frontend-ready array
 */
function transformBacklinks(backlinkAnalysis) {
  if (!backlinkAnalysis) return null;

  const topDomains = ensureArray(backlinkAnalysis.top_referring_domains)
    .filter(d => d && typeof d === 'object')
    .map(domain => ({
      domain: domain.domain || 'unknown',
      mentions: toNumber(domain.mention_count || domain.mentions || domain.backlinks, 0),
      anchor_texts: ensureArray(domain.anchor_texts || domain.top_anchors || [])
        .filter(a => a)
        .slice(0, 5)
    }))
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, 20);

  return {
    domains: {
      total_domains: toNumber(backlinkAnalysis.estimated_referring_domains, 0),
      total_backlinks: toNumber(backlinkAnalysis.estimated_total_backlinks, 0),
      average_per_domain: toNumber(backlinkAnalysis.average_backlinks_per_domain, 0)
    },
    referring_domains: topDomains,
    confidence: backlinkAnalysis.confidence_level || 'low',
    score: toNumber(backlinkAnalysis.backlink_score, 0),
    data_source: 'SERP-estimated via site: queries'
  };
}

/**
 * Transform Competitors section into frontend-ready array
 */
function transformCompetitors(competitorAnalysis) {
  if (!competitorAnalysis) return null;

  const competitors = ensureArray(competitorAnalysis.top_competitors)
    .filter(c => c && typeof c === 'object')
    .map(comp => ({
      domain: comp.domain || 'unknown',
      keywords_ranked: toNumber(comp.keyword_appearances || 0, 0),
      top_position: toNumber(comp.top_position || 0, 0),
      urls_found: ensureArray(comp.urls || []).length,
      sample_urls: ensureArray(comp.urls || []).slice(0, 3)
    }))
    .sort((a, b) => b.keywords_ranked - a.keywords_ranked)
    .slice(0, 15);

  return {
    total_discovered: toNumber(competitorAnalysis.discovered_competitors, 0),
    competitors: competitors,
    dominance_score: toNumber(competitorAnalysis.serp_dominance_score, 0),
    strength_score: toNumber(competitorAnalysis.competitor_strength_score, 0)
  };
}

/**
 * Transform SERP Visibility section
 */
function transformSerpVisibility(serpAnalysis) {
  if (!serpAnalysis) return null;

  const rankings = ensureArray(serpAnalysis.ranking_positions)
    .filter(r => r && typeof r === 'object')
    .map(rank => ({
      keyword: rank.keyword || 'unknown',
      position: toNumber(rank.position, 0),
      url: rank.url || '',
      title: rank.title || 'No title'
    }))
    .slice(0, 10);

  return {
    keywords_analyzed: toNumber(serpAnalysis.keywords_analyzed, 0),
    keywords_ranking: toNumber(serpAnalysis.keywords_ranking, 0),
    rankings: rankings,
    average_position: toNumber(serpAnalysis.average_position, 0),
    visibility_score: toNumber(serpAnalysis.visibility_score, 0)
  };
}

/**
 * Transform AI Recommendations into frontend-ready arrays
 */
function transformRecommendations(recommendations) {
  if (!recommendations) return { all: [] };

  // Flatten all recommendations into a single sortable array with priority score
  const allRecs = [];
  const priorityMap = { HIGH: 1, MEDIUM: 2, LOW: 3, URGENT: 0 };

  const sections = [
    { type: 'Internal Links', items: recommendations.internal_link_strategy },
    { type: 'SERP Ranking', items: recommendations.serp_ranking_opportunities },
    { type: 'Backlink Acquisition', items: recommendations.backlink_acquisition },
    { type: 'Content Strategy', items: recommendations.content_strategy }
  ];

  sections.forEach(section => {
    ensureArray(section.items).forEach(rec => {
      if (rec && typeof rec === 'object') {
        const priority = rec.priority || 'MEDIUM';
        allRecs.push({
          strategy: section.type,
          priority: priority,
          priority_score: priorityMap[priority] || 2,
          action: rec.action || 'N/A',
          impact: rec.expected_impact || rec.impact || '',
          implementation: rec.implementation || 'See details',
          detail: rec.detail || '',
          status: 'pending'
        });
      }
    });
  });

  // Sort by priority score (ascending = urgent first)
  allRecs.sort((a, b) => a.priority_score - b.priority_score);

  return {
    all: allRecs,
    urgent: allRecs.filter(r => r.priority === 'URGENT' || r.priority === 'HIGH'),
    total: allRecs.length,
    by_category: {
      internal_links: allRecs.filter(r => r.strategy === 'Internal Links'),
      serp_ranking: allRecs.filter(r => r.strategy === 'SERP Ranking'),
      backlink_acquisition: allRecs.filter(r => r.strategy === 'Backlink Acquisition'),
      content_strategy: allRecs.filter(r => r.strategy === 'Content Strategy')
    }
  };
}

/**
 * Apply numeric conversions to raw report for backward compatibility
 */
function addBackwardCompatibility(rawReport) {
  if (!rawReport) return {};
  
  return {
    overall_score: toNumber(rawReport.overall_score, 0),
    grade: rawReport.grade || 'F',
    status: rawReport.status || 'unknown',
    
    internal_link_analysis: rawReport.internal_link_analysis ? {
      ...rawReport.internal_link_analysis,
      pages_discovered: toNumber(rawReport.internal_link_analysis.pages_discovered, 0),
      total_internal_links: toNumber(rawReport.internal_link_analysis.total_internal_links, 0),
      average_links_per_page: toNumber(rawReport.internal_link_analysis.average_links_per_page, 0),
      orphan_pages: toNumber(rawReport.internal_link_analysis.orphan_pages, 0),
      average_click_depth: toNumber(rawReport.internal_link_analysis.average_click_depth, 0),
      internal_link_score: toNumber(rawReport.internal_link_analysis.internal_link_score, 0),
      anchor_text_analysis: rawReport.internal_link_analysis.anchor_text_analysis ? {
        ...rawReport.internal_link_analysis.anchor_text_analysis,
        total: toNumber(rawReport.internal_link_analysis.anchor_text_analysis.total, 0),
        unique: toNumber(rawReport.internal_link_analysis.anchor_text_analysis.unique, 0),
        diversity_score: toNumber(rawReport.internal_link_analysis.anchor_text_analysis.diversity_score, 0)
      } : {}
    } : {},
    
    backlink_estimation: rawReport.backlink_estimation ? {
      ...rawReport.backlink_estimation,
      estimated_referring_domains: toNumber(rawReport.backlink_estimation.estimated_referring_domains, 0),
      estimated_total_backlinks: toNumber(rawReport.backlink_estimation.estimated_total_backlinks, 0),
      average_backlinks_per_domain: toNumber(rawReport.backlink_estimation.average_backlinks_per_domain, 0),
      backlink_score: toNumber(rawReport.backlink_estimation.backlink_score, 0)
    } : {},
    
    competitor_analysis: rawReport.competitor_analysis ? {
      ...rawReport.competitor_analysis,
      discovered_competitors: toNumber(rawReport.competitor_analysis.discovered_competitors, 0),
      serp_dominance_score: toNumber(rawReport.competitor_analysis.serp_dominance_score, 0),
      competitor_strength_score: toNumber(rawReport.competitor_analysis.competitor_strength_score, 0),
      // Ensure top_competitors array has numeric values
      top_competitors: ensureArray(rawReport.competitor_analysis.top_competitors)
        .map(c => ({
          ...c,
          keyword_appearances: toNumber(c.keyword_appearances, 0),
          top_position: toNumber(c.top_position, 0)
        }))
    } : {},
    
    serp_visibility_analysis: rawReport.serp_visibility_analysis ? {
      ...rawReport.serp_visibility_analysis,
      keywords_analyzed: toNumber(rawReport.serp_visibility_analysis.keywords_analyzed, 0),
      keywords_ranking: toNumber(rawReport.serp_visibility_analysis.keywords_ranking, 0),
      visibility_score: toNumber(rawReport.serp_visibility_analysis.visibility_score, 0)
    } : {},
    
    scoring: rawReport.scoring ? {
      internal_link_score: toNumber(rawReport.scoring.internal_link_score, 0),
      serp_visibility_score: toNumber(rawReport.scoring.serp_visibility_score, 0),
      backlink_score: toNumber(rawReport.scoring.backlink_score, 0),
      competitor_strength_score: toNumber(rawReport.scoring.competitor_strength_score, 0),
      overall_seo_authority_score: toNumber(rawReport.scoring.overall_seo_authority_score, 0)
    } : {}
  };
}

/**
 * Generate dashboard summary statistics
 */
function generateDashboardSummary(report) {
  return {
    overall_score: toNumber(report.overall_score, 0),
    grade: report.grade || 'F',
    status: report.status || 'pending',
    execution_time: toNumber(report.execution_time_seconds, 0),
    
    key_metrics: {
      pages: toNumber(report.internal_link_analysis?.pages_discovered, 0),
      orphans: toNumber(report.internal_link_analysis?.orphan_pages, 0),
      backlinks: toNumber(report.backlink_estimation?.estimated_total_backlinks, 0),
      domains: toNumber(report.backlink_estimation?.estimated_referring_domains, 0),
      competitors: toNumber(report.competitor_analysis?.discovered_competitors, 0),
      keywords_ranking: toNumber(report.serp_visibility_analysis?.keywords_ranking, 0)
    },
    
    scores: {
      internal_links: toNumber(report.scoring?.internal_link_score, 0),
      serp_visibility: toNumber(report.scoring?.serp_visibility_score, 0),
      backlinks: toNumber(report.scoring?.backlink_score, 0),
      competitors: toNumber(report.scoring?.competitor_strength_score, 0)
    },
    
    highest_priority_action: 'Fix orphan pages' // Example, could be dynamic
  };
}

/**
 * Main transformer function - removed LinkAdvisor
 */

module.exports = {
  toNumber,
  ensureArray,
  transformInternalLinks,
  transformBacklinks,
  transformCompetitors,
  transformSerpVisibility,
  transformRecommendations,
  generateDashboardSummary,
  addBackwardCompatibility
};
