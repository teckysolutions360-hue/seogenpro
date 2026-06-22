/**
 * Pro robots.txt Validator
 * 
 * Validates robots.txt structure and detects:
 * - Sitemap URL format issues
 * - Malformed URLs
 * - Conflicting rules
 * - Crawl-delay misconfigurations
 * - Indexable admin/login/cart pages
 * 
 * Returns dynamic score (0-100) with detailed breakdown
 */

const axios = require('axios');

class RobotsValidator {
  constructor() {
    this.baseScore = 100;
    this.CRITICAL_PENALTY = 20;
    this.WARNING_PENALTY = 10;
    this.MINOR_PENALTY = 5;
    
    // Pages that should ALWAYS be disallowed
    this.adminPages = [
      '/admin',
      '/login',
      '/logout',
      '/cart',
      '/checkout',
      '/account',
      '/dashboard',
      '/settings',
      '/user',
      '/wp-admin',
      '/wp-login',
      '/api/v',
      '/api/admin'
    ];
  }

  /**
   * Main validation method
   */
  async validate(robotsContent, baseUrl) {
    const parsed = this.parseRobots(robotsContent);
    const errors = [];
    const warnings = [];
    const improvements = [];
    let score = this.baseScore;

    // 1. Validate sitemap URLs
    const sitemapIssues = this.validateSitemaps(parsed.sitemaps, baseUrl);
    errors.push(...sitemapIssues.errors);
    warnings.push(...sitemapIssues.warnings);
    score -= sitemapIssues.errors.length * this.CRITICAL_PENALTY;
    score -= sitemapIssues.warnings.length * this.WARNING_PENALTY;

    // 2. Detect conflicting rules
    const conflictIssues = this.detectConflicts(parsed);
    errors.push(...conflictIssues.errors);
    warnings.push(...conflictIssues.warnings);
    score -= conflictIssues.errors.length * this.CRITICAL_PENALTY;
    score -= conflictIssues.warnings.length * this.WARNING_PENALTY;

    // 3. Check for crawl-delay misuse
    const crawlDelayIssues = this.validateCrawlDelay(parsed);
    warnings.push(...crawlDelayIssues.warnings);
    improvements.push(...crawlDelayIssues.improvements);
    score -= crawlDelayIssues.warnings.length * this.WARNING_PENALTY;

    // 4. Check if admin/login/cart are disallowed
    const adminIssues = this.validateAdminPages(parsed, baseUrl);
    warnings.push(...adminIssues.warnings);
    improvements.push(...adminIssues.improvements);
    score -= adminIssues.warnings.length * this.CRITICAL_PENALTY; // critical for SEO

    // 5. Structure validation
    const structureIssues = this.validateStructure(parsed, robotsContent);
    warnings.push(...structureIssues.warnings);
    improvements.push(...structureIssues.improvements);
    score -= structureIssues.warnings.length * this.MINOR_PENALTY;

    // 6. Best practices
    const bpIssues = this.checkBestPractices(parsed);
    improvements.push(...bpIssues.improvements);

    // Ensure score stays within bounds
    score = Math.max(0, Math.min(this.baseScore, score));

    return {
      score: Math.round(score),
      baseScore: this.baseScore,
      errors: errors.filter(e => e), // Remove nulls
      warnings: warnings.filter(w => w),
      improvements: improvements.filter(i => i),
      summary: this.generateSummary(errors, warnings, improvements, score),
      parsed: {
        userAgents: parsed.userAgents,
        disallowCount: parsed.disallow.length,
        allowCount: parsed.allow.length,
        sitemaps: parsed.sitemaps.length,
        crawlDelays: parsed.crawlDelays.length
      }
    };
  }

  /**
   * Parse robots.txt content
   */
  parseRobots(content) {
    const lines = (content || '').split(/\r?\n/);
    const result = {
      userAgents: [],
      disallow: [],
      allow: [],
      sitemaps: [],
      crawlDelays: [],
      rawLines: lines.length
    };

    let currentAgent = '*';

    for (const line of lines) {
      const trimmed = line.split('#')[0].trim(); // Remove comments
      if (!trimmed) continue;

      const [key, ...valueParts] = trimmed.split(':');
      if (!valueParts.length) continue;

      const k = key.trim().toLowerCase();
      const v = valueParts.join(':').trim();

      if (k === 'user-agent') {
        currentAgent = v;
        if (!result.userAgents.includes(v)) {
          result.userAgents.push(v);
        }
      } else if (k === 'disallow') {
        result.disallow.push({ agent: currentAgent, path: v });
      } else if (k === 'allow') {
        result.allow.push({ agent: currentAgent, path: v });
      } else if (k === 'sitemap') {
        result.sitemaps.push(v);
      } else if (k === 'crawl-delay') {
        result.crawlDelays.push({ agent: currentAgent, delay: v });
      }
    }

    return result;
  }

  /**
   * Validate sitemap URLs
   */
  validateSitemaps(sitemaps, baseUrl) {
    const errors = [];
    const warnings = [];

    if (!sitemaps || sitemaps.length === 0) {
      warnings.push('⚠️ No sitemap URLs found in robots.txt. Add: Sitemap: https://domain.com/sitemap.xml');
      return { errors, warnings };
    }

    let baseDomain = '';
    try {
      baseDomain = new URL(baseUrl).origin;
    } catch (e) {
      baseDomain = baseUrl;
    }

    for (const sitemap of sitemaps) {
      // Check if URL is valid
      try {
        new URL(sitemap);
      } catch (e) {
        errors.push(`❌ Malformed sitemap URL: "${sitemap}" (not a valid URL)`);
        continue;
      }

      // Check if sitemap is absolute URL
      if (!sitemap.startsWith('http')) {
        errors.push(`❌ Sitemap URL must be absolute: "${sitemap}" should start with http:// or https://`);
      }

      // Check if sitemap domain matches base domain
      try {
        const sitemapUrl = new URL(sitemap);
        const baseUrl2 = new URL(baseUrl);
        
        if (sitemapUrl.origin !== baseUrl2.origin) {
          errors.push(`❌ Sitemap on different domain: "${sitemapUrl.origin}" vs "${baseUrl2.origin}"`);
        }

        // Check for common malformed patterns
        if (sitemap.includes('.sitemap.xml') && !sitemap.endsWith('.xml')) {
          errors.push(`❌ Malformed sitemap path: "${sitemap}" - looks like it has .sitemap.xml in wrong place`);
        }

        // Check if sitemap.xml is in the path
        if (!sitemap.includes('sitemap')) {
          warnings.push(`⚠️ Sitemap path doesn't contain "sitemap": "${sitemap}" - may be unintentional`);
        }
      } catch (e) {
        errors.push(`❌ Sitemap URL parsing failed: "${sitemap}"`);
      }
    }

    if (errors.length === 0 && warnings.length === 0) {
      // Validate sitemap format (basic check)
      if (sitemaps.some(s => s.endsWith('.xml'))) {
        // Likely valid XML sitemap
      } else {
        warnings.push('⚠️ Sitemap URLs don\'t end in .xml - verify they are valid XML sitemaps');
      }
    }

    return { errors, warnings };
  }

  /**
   * Detect conflicting rules
   */
  detectConflicts(parsed) {
    const errors = [];
    const warnings = [];

    // Find allow/disallow conflicts for same agent
    const byAgent = {};
    for (const d of parsed.disallow) {
      if (!byAgent[d.agent]) byAgent[d.agent] = { disallow: [], allow: [] };
      byAgent[d.agent].disallow.push(d.path);
    }
    for (const a of parsed.allow) {
      if (!byAgent[a.agent]) byAgent[a.agent] = { disallow: [], allow: [] };
      byAgent[a.agent].allow.push(a.path);
    }

    for (const [agent, rules] of Object.entries(byAgent)) {
      for (const path of rules.disallow) {
        if (rules.allow.includes(path)) {
          warnings.push(`⚠️ Conflicting rules for ${agent}: both allow and disallow "${path}"`);
        }
      }
    }

    // Check if everything is disallowed (likely mistake)
    const wildcardDisallowed = parsed.disallow.some(d => d.path === '/' || d.path === '/*');
    if (wildcardDisallowed && parsed.disallow.length > 1) {
      errors.push('❌ Found "Disallow: /" or "Disallow: /*" which blocks entire site - this is likely a mistake');
    }

    // Check for overly permissive allow
    if (parsed.disallow.length === 0 && parsed.allow.length > 0) {
      warnings.push('⚠️ Only "Allow" rules found, no "Disallow" rules - robots.txt may be incomplete');
    }

    return { errors, warnings };
  }

  /**
   * Validate crawl-delay usage
   */
  validateCrawlDelay(parsed) {
    const warnings = [];
    const improvements = [];

    if (parsed.crawlDelays.length > 0) {
      for (const cd of parsed.crawlDelays) {
        const delay = parseFloat(cd.delay);
        if (isNaN(delay)) {
          warnings.push(`⚠️ Invalid Crawl-delay value for ${cd.agent}: "${cd.delay}" (must be numeric)`);
        } else if (delay > 10) {
          warnings.push(`⚠️ Very high Crawl-delay for ${cd.agent}: ${delay}s (may slow Google crawling)`);
        }
      }
    }

    return { warnings, improvements };
  }

  /**
   * Check if admin/login/cart pages are properly disallowed
   */
  validateAdminPages(parsed, baseUrl) {
    const warnings = [];
    const improvements = [];

    const disallowedPaths = new Set();
    for (const d of parsed.disallow) {
      disallowedPaths.add(d.path.toLowerCase());
    }

    const missingProtections = [];
    for (const adminPage of this.adminPages) {
      if (!disallowedPaths.has(adminPage) && !disallowedPaths.has(adminPage + '*')) {
        missingProtections.push(adminPage);
      }
    }

    if (missingProtections.length > 0) {
      warnings.push(`⚠️ SEO RISK: System pages not blocked in robots.txt: ${missingProtections.join(', ')}`);
      improvements.push(`✓ Add to robots.txt: Disallow: /admin Disallow: /login Disallow: /cart Disallow: /checkout`);
    }

    return { warnings, improvements };
  }

  /**
   * Validate robots.txt structure
   */
  validateStructure(parsed, rawContent) {
    const warnings = [];
    const improvements = [];

    // Check if file is too short (likely incomplete)
    if (rawContent && rawContent.trim().length < 20) {
      warnings.push('⚠️ robots.txt is very short - may be incomplete');
    }

    // Check for multiple User-agent sections
    if (parsed.userAgents.length === 0) {
      warnings.push('⚠️ No User-agent found in robots.txt');
    }

    // Check for common format errors
    if (rawContent && rawContent.includes('Disallow:  ')) {
      improvements.push('✓ Found extra spaces in "Disallow:" directives - clean up formatting');
    }

    if (rawContent && rawContent.includes('user-agent:')) { // lowercase
      improvements.push('✓ Found lowercase "user-agent:" - robots.txt is case-insensitive but "User-agent:" is standard');
    }

    return { warnings, improvements };
  }

  /**
   * Check best practices
   */
  checkBestPractices(parsed) {
    const improvements = [];

    // Suggest adding sitemap if missing
    if (parsed.sitemaps.length === 0) {
      improvements.push('✓ Add Sitemap directive to robots.txt for better crawl efficiency');
    }

    // Suggest Crawl-delay if high traffic
    if (parsed.crawlDelays.length === 0) {
      improvements.push('✓ Consider adding Crawl-delay for non-commercial bots (e.g., crawlers)');
    }

    // Suggest allow rules for important paths
    if (parsed.allow.length === 0) {
      improvements.push('✓ For complex sites, use "Allow:" rules to ensure critical paths are crawled');
    }

    return { improvements };
  }

  /**
   * Generate human-readable summary
   */
  generateSummary(errors, warnings, improvements, score) {
    let text = '';
    
    if (score === 100) {
      text = '✅ robots.txt is well-configured';
    } else if (score >= 80) {
      text = '⚠️ robots.txt has minor issues';
    } else if (score >= 60) {
      text = '❌ robots.txt has significant issues';
    } else {
      text = '🔴 robots.txt has critical issues';
    }

    text += ` (Score: ${score}/100)`;
    
    if (errors.length > 0) {
      text += ` | ${errors.length} critical error${errors.length > 1 ? 's' : ''}`;
    }
    if (warnings.length > 0) {
      text += ` | ${warnings.length} warning${warnings.length > 1 ? 's' : ''}`;
    }

    return text;
  }
}

module.exports = new RobotsValidator();
