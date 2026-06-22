const axios = require('axios');
const robotsParser = require('robots-parser');

class RobotsService {
  generateRobotsTxt({ url, userAgents, sitemapUrl, crawlDelay, additionalRules }) {
    let content = `# robots.txt generated for ${url}\n`;
    content += `# Generated on: ${new Date().toISOString()}\n\n`;

    // Generate rules for each user agent
    userAgents.forEach(ua => {
      content += `User-agent: ${ua.name}\n`;
      
      if (ua.disallow && ua.disallow.length > 0) {
        ua.disallow.forEach(path => {
          content += `Disallow: ${path}\n`;
        });
      } else {
        content += `Disallow:\n`; // Allow everything
      }

      if (ua.allow && ua.allow.length > 0) {
        ua.allow.forEach(path => {
          content += `Allow: ${path}\n`;
        });
      }

      if (crawlDelay && ua.name === '*') {
        content += `Crawl-delay: ${crawlDelay}\n`;
      }

      content += '\n';
    });

    // Add additional custom rules
    if (additionalRules && additionalRules.length > 0) {
      content += '# Custom rules\n';
      additionalRules.forEach(rule => {
        content += `${rule}\n`;
      });
      content += '\n';
    }

    // Add sitemap
    if (sitemapUrl) {
      content += `Sitemap: ${sitemapUrl}\n`;
    } else {
      // Suggest standard sitemap location
      content += `# Sitemap: ${url}/sitemap.xml\n`;
    }

    // Add AI training directives (new standard for AI crawlers)
    content += '\n# AI Training Control (Optional)\n';
    content += '# Uncomment to control AI training access\n';
    content += '# User-agent: GPTBot\n';
    content += '# Disallow: /\n';
    content += '# User-agent: Claude-Web\n';
    content += '# Disallow: /\n';

    return content;
  }

  async fetchExistingRobots(url) {
    try {
      const robotsUrl = new URL('/robots.txt', url).toString();
      const response = await axios.get(robotsUrl, { timeout: 5000 });
      return response.data;
    } catch (error) {
      throw new Error('Could not fetch existing robots.txt');
    }
  }

  validateRobotsTxt(content) {
    const errors = [];
    const warnings = [];
    let parsed = null;

    // Basic syntax validation
    const lines = content.split('\n');
    lines.forEach((line, index) => {
      const trimmedLine = line.trim();
      
      // Skip comments and empty lines
      if (trimmedLine.startsWith('#') || trimmedLine === '') {
        return;
      }

      // Check for valid directives
      const validDirectives = ['user-agent', 'disallow', 'allow', 'sitemap', 'crawl-delay', 'host'];
      const directive = trimmedLine.split(':')[0].toLowerCase().trim();
      
      if (!validDirectives.includes(directive)) {
        warnings.push(`Line ${index + 1}: Unknown directive "${directive}"`);
      }

      // Check for missing colon
      if (!trimmedLine.includes(':')) {
        errors.push(`Line ${index + 1}: Missing colon in directive`);
      }
    });

    // Try to parse with official parser
    try {
      parsed = robotsParser('https://example.com', content);
    } catch (e) {
      errors.push('Invalid robots.txt syntax: ' + e.message);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      parsed: parsed ? 'Valid structure' : null
    };
  }

  compareWithExisting(generated, existing) {
    const warnings = [];
    
    if (generated !== existing) {
      warnings.push('Generated file differs from existing robots.txt');
      
      // Check for potentially problematic changes
      if (existing.includes('Disallow: /') && !generated.includes('Disallow: /')) {
        warnings.push('Warning: Removing "Disallow: /" may expose previously hidden content');
      }
    }

    return warnings;
  }
}

module.exports = new RobotsService();