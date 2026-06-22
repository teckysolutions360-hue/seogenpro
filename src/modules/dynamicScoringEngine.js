/**
 * Dynamic Scoring Engine v2.0
 * 
 * Issue-weighted scoring system that:
 * - NEVER returns 100 if issues exist
 * - Applies penalties based on severity
 * - Calculates realistic scores
 * - Fully explainable breakdowns
 */

class DynamicScoringEngine {
  constructor() {
    this.BASE_SCORE = 100;

    // Issue penalties (negative multipliers)
    this.PENALTIES = {
      brokenLink: 5,           // Each broken link
      missingCanonical: 3,     // Each page without canonical
      missingMetaDesc: 2,      // Each page without meta description
      duplicateTitle: 5,       // Per duplicate set
      orphanPage: 10,          // Each unreachable page
      thinContent: 2,          // Each page < 300 words
      indexableAdmin: 15,      // Each system page crawlable
      queryParamRisk: 2,       // Each page with query params
      genericAnchor: 1,        // Each generic anchor
      robotsError: 20,         // Critical robots.txt error
      robotsWarning: 10,       // Robots warning
      sitemapIssue: 15,        // Sitemap structure problem
      missingStructure: 10     // Missing critical file (sitemap/robots)
    };

    // Category weights for holistic score
    this.CATEGORY_WEIGHTS = {
      technical: 0.25,
      content: 0.20,
      structure: 0.20,
      security: 0.15,
      usability: 0.20
    };
  }

  /**
   * Main scoring method - orchestrates all analysis
   */
  calculateScore(crawlData, robotsData, sitemapData) {
    const scores = {
      technical: this.scoreTechnical(crawlData, sitemapData),
      content: this.scoreContent(crawlData),
      structure: this.scoreStructure(crawlData),
      security: this.scoreSecurity(crawlData),
      usability: this.scoreUsability(crawlData)
    };

    const weightedScore = Object.entries(scores)
      .reduce((sum, [cat, score]) => {
        return sum + (score * (this.CATEGORY_WEIGHTS[cat] || 0));
      }, 0);

    const breakdown = {
      technical: scores.technical,
      content: scores.content,
      structure: scores.structure,
      security: scores.security,
      usability: scores.usability,
      weighted: Math.round(weightedScore)
    };

    // Generate issues list
    const issues = this.extractIssues(crawlData, robotsData, sitemapData);

    // Final score: weighted average, reduced by issues
    let finalScore = breakdown.weighted;

    // If any critical issues exist, reduce score significantly
    const criticalIssues = issues.filter(i => i.severity === 'critical');
    const warningIssues = issues.filter(i => i.severity === 'warning');
    const minorIssues = issues.filter(i => i.severity === 'minor');

    if (criticalIssues.length > 0) {
      finalScore = Math.max(0, finalScore - (criticalIssues.length * 15));
    }
    if (warningIssues.length > 0) {
      finalScore = Math.max(0, finalScore - (warningIssues.length * 8));
    }
    if (minorIssues.length > 0) {
      finalScore = Math.max(0, finalScore - (Math.min(10, minorIssues.length) * 2));
    }

    // NEVER return 100 if issues exist
    if (issues.length > 0 && finalScore === 100) {
      finalScore = 95;
    }

    finalScore = Math.max(0, Math.min(100, finalScore));

    return {
      score: Math.round(finalScore),
      breakdown: breakdown,
      issues: issues,
      recommendations: this.generateRecommendations(issues),
      grade: this.getGrade(finalScore),
      explanation: this.getExplanation(finalScore, issues)
    };
  }

  /**
   * Score Technical SEO (25%)
   */
  scoreTechnical(crawlData, sitemapData) {
    let score = 100;
    const analysis = crawlData.analysis || {};

    // Broken links
    if (crawlData.stats.brokenLinksCount > 0) {
      score -= Math.min(20, crawlData.stats.brokenLinksCount * 5);
    }

    // Orphan pages
    if (analysis.orphanCount > 0) {
      score -= Math.min(15, analysis.orphanCount * 10);
    }

    // Missing canonicals
    if (analysis.missingCanonicalCount > 0) {
      score -= Math.min(12, analysis.missingCanonicalCount * 3);
    }

    // Sitemap issues
    if (sitemapData && sitemapData.errors && sitemapData.errors.length > 0) {
      score -= Math.min(10, sitemapData.errors.length * 5);
    }

    // Query parameter issues
    if (analysis.queryParamRiskCount > 0) {
      score -= Math.min(8, analysis.queryParamRiskCount * 2);
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Score Content Quality (20%)
   */
  scoreContent(crawlData) {
    let score = 100;
    const analysis = crawlData.analysis || {};

    // Missing meta descriptions
    if (analysis.missingMetaDescriptionCount > 0) {
      score -= Math.min(20, analysis.missingMetaDescriptionCount * 2);
    }

    // Duplicate titles
    const duplicateTitleCount = Object.keys(analysis.duplicateTitles || {}).length;
    if (duplicateTitleCount > 0) {
      score -= Math.min(15, duplicateTitleCount * 5);
    }

    // Thin content
    if (analysis.thinContentCount > 0) {
      score -= Math.min(10, analysis.thinContentCount * 2);
    }

    // Generic anchor text
    if (analysis.genericAnchorCount > 0) {
      score -= Math.min(8, analysis.genericAnchorCount * 1);
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Score Structure & Navigation (20%)
   */
  scoreStructure(crawlData) {
    let score = 100;
    const analysis = crawlData.analysis || {};

    // Depth distribution - pages too deep
    const depthDist = analysis.depthDistribution || {};
    const avgDepth = analysis.avgDepth || 0;

    if (avgDepth > 4) {
      score -= 10;
    }

    // Pages at depth > 5
    if (depthDist[6] || depthDist[7] || depthDist[8]) {
      score -= 5;
    }

    // Very unbalanced crawl graph
    if (crawlData.stats.totalPages > 10) {
      const orphanRatio = analysis.orphanCount / crawlData.stats.totalPages;
      if (orphanRatio > 0.3) {
        score -= 15; // 30%+ unreachable is bad structure
      }
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Score Security & Compliance (15%)
   */
  scoreSecurity(crawlData) {
    let score = 100;
    const analysis = crawlData.analysis || {};

    // Indexable admin/login/cart pages are MAJOR security risk - harsh penalty
    if (analysis.systemPageIssues && analysis.systemPageIssues > 0) {
      score = Math.max(30, score - (analysis.systemPageIssues * 20)); // -20 per system page, floor at 30
    }

    // Missing security headers (basic check via meta robots)
    const noRobotsPages = Array.from(crawlData.pages || [])
      .filter(p => p.ok && (!p.metaRobots || p.metaRobots === ''))
      .length;
    
    if (noRobotsPages > 0) {
      score -= Math.min(15, noRobotsPages * 3);
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Score Usability & Crawlability (20%)
   */
  scoreUsability(crawlData) {
    let score = 100;

    // Very few pages crawled
    if (crawlData.stats.totalPages < 3) {
      score -= 20;
    } else if (crawlData.stats.totalPages < 10) {
      score -= 10;
    }

    // Many external links (might be SEO risk if excessive)
    if (crawlData.stats.externalLinksCount > crawlData.stats.totalLinks * 0.5) {
      score -= 5; // More than 50% external is suspicious
    }

    // Broken links ratio
    if (crawlData.stats.totalPages > 0) {
      const brokenRatio = crawlData.stats.brokenLinksCount / crawlData.stats.totalPages;
      if (brokenRatio > 0.2) {
        score -= 10; // >20% broken is very bad
      } else if (brokenRatio > 0.1) {
        score -= 5; // >10% broken is bad
      }
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Extract all issues with severity
   */
  extractIssues(crawlData, robotsData, sitemapData) {
    const issues = [];
    const analysis = crawlData.analysis || {};

    // CRITICAL ISSUES

    // System pages indexed
    if (analysis.systemPageIssues && analysis.systemPageIssues > 0) {
      issues.push({
        type: 'security',
        severity: 'critical',
        title: `${analysis.systemPageIssues} System Page(s) Indexed`,
        description: `Admin, login, or cart pages are crawlable and indexable. This is a major SEO and security risk.`,
        impact: `Each indexed system page: -15 points`,
        solution: `Add these to robots.txt: Disallow: /admin /login /cart /checkout /account /dashboard`,
        pages: analysis.systemPagesIndexable || []
      });
    }

    // Broken links
    if (crawlData.stats.brokenLinksCount > 5) {
      issues.push({
        type: 'technical',
        severity: 'critical',
        title: `${crawlData.stats.brokenLinksCount} Broken Links Found`,
        description: `Many internal links point to non-existent pages, damaging crawl efficiency.`,
        impact: `Each broken link: -5 points`,
        solution: `Fix broken links or remove them from navigation.`,
        count: crawlData.stats.brokenLinksCount
      });
    }

    // Orphan pages: many unreachable
    if (analysis.orphanCount > 5) {
      issues.push({
        type: 'structure',
        severity: 'critical',
        title: `${analysis.orphanCount} Orphan Pages (Not Linked)`,
        description: `Pages exist but have no incoming links. Google may not discover them.`,
        impact: `Each orphan page: -10 points`,
        solution: `Link to these pages from main navigation or add to sitemap.`,
        pages: analysis.orphanPages || []
      });
    }

    // Sitemap critical errors
    if (sitemapData && sitemapData.errors && sitemapData.errors.length > 0) {
      issues.push({
        type: 'technical',
        severity: 'critical',
        title: `Sitemap Structure Errors`,
        description: `Sitemap has ${sitemapData.errors.length} structural issues.`,
        impact: `Each error: -15 points`,
        solution: `Fix sitemap XML structure and ensure proper namespace.`,
        errors: sitemapData.errors
      });
    }

    // WARNING ISSUES

    // Missing meta descriptions
    if (analysis.missingMetaDescriptionCount > 5) {
      issues.push({
        type: 'content',
        severity: 'warning',
        title: `${analysis.missingMetaDescriptionCount} Pages Missing Meta Descriptions`,
        description: `Meta descriptions improve CTR in SERPs. Missing on many pages.`,
        impact: `Each missing: -2 points`,
        solution: `Add unique 150-160 character meta descriptions to all pages.`,
        count: analysis.missingMetaDescriptionCount
      });
    }

    // Duplicate titles
    if (Object.keys(analysis.duplicateTitles || {}).length > 0) {
      issues.push({
        type: 'content',
        severity: 'warning',
        title: `Duplicate Page Titles Detected`,
        description: `Multiple pages have identical titles, confusing search engines.`,
        impact: `Per duplicate set: -5 points`,
        solution: `Ensure every page has a unique, descriptive title.`,
        duplicates: analysis.duplicateTitles || {}
      });
    }

    // Missing canonicals
    if (analysis.missingCanonicalCount > 3) {
      issues.push({
        type: 'technical',
        severity: 'warning',
        title: `${analysis.missingCanonicalCount} Pages Missing Canonicals`,
        description: `Canonical tags help Google understand preferred versions of pages.`,
        impact: `Each missing: -3 points`,
        solution: `Add canonical tags to all pages.`,
        count: analysis.missingCanonicalCount
      });
    }

    // Thin content
    if (analysis.thinContentCount > 10) {
      issues.push({
        type: 'content',
        severity: 'warning',
        title: `${analysis.thinContentCount} Pages with Thin Content (<300 words)`,
        description: `Low word count pages have less ranking potential.`,
        impact: `Each thin page: -2 points`,
        solution: `Expand content to 300+ words or merge into pillar pages.`,
        count: analysis.thinContentCount
      });
    }

    // Query parameters
    if (analysis.queryParamRiskCount > 5) {
      issues.push({
        type: 'technical',
        severity: 'warning',
        title: `${analysis.queryParamRiskCount} Pages with Query Parameters`,
        description: `Query parameters can confuse Google about canonical versions.`,
        impact: `Each page with params: -2 points`,
        solution: `Use clean URLs or set canonical tags. Limit parameter variations.`,
        count: analysis.queryParamRiskCount
      });
    }

    // MINOR ISSUES

    // Generic anchor text
    if (analysis.genericAnchorCount > 10) {
      issues.push({
        type: 'content',
        severity: 'minor',
        title: `${analysis.genericAnchorCount} Generic Anchor Texts Found`,
        description: `"Click here", "Read more", etc. don't describe link destinations.`,
        impact: `Each generic anchor: -1 point`,
        solution: `Use descriptive anchor text that includes target page keywords.`,
        count: analysis.genericAnchorCount
      });
    }

    // Deep pages
    if (analysis.avgDepth > 4) {
      issues.push({
        type: 'structure',
        severity: 'minor',
        title: `High Average Page Depth (${analysis.avgDepth} clicks)`,
        description: `Important content should be 2-3 clicks from homepage.`,
        impact: `-10 points`,
        solution: `Flatten information architecture or improve internal linking.`
      });
    }

    return issues;
  }

  /**
   * Generate actionable recommendations
   */
  generateRecommendations(issues) {
    const recommendations = [];
    const bySeverity = {
      critical: issues.filter(i => i.severity === 'critical'),
      warning: issues.filter(i => i.severity === 'warning'),
      minor: issues.filter(i => i.severity === 'minor')
    };

    // Critical first
    for (const issue of bySeverity.critical) {
      recommendations.push({
        priority: 'HIGH',
        actionItem: issue.solution || issue.title,
        expectedImpact: `+${issue.impact ? issue.impact.match(/\d+/) : 15} to ${issue.impact ? issue.impact.match(/\d+/) : 20} points`
      });
    }

    // Warnings second
    for (const issue of bySeverity.warning) {
      recommendations.push({
        priority: 'MEDIUM',
        actionItem: issue.solution || issue.title,
        expectedImpact: `+${issue.impact ? issue.impact.match(/\d+/) : 8} to ${issue.impact ? issue.impact.match(/\d+/) : 10} points`
      });
    }

    // Minor last
    for (const issue of bySeverity.minor) {
      recommendations.push({
        priority: 'LOW',
        actionItem: issue.solution || issue.title,
        expectedImpact: '+2 to 5 points'
      });
    }

    return recommendations.slice(0, 10); // Top 10 recommendations
  }

  /**
   * Get letter grade
   */
  getGrade(score) {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  /**
   * Get score explanation
   */
  getExplanation(score, issues) {
    if (score >= 90) {
      return 'Excellent crawlability and SEO hygiene. Site is well-structured and crawler-friendly.';
    }
    if (score >= 80) {
      return 'Good SEO foundation with minor issues. Focus on fixing the identified warnings.';
    }
    if (score >= 70) {
      return 'Fair SEO health. Address medium-priority issues to improve crawlability.';
    }
    if (score >= 60) {
      return 'Poor SEO hygiene. Multiple critical issues affecting search engine access. Begin with high-priority fixes.';
    }
    return 'Critical SEO problems. Site structure and metadata need significant work before search visibility improves.';
  }
}

module.exports = new DynamicScoringEngine();
