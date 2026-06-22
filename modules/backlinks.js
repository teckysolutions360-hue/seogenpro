// Modular entry for Backlinks
const axios = require('axios');

/**
 * Analyze backlinks using SERP API and Scrape.do for competitor backlinks.
 * @param {string} url - Website URL
 * @param {object} options - { depth, concurrency }
 * @returns {object} Backlink report
 */
async function analyzeBacklinks(url, options = {}) {
  const serpApiKey = process.env.SERPAPI_KEY;
  const backlinks = [];
  const referringDomains = new Set();
  const anchorTexts = {};
  const brokenLinks = [];
  const errors = [];

  try {
    new URL(url); // Validate URL
  } catch (err) {
    throw new Error(`Invalid URL: ${url}`);
  }

  // SERP API: Basic backlink estimation
  let serpApiResults = [];
  if (serpApiKey) {
    try {
      const domain = new URL(url).hostname;
      const serpApiResp = await axios.get('https://serpapi.com/search', {
        params: {
          api_key: serpApiKey,
          q: `link:${domain}`,
          engine: 'google',
          num: 50
        },
        timeout: 15000
      });
      
      serpApiResults = serpApiResp.data.organic_results || [];
      serpApiResults.forEach(result => {
        if (result.link && result.link !== url) {
          backlinks.push({
            source: result.link,
            title: result.title || '',
            snippet: result.snippet || '',
            position: result.position || 0,
            type: 'serpapi',
            timestamp: new Date().toISOString()
          });
          
          try {
            const domain = new URL(result.link).hostname;
            referringDomains.add(domain);
          } catch {}
          
          anchorTexts[result.link] = [result.title || ''];
        }
      });
    } catch (err) {
      errors.push(`SERP API error: ${err.message}`);
    }
  } else {
    errors.push('SERP API key not configured');
  }

  // Analyze backlink quality (simple heuristic based on SERP position)
  const backlinkScores = backlinks.map(bl => ({
    source: bl.source,
    score: Math.max(1, 10 - (bl.position || 0) / 10), // Higher position = higher authority assumption
    quality: (bl.position || 0) < 5 ? 'high' : (bl.position || 0) < 20 ? 'medium' : 'low'
  }));

  // Anchor text diversity
  const anchorDiversity = {};
  Object.keys(anchorTexts).forEach(link => {
    const unique = Array.from(new Set(anchorTexts[link].filter(a => a && a.length > 0)));
    anchorDiversity[link] = {
      count: unique.length,
      anchors: unique.slice(0, 10)
    };
  });

  // Suggestions for new link acquisition
  const suggestions = Array.from(referringDomains).slice(0, 20).map(domain => ({
    domain,
    suggestion: `Consider outreach to ${domain} for new backlinks or partnership opportunities.`,
    difficulty: 'medium'
  }));

  return {
    summary: {
      totalBacklinks: backlinks.length,
      referringDomains: referringDomains.size,
      brokenLinks: brokenLinks.length,
      averageScore: backlinkScores.length > 0 
        ? (backlinkScores.reduce((sum, b) => sum + b.score, 0) / backlinkScores.length).toFixed(2)
        : 0
    },
    backlinks: backlinks.slice(0, 100), // Return top 100
    referringDomains: Array.from(referringDomains).sort(),
    brokenLinks,
    backlinkScores: backlinkScores.slice(0, 100),
    anchorDiversity,
    suggestions,
    errors: errors.length > 0 ? errors : undefined
  };
}

module.exports = {
  analyzeBacklinks
};
