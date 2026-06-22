/**
 * Data Transformation & Validation Utilities
 * Ensures consistent data format across MongoDB and API responses
 */

/**
 * Safely get nested object value with default
 * @param {object} obj - Object to access
 * @param {string} path - Path like 'a.b.c'
 * @param {*} defaultValue - Default value if not found
 * @returns {*} Value at path or default
 */
function safeGet(obj, path, defaultValue = null) {
  try {
    const value = path.split('.').reduce((current, prop) => current?.[prop], obj);
    return value ?? defaultValue;
  } catch (err) {
    return defaultValue;
  }
}

/**
 * Sanitize internal links data for storage
 * @param {object} data - Raw internal links data
 * @returns {object} Sanitized data
 */
function sanitizeInternalLinks(data) {
  return {
    summary: {
      totalPages: safeGet(data, 'summary.totalPages', 0),
      orphanPages: safeGet(data, 'summary.orphanPages', 0),
      averageDepth: parseFloat(safeGet(data, 'summary.averageDepth', 0)) || 0
    },
    pages: Array.isArray(data.pages) ? data.pages.filter(p => typeof p === 'string') : [],
    orphanPages: Array.isArray(data.orphanPages) ? data.orphanPages.filter(p => typeof p === 'string') : [],
    linkDepth: isObject(data.linkDepth) ? data.linkDepth : {},
    anchorDiversity: isObject(data.anchorDiversity) ? data.anchorDiversity : {},
    suggestions: Array.isArray(data.suggestions) ? data.suggestions.map(s => ({
      page: s.page || '',
      depth: s.depth || 0,
      suggestion: s.suggestion || '',
      recommendedSources: Array.isArray(s.recommendedSources) ? s.recommendedSources : []
    })) : [],
    linkGraph: isObject(data.linkGraph) ? data.linkGraph : {}
  };
}

/**
 * Sanitize backlinks data for storage
 * @param {object} data - Raw backlinks data
 * @returns {object} Sanitized data
 */
function sanitizeBacklinks(data) {
  return {
    summary: {
      totalBacklinks: safeGet(data, 'summary.totalBacklinks', 0),
      referringDomains: safeGet(data, 'summary.referringDomains', 0),
      brokenLinks: safeGet(data, 'summary.brokenLinks', 0),
      averageScore: safeGet(data, 'summary.averageScore', 'N/A')
    },
    backlinks: Array.isArray(data.backlinks) ? data.backlinks.map(bl => ({
      source: bl.source || '',
      title: bl.title || '',
      snippet: bl.snippet || '',
      position: bl.position || 0,
      type: bl.type || 'unknown',
      timestamp: bl.timestamp ? new Date(bl.timestamp) : new Date()
    })) : [],
    referringDomains: Array.isArray(data.referringDomains) ? data.referringDomains.filter(d => typeof d === 'string') : [],
    brokenLinks: Array.isArray(data.brokenLinks) ? data.brokenLinks.filter(l => typeof l === 'string') : [],
    backlinkScores: Array.isArray(data.backlinkScores) ? data.backlinkScores.map(bs => ({
      source: bs.source || '',
      score: parseFloat(bs.score) || 0,
      quality: bs.quality || 'unknown'
    })) : [],
    anchorDiversity: isObject(data.anchorDiversity) ? data.anchorDiversity : {},
    suggestions: Array.isArray(data.suggestions) ? data.suggestions.map(s => ({
      domain: s.domain || '',
      suggestion: s.suggestion || '',
      difficulty: s.difficulty || 'medium'
    })) : []
  };
}

/**
 * Sanitize competitors data for storage
 * @param {object} data - Raw competitors data
 * @returns {object} Sanitized data
 */
function sanitizeCompetitors(data) {
  return {
    summary: {
      competitors: safeGet(data, 'summary.competitors', 0),
      scrapedCompetitors: safeGet(data, 'summary.scrapedCompetitors', 0),
      linkOpportunities: safeGet(data, 'summary.linkOpportunities', 0),
      contentGaps: safeGet(data, 'summary.contentGaps', 0),
      keywordGaps: safeGet(data, 'summary.keywordGaps', 0)
    },
    competitors: Array.isArray(data.competitors) ? data.competitors.filter(c => typeof c === 'string') : [],
    competitorData: Array.isArray(data.competitorData) ? data.competitorData.map(cd => ({
      url: cd.url || '',
      headings: Array.isArray(cd.headings) ? cd.headings.filter(h => typeof h === 'string') : [],
      outboundLinks: Array.isArray(cd.outboundLinks) ? cd.outboundLinks.filter(l => typeof l === 'string') : [],
      wordCount: safeGet(cd, 'wordCount', 0),
      headingCount: safeGet(cd, 'headingCount', 0)
    })) : [],
    linkOpportunities: Array.isArray(data.linkOpportunities) ? data.linkOpportunities.map(lo => ({
      competitor: lo.competitor || '',
      link: lo.link || '',
      isExternal: lo.isExternal === true
    })) : [],
    contentGaps: Array.isArray(data.contentGaps) ? data.contentGaps.filter(g => typeof g === 'string') : [],
    keywordGaps: Array.isArray(data.keywordGaps) ? data.keywordGaps.filter(g => typeof g === 'string') : []
  };
}

/**
 * Sanitize content analysis data for storage
 * @param {object} data - Raw content data
 * @returns {object} Sanitized data
 */
function sanitizeContent(data) {
  return {
    summary: {
      wordCount: safeGet(data, 'summary.wordCount', 0),
      headingCount: safeGet(data, 'summary.headingCount', 0),
      keywordsFound: safeGet(data, 'summary.keywordsFound', 0),
      schemaMarkup: safeGet(data, 'summary.schemaMarkup', 0),
      contentQualityScore: safeGet(data, 'summary.contentQualityScore', '0%')
    },
    headings: {
      h1: Array.isArray(safeGet(data, 'headings.h1')) ? data.headings.h1 : [],
      h2: Array.isArray(safeGet(data, 'headings.h2')) ? data.headings.h2 : [],
      h3: Array.isArray(safeGet(data, 'headings.h3')) ? data.headings.h3 : [],
      total: safeGet(data, 'headings.total', 0)
    },
    wordCount: safeGet(data, 'wordCount', 0),
    keywords: Array.isArray(data.keywords) ? data.keywords.map(k => ({
      word: k.word || k || '',
      frequency: k.frequency || 0
    })) : [],
    schema: Array.isArray(data.schema) ? data.schema.slice(0, 5) : [],
    contentQuality: {
      hasH1: safeGet(data, 'contentQuality.hasH1', false),
      h1Count: safeGet(data, 'contentQuality.h1Count', 0),
      hasMetaDescription: safeGet(data, 'contentQuality.hasMetaDescription', false),
      hasCanonical: safeGet(data, 'contentQuality.hasCanonical', false),
      hasOGTags: safeGet(data, 'contentQuality.hasOGTags', false),
      imageCount: safeGet(data, 'contentQuality.imageCount', 0),
      linkCount: safeGet(data, 'contentQuality.linkCount', 0),
      quality: parseFloat(safeGet(data, 'contentQuality.quality', 0)) || 0
    },
    aiRecommendations: Array.isArray(data.aiRecommendations) ? data.aiRecommendations.map(ar => ({
      type: ar.type || 'suggestion',
      suggestion: ar.suggestion || '',
      priority: ar.priority || 'medium'
    })) : []
  };
}

/**
 * Format response data for frontend display
 * @param {object} result - MongoDB result document
 * @returns {object} Formatted response
 */
function formatResponseData(result) {
  if (!result) {
    return null;
  }

  return {
    id: result._id,
    url: result.url,
    analysisDate: result.analysisDate,
    status: result.status,
    processingTime: result.processingTime,
    
    internalLinks: result.internalLinks ? {
      summary: result.internalLinks.summary || {},
      pages: result.internalLinks.pages || [],
      orphanPages: result.internalLinks.orphanPages || [],
      linkDepth: result.internalLinks.linkDepth || {},
      anchorDiversity: result.internalLinks.anchorDiversity || {},
      suggestions: (result.internalLinks.suggestions || []).slice(0, 10) // Top 10 suggestions
    } : null,
    
    backlinks: result.backlinks ? {
      summary: result.backlinks.summary || {},
      backlinks: (result.backlinks.backlinks || []).slice(0, 50), // Top 50
      referringDomains: (result.backlinks.referringDomains || []).slice(0, 30), // Top 30
      backlinkScores: (result.backlinks.backlinkScores || []).slice(0, 20),
      suggestions: (result.backlinks.suggestions || []).slice(0, 10)
    } : null,
    
    competitors: result.competitors ? {
      summary: result.competitors.summary || {},
      competitors: (result.competitors.competitors || []).slice(0, 10),
      competitorData: (result.competitors.competitorData || []).slice(0, 5),
      linkOpportunities: (result.competitors.linkOpportunities || []).slice(0, 20),
      contentGaps: (result.competitors.contentGaps || []).slice(0, 15),
      keywordGaps: (result.competitors.keywordGaps || []).slice(0, 15)
    } : null,
    
    content: result.content ? {
      summary: result.content.summary || {},
      headings: result.content.headings || { h1: [], h2: [], h3: [], total: 0 },
      wordCount: result.content.wordCount || 0,
      keywords: (result.content.keywords || []).slice(0, 20), // Top 20 keywords
      schema: (result.content.schema || []).slice(0, 3),
      contentQuality: result.content.contentQuality || {},
      aiRecommendations: (result.content.aiRecommendations || []).slice(0, 5)
    } : null,
    
    errors: result.errors || []
  };
}

/**
 * Generate summary stats for dashboard
 * @param {object} result - MongoDB result document
 * @returns {object} Summary statistics
 */
function generateSummaryStats(result) {
  return {
    url: result.url,
    analysisDate: result.analysisDate,
    internalLinks: {
      totalPages: safeGet(result, 'internalLinks.summary.totalPages', 0),
      orphanPages: safeGet(result, 'internalLinks.summary.orphanPages', 0)
    },
    backlinks: {
      totalBacklinks: safeGet(result, 'backlinks.summary.totalBacklinks', 0),
      referringDomains: safeGet(result, 'backlinks.summary.referringDomains', 0)
    },
    competitors: {
      competitors: safeGet(result, 'competitors.summary.competitors', 0),
      contentGaps: safeGet(result, 'competitors.summary.contentGaps', 0)
    },
    content: {
      wordCount: safeGet(result, 'content.summary.wordCount', 0),
      contentQualityScore: safeGet(result, 'content.summary.contentQualityScore', '0%')
    }
  };
}

/**
 * Check if value is a plain object
 * @param {*} obj - Value to check
 * @returns {boolean} Is plain object
 */
function isObject(obj) {
  return obj !== null && typeof obj === 'object' && !(obj instanceof Array) && !(obj instanceof Date);
}

module.exports = {
  safeGet,
  sanitizeInternalLinks,
  sanitizeBacklinks,
  sanitizeCompetitors,
  sanitizeContent,
  formatResponseData,
  generateSummaryStats,
  isObject
};
