/**
 * SerpApi Service - SERP-Driven SEO Intelligence
 * 
 * Fetches Google SERP data to build:
 * - SERP visibility metrics
 * - Backlink estimation (via site: queries)
 * - Competitor analysis
 * - Keyword ranking tracking
 */

const axios = require('axios');

const SERPAPI_URL = 'https://serpapi.com/search';
const SERPAPI_KEY = process.env.SERPAPI_KEY;
const CACHE_TTL = 3600000; // 1 hour cache

// Simple in-memory cache
const SerpApiCache = new Map();

function getCacheKey(query, location) {
  return `${query}|${location}`.toLowerCase();
}

function getFromCache(key) {
  const entry = SerpApiCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    SerpApiCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  SerpApiCache.set(key, { data, timestamp: Date.now() });
}

/**
 * Fetch organic SERP results from Google via SerpApi
 */
async function fetchSerpResults(query, options = {}) {
  try {
    const location = options.location || 'United States';
    const language = options.language || 'en';
    const resultsCount = options.resultsCount || 100;

    const cacheKey = getCacheKey(query, location);
    const cached = getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    const params = {
      q: query,
      api_key: SERPAPI_KEY,
      engine: 'google',
      location: location,
      hl: language,
      num: Math.min(resultsCount, 100),
      output: 'json'
    };

    const response = await axios.get(SERPAPI_URL, { params, timeout: 15000 });
    
    const results = {
      query: query,
      location: location,
      organic_results: (response.data.organic_results || []).map(r => ({
        position: r.position,
        url: r.link,
        title: r.title,
        snippet: r.snippet,
        domain: extractDomain(r.link)
      })),
      related_searches: (response.data.related_searches || []).map(s => s.query),
      people_also_ask: (response.data.people_also_ask || []).map(p => ({
        question: p.question,
        snippet: p.snippet,
        url: p.link
      })),
      total_results: response.data.search_information?.total_results || 0,
      fetch_time: new Date().toISOString()
    };

    setCache(cacheKey, results);
    return results;
  } catch (error) {
    console.error('SerpApi fetch error:', error.message);
    return {
      query: query,
      error: error.message,
      organic_results: [],
      related_searches: [],
      people_also_ask: []
    };
  }
}

/**
 * Extract domain from URL
 */
function extractDomain(url) {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return url;
  }
}

/**
 * Estimate backlinks using SERP-based approach
 * Queries: "site:domain.com", "domain.com", "domain.com -site:domain.com"
 */
async function estimateBacklinks(targetDomain, options = {}) {
  try {
    const location = options.location || 'United States';
    const language = options.language || 'en';

    // Query 1: site:domain.com (all indexed pages)
    const siteQuery = await fetchSerpResults(`site:${targetDomain}`, {
      location,
      language,
      resultsCount: 100
    });

    // Query 2: domain.com (mentions)
    const domainQuery = await fetchSerpResults(`"${targetDomain}"`, {
      location,
      language,
      resultsCount: 100
    });

    // Query 3: External mentions (domain not on own site)
    const externalQuery = await fetchSerpResults(`"${targetDomain}" -site:${targetDomain}`, {
      location,
      language,
      resultsCount: 100
    });

    // Extract referring domains
    const referringDomains = new Set();
    const domainMentions = {};

    externalQuery.organic_results.forEach(result => {
      const domain = extractDomain(result.url);
      if (domain !== targetDomain) {
        referringDomains.add(domain);
        domainMentions[domain] = (domainMentions[domain] || 0) + 1;
      }
    });

    // Sort by frequency
    const topReferrers = Object.entries(domainMentions)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20)
      .map(([domain, count]) => ({ domain, mention_count: count }));

    // Estimate backlink score
    const estimatedReferringDomains = referringDomains.size;
    const totalMentions = externalQuery.organic_results.length;
    const averageMentionsPerDomain = estimatedReferringDomains > 0 
      ? (totalMentions / estimatedReferringDomains).toFixed(2) 
      : 0;

    // Confidence: based on data quantity
    const confidence = totalMentions > 50 ? 'high' : totalMentions > 20 ? 'medium' : 'low';

    // Calculate backlink score (0-100)
    // Formula: referring domains (40%) + mention frequency (30%) + diversity (30%)
    const domainScore = Math.min(100, (estimatedReferringDomains / 100) * 100);
    const mentionScore = Math.min(100, (totalMentions / 1000) * 100);
    const diversityScore = Math.min(100, (topReferrers.length / 20) * 100);
    const backlinkScore = Math.round((domainScore * 0.4) + (mentionScore * 0.3) + (diversityScore * 0.3));

    return {
      estimated_referring_domains: estimatedReferringDomains,
      total_estimated_backlinks: totalMentions,
      average_mentions_per_domain: parseFloat(averageMentionsPerDomain),
      top_referring_domains: topReferrers,
      confidence_level: confidence,
      backlink_score: backlinkScore,
      data_sources: ['Google SERP via SerpApi'],
      note: 'This is SERP-estimated backlink data, not a complete backlink graph'
    };
  } catch (error) {
    console.error('Backlink estimation error:', error.message);
    return {
      estimated_referring_domains: 0,
      total_estimated_backlinks: 0,
      confidence_level: 'error',
      backlink_score: 0,
      error: error.message
    };
  }
}

/**
 * Find competitor domains in SERP for target keywords
 */
async function discoverCompetitors(keywords, options = {}) {
  try {
    const location = options.location || 'United States';
    const language = options.language || 'en';

    const competitorMap = {};
    const allRankingUrls = [];

    // Fetch SERP for each keyword
    for (const keyword of keywords) {
      const serpResults = await fetchSerpResults(keyword, {
        location,
        language,
        resultsCount: 100
      });

      // Extract top 20 domains
      serpResults.organic_results.slice(0, 20).forEach(result => {
        const domain = extractDomain(result.url);
        
        if (!competitorMap[domain]) {
          competitorMap[domain] = {
            domain,
            keyword_appearances: 0,
            keywords: [],
            top_position: result.position,
            urls: []
          };
        }

        competitorMap[domain].keyword_appearances++;
        competitorMap[domain].keywords.push(keyword);
        competitorMap[domain].top_position = Math.min(competitorMap[domain].top_position, result.position);
        competitorMap[domain].urls.push(result.url);
        allRankingUrls.push(result.url);
      });
    }

    // Sort by appearance frequency
    const sortedCompetitors = Object.values(competitorMap)
      .sort((a, b) => b.keyword_appearances - a.keyword_appearances)
      .slice(0, 15);

    // Calculate SERP dominance score
    const totalKeywords = keywords.length;
    const totalPossiblePositions = totalKeywords * 20; // Top 20 results per keyword
    const competitorPositionsCount = Object.values(competitorMap).reduce(
      (sum, c) => sum + c.keyword_appearances,
      0
    );
    const serpDominanceScore = Math.round((competitorPositionsCount / totalPossiblePositions) * 100);

    return {
      keywords_analyzed: keywords,
      top_competitors: sortedCompetitors,
      competitor_count: Object.keys(competitorMap).length,
      serp_dominance_score: serpDominanceScore,
      unique_ranking_urls: new Set(allRankingUrls).size
    };
  } catch (error) {
    console.error('Competitor discovery error:', error.message);
    return {
      keywords_analyzed: keywords,
      top_competitors: [],
      competitor_count: 0,
      serp_dominance_score: 0,
      error: error.message
    };
  }
}

/**
 * Analyze SERP visibility for a domain
 */
async function analyzeSerpVisibility(targetDomain, keywords, options = {}) {
  try {
    const location = options.location || 'United States';
    const language = options.language || 'en';

    const rankingData = {
      rankings: [],
      ranked_keywords: [],
      top_ranking_urls: new Set(),
      average_position: 0
    };

    // Check each keyword
    for (const keyword of keywords) {
      const serpResults = await fetchSerpResults(keyword, {
        location,
        language,
        resultsCount: 100
      });

      // Find target domain in results
      const domainResult = serpResults.organic_results.find(r => 
        extractDomain(r.url) === targetDomain
      );

      if (domainResult) {
        rankingData.rankings.push({
          keyword,
          position: domainResult.position,
          title: domainResult.title,
          snippet: domainResult.snippet,
          url: domainResult.url
        });
        rankingData.ranked_keywords.push(keyword);
        rankingData.top_ranking_urls.add(domainResult.url);
      }
    }

    // Calculate average position
    if (rankingData.rankings.length > 0) {
      rankingData.average_position = Math.round(
        rankingData.rankings.reduce((sum, r) => sum + r.position, 0) / rankingData.rankings.length
      );
    }

    // Calculate visibility score
    // Formula: keyword ranking rate (50%) + average position (50%)
    const rankingRate = (rankingData.ranked_keywords.length / keywords.length) * 100;
    const positionScore = Math.max(0, 100 - (rankingData.average_position || 100));
    const visibilityScore = Math.round((rankingRate * 0.5) + (positionScore * 0.5));

    return {
      keywords_to_rank: keywords.length,
      keywords_ranking: rankingData.ranked_keywords,
      ranking_urls: Array.from(rankingData.top_ranking_urls),
      rankings: rankingData.rankings,
      average_position: rankingData.average_position,
      visibility_score: visibilityScore
    };
  } catch (error) {
    console.error('SERP visibility analysis error:', error.message);
    return {
      keywords_to_rank: keywords.length,
      keywords_ranking: [],
      ranking_urls: [],
      rankings: [],
      average_position: 0,
      visibility_score: 0,
      error: error.message
    };
  }
}

/**
 * Get related searches and keyword insights
 */
async function getKeywordInsights(keyword, options = {}) {
  try {
    const location = options.location || 'United States';
    const language = options.language || 'en';

    const serpResults = await fetchSerpResults(keyword, {
      location,
      language,
      resultsCount: 100
    });

    return {
      keyword,
      related_searches: serpResults.related_searches,
      top_organic_results: serpResults.organic_results.slice(0, 10),
      people_also_ask: serpResults.people_also_ask,
      total_results: serpResults.total_results
    };
  } catch (error) {
    console.error('Keyword insights error:', error.message);
    return {
      keyword,
      related_searches: [],
      top_organic_results: [],
      people_also_ask: [],
      error: error.message
    };
  }
}

module.exports = {
  fetchSerpResults,
  estimateBacklinks,
  discoverCompetitors,
  analyzeSerpVisibility,
  getKeywordInsights
};
