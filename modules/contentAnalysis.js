// Modular entry for ContentAnalysis
const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Analyze content: extract headings, word count, keywords, schema, and AI-based recommendations.
 * @param {string} url - Website URL
 * @param {object} options - { keywords }
 * @returns {object} Content analysis report
 */
async function analyzeContent(url, options = {}) {
  let headings = [];
  let wordCount = 0;
  let keywords = [];
  let schema = [];
  let aiRecommendations = [];
  let contentQuality = {};
  const errors = [];

  try {
    new URL(url); // Validate URL
  } catch (err) {
    throw new Error(`Invalid URL: ${url}`);
  }

  try {
    const resp = await axios.get(url, { timeout: 10000 });
    const $ = cheerio.load(resp.data);
    
    // Extract headings by level
    const h1 = [];
    const h2 = [];
    const h3 = [];
    
    $('h1').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 0) h1.push(text);
    });
    $('h2').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 0) h2.push(text);
    });
    $('h3').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 0) h3.push(text);
    });
    
    headings = {
      h1: h1.slice(0, 5),
      h2: h2.slice(0, 10),
      h3: h3.slice(0, 10),
      total: h1.length + h2.length + h3.length
    };
    
    // Count words
    const text = $('body').text();
    wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
    
    // Simple keyword extraction
    const stopwords = new Set([
      'the','and','of','to','a','in','is','it','for','on','with','as','at','by','an','be',
      'are','was','that','from','or','this','but','not','have','has','had','will','can','if',
      'your','you','we','our','us','they','their','them','he','she','his','her','its','which',
      'who','what','when','where','how','why','all','any','each','few','more','most','other',
      'some','such','no','nor','too','very','one','two','up','down','out','over','under','all',
      'also','about','like','before','after','between','during','since','such','so','should'
    ]);
    
    const freq = {};
    const words = text.toLowerCase().match(/\b\w+\b/g) || [];
    words.forEach(word => {
      if (word.length > 3 && !stopwords.has(word)) {
        freq[word] = (freq[word] || 0) + 1;
      }
    });
    
    keywords = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([word, count]) => ({ word, frequency: count }));
    
    // Schema extraction: look for JSON-LD scripts
    schema = [];
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const json = JSON.parse($(el).html());
        schema.push({
          type: json['@type'] || 'Unknown',
          ...json
        });
      } catch (e) {}
    });
    
    // Content quality metrics
    const metaTags = $('meta');
    const hasMetaDescription = $('meta[name="description"]').length > 0;
    const hasCanonical = $('link[rel="canonical"]').length > 0;
    const hasOGTags = $('meta[property^="og:"]').length > 0;
    const hasImages = $('img').length;
    const hasLinks = $('a').length;
    
    contentQuality = {
      hasH1: h1.length > 0,
      h1Count: h1.length,
      hasMetaDescription,
      hasCanonical,
      hasOGTags,
      imageCount: hasImages,
      linkCount: hasLinks,
      quality: ((hasH1 ? 1 : 0) + (hasMetaDescription ? 1 : 0) + (hasCanonical ? 1 : 0) + 
                 (hasOGTags ? 1 : 0) + (hasImages > 5 ? 1 : 0)) / 5
    };
    
    // AI-based recommendations
    aiRecommendations = [];
    
    if (!h1.length) {
      aiRecommendations.push({
        type: 'critical',
        suggestion: 'Add an H1 heading to improve SEO. Each page should have exactly one H1.',
        priority: 'high'
      });
    } else if (h1.length > 1) {
      aiRecommendations.push({
        type: 'warning',
        suggestion: `You have ${h1.length} H1 headings. Best practice is to have only one H1 per page.`,
        priority: 'high'
      });
    }
    
    if (!hasMetaDescription) {
      aiRecommendations.push({
        type: 'critical',
        suggestion: 'Add a meta description (150-160 characters) to improve CTR in search results.',
        priority: 'high'
      });
    }
    
    if (wordCount < 300) {
      aiRecommendations.push({
        type: 'warning',
        suggestion: `Content is only ${wordCount} words. Target 300+ words for better SEO performance.`,
        priority: 'medium'
      });
    }
    
    if (hasImages === 0) {
      aiRecommendations.push({
        type: 'suggestion',
        suggestion: 'Add relevant images to improve user engagement and SEO.',
        priority: 'medium'
      });
    }
    
    if (!hasCanonical && url.includes('?')) {
      aiRecommendations.push({
        type: 'suggestion',
        suggestion: 'Add a canonical tag to avoid duplicate content issues with URL parameters.',
        priority: 'medium'
      });
    }
    
  } catch (err) {
    errors.push(`Failed to fetch or analyze URL: ${err.message}`);
  }

  return {
    summary: {
      wordCount,
      headingCount: headings.total,
      keywordsFound: keywords.length,
      schemaMarkup: schema.length,
      contentQualityScore: ((contentQuality.quality || 0) * 100).toFixed(0) + '%'
    },
    headings,
    wordCount,
    keywords,
    schema: schema.slice(0, 5),
    contentQuality,
    aiRecommendations,
    errors: errors.length > 0 ? errors : undefined
  };
}

module.exports = {
  analyzeContent
};
