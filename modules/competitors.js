// Modular entry for Competitors
const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Analyze competitors: detect top SERP competitors, scrape content/backlinks, identify gaps.
 * @param {string} url - Website URL
 * @param {array} keywords - Target keywords
 * @param {object} options - { depth, concurrency }
 * @returns {object} Competitor report
 */
async function analyzeCompetitors(url, keywords = [], options = {}) {
  const serpApiKey = process.env.SERPAPI_KEY;
  const competitors = [];
  const competitorData = [];
  const keywordGaps = [];
  const contentGaps = [];
  const linkOpportunities = [];
  const errors = [];

  try {
    new URL(url); // Validate URL
  } catch (err) {
    throw new Error(`Invalid URL: ${url}`);
  }

  // SERP API: Find top competitors for keywords
  if (!serpApiKey && keywords.length === 0) {
    return {
      summary: { competitors: 0, linkOpportunities: 0, contentGaps: 0 },
      competitors: [],
      competitorData: [],
      linkOpportunities: [],
      contentGaps: [],
      keywordGaps: [],
      errors: ['SERP API key not configured and no keywords provided']
    };
  }

  if (serpApiKey && keywords.length > 0) {
    for (const kw of keywords.slice(0, 5)) { // Limit to 5 keywords to save API calls
      try {
        const serpApiResp = await axios.get('https://serpapi.com/search', {
          params: {
            api_key: serpApiKey,
            q: kw,
            engine: 'google',
            num: 10
          },
          timeout: 15000
        });

        const results = serpApiResp.data.organic_results || [];
        results.forEach((result, index) => {
          if (result.link && result.link !== url && !competitors.includes(result.link)) {
            competitors.push(result.link);
          }
        });
      } catch (err) {
        errors.push(`SERP error for keyword "${kw}": ${err.message}`);
      }
    }
  }

  // Scrape competitor content & backlinks (limit to top 5 competitors)
  for (const compUrl of competitors.slice(0, 5)) {
    try {
      const resp = await axios.get(compUrl, { timeout: 10000 });
      const $ = cheerio.load(resp.data);
      
      const headings = [];
      $('h1,h2,h3,h4,h5,h6').each((_, el) => {
        const text = $(el).text().trim();
        if (text.length > 0) headings.push(text);
      });
      
      const outboundLinks = [];
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (href && href.startsWith('http')) outboundLinks.push(href);
      });
      
      const wordCount = $('body').text().split(/\s+/).length;
      
      competitorData.push({
        url: compUrl,
        headings: headings.slice(0, 20),
        outboundLinks: Array.from(new Set(outboundLinks)).slice(0, 50),
        wordCount,
        headingCount: headings.length
      });
      
      // Link opportunities: outbound links not pointing to user site
      outboundLinks.forEach(link => {
        try {
          if (!link.includes(new URL(url).hostname)) {
            linkOpportunities.push({
              competitor: compUrl,
              link,
              isExternal: true
            });
          }
        } catch {}
      });
      
      // Content gaps: topics from competitors
      headings.forEach(h => {
        if (h.length > 0 && !contentGaps.includes(h)) {
          contentGaps.push(h);
        }
      });
    } catch (err) {
      errors.push(`Failed to scrape ${compUrl}: ${err.message}`);
    }
  }

  // Keyword gaps: missing from user keywords but found in competitors
  contentGaps.forEach(gap => {
    const normalized = gap.toLowerCase();
    const found = keywords.some(k => normalized.includes(k.toLowerCase()) || k.toLowerCase().includes(normalized));
    if (!found && gap.length > 3) {
      keywordGaps.push(gap);
    }
  });

  return {
    summary: {
      competitors: competitors.length,
      scrapedCompetitors: competitorData.length,
      linkOpportunities: linkOpportunities.length,
      contentGaps: contentGaps.length,
      keywordGaps: keywordGaps.length
    },
    competitors: competitors.slice(0, 10),
    competitorData: competitorData.slice(0, 5),
    linkOpportunities: linkOpportunities.slice(0, 30),
    contentGaps: Array.from(new Set(contentGaps)).slice(0, 20),
    keywordGaps: Array.from(new Set(keywordGaps)).slice(0, 20),
    errors: errors.length > 0 ? errors : undefined
  };
}

module.exports = {
  analyzeCompetitors
};
