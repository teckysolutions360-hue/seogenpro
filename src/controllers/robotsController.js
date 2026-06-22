const robotsService = require('../services/robotsService');
const { validateUrl } = require('../utils/validators');

exports.generateRobotsTxt = async (req, res) => {
  try {
    const { 
      url, 
      userAgents = [{ name: '*', disallow: [], allow: [] }],
      sitemapUrl,
      crawlDelay,
      additionalRules = []
    } = req.body;

    // Validate input
    if (!url || !validateUrl(url)) {
      return res.status(400).json({ error: 'Valid URL is required' });
    }

    // Generate robots.txt content
    const robotsContent = robotsService.generateRobotsTxt({
      url,
      userAgents,
      sitemapUrl,
      crawlDelay,
      additionalRules
    });

    // Optional: Fetch existing robots.txt for comparison
    let existingRobots = null;
    try {
      existingRobots = await robotsService.fetchExistingRobots(url);
    } catch (error) {
      // Silently fail - existing robots.txt might not exist
    }

    res.json({
      success: true,
      content: robotsContent,
      existing: existingRobots,
      downloadUrl: `/api/download/robots?content=${encodeURIComponent(robotsContent)}`,
      warnings: existingRobots ? robotsService.compareWithExisting(robotsContent, existingRobots) : []
    });

  } catch (error) {
    console.error('Robots generation error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.validateRobotsTxt = async (req, res) => {
  try {
    const { content } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: 'Robots.txt content is required' });
    }

    const validation = robotsService.validateRobotsTxt(content);
    
    res.json({
      valid: validation.valid,
      errors: validation.errors,
      warnings: validation.warnings,
      parsed: validation.parsed
    });

  } catch (error) {
    console.error('Robots validation error:', error);
    res.status(500).json({ error: error.message });
  }
};