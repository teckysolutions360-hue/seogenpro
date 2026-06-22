/**
 * Scoring Engine Module
 * Calculates AI Readiness Score for compliance analysis
 */

class ScoringEngine {
  constructor() {
    // weights are relative; they will be normalized to sum to 1
    this.weights = {
      sitemap: 0.10,
      robots: 0.10,
      classification: 0.20,
      policy: 0.25,
      metadata: 0.15,
      legal: 0.10,
      formatting: 0.10
    };
  }

  /**
   * Calculate AI Readiness Score (0-100)
   */
  calculateScore(data) {
    // Compute per-category scores (each must be 0-10)
    const analysis = {
      sitemap: this.clampScore(this.scoreSitemap(data)),
      robots: this.clampScore(this.scoreRobots(data)),
      classification: this.clampScore(this.scoreClassification(data)),
      policy: this.clampScore(this.scorePolicy(data)),
      metadata: this.clampScore(this.scoreMetadata(data)),
      legal: this.clampScore(this.scoreLegal(data)),
      formatting: this.clampScore(this.scoreFormatting(data))
    };

    // Normalize weights to sum to 1 (defensive)
    const weightSum = Object.values(this.weights).reduce((s, w) => s + (Number(w) || 0), 0) || 1;
    const normalizedWeights = Object.fromEntries(Object.entries(this.weights).map(([k, v]) => [k, Number(v) / weightSum]));

    // Final score: sum( (score_i / 10) * weight_i ) * 100
    const finalFraction = Object.entries(analysis).reduce((sum, [category, score]) => {
      const w = normalizedWeights[category] || 0;
      return sum + ((Number(score) || 0) / 10) * w;
    }, 0);

    const totalScore = Math.round(Math.max(0, Math.min(100, finalFraction * 100)));

    const scoreData = {
      score: totalScore,
      weights: Object.fromEntries(Object.entries(normalizedWeights).map(([k, v]) => [k, Math.round(v * 100)])),
      breakdown: analysis,
      maxPossible: 100,
      grade: this.getGrade(totalScore),
      interpretation: this.getInterpretation(totalScore)
    };

    // Add recommendations
    scoreData.recommendations = this.generateRecommendations(scoreData);

    return scoreData;
  }

  /**
   * Score sitemap presence (10 points)
   */
  scoreSitemap(data) {
    if (data.hasSitemap) return 10;
    if (data.sitemapDetected) return 7;
    if (data.crawledPages && data.crawledPages.length > 0) return 4;
    return 0;
  }

  /**
   * Score robots.txt presence (10 points)
   */
  scoreRobots(data) {
    if (data.hasRobots) return 10;
    if (data.robotsDetected) return 6;
    return 0;
  }

  /**
   * Score page classification (20 points)
   */
  scoreClassification(data) {
    const classified = data.classifiedPages || {};
    const totalPages = Object.values(classified).reduce((sum, cat) => sum + (Array.isArray(cat) ? cat.length : 0), 0);
    if (totalPages === 0) return 0;

    const primary = (classified.primary || []).length;
    const informational = (classified.informational || []).length;
    const legal = (classified.legal || []).length;

    // Score components (normalized)
    let score = 0;
    // primary content coverage (up to 5)
    if (primary / totalPages >= 0.2) score += 5;
    else score += Math.round((primary / Math.max(1, totalPages)) * 5);
    // informational pages presence (up to 3)
    if (informational > 0) score += 2;
    // legal pages presence (up to 2)
    if (legal > 0) score += 2;

    return this.clampScore(score);
  }

  /**
   * Score AI policy completeness (25 points)
   */
  scorePolicy(data) {
    const policy = data.policy || {};
    
    const requiredFields = [
      'Allow-Summary',
      'Allow-Quotation',
      'Allow-Training',
      'Allow-Embedding',
      'Require-Attribution'
    ];
    // Compute base fraction of required fields present
    const completed = requiredFields.filter(field => policy[field] !== undefined && policy[field] !== 'Not specified').length;
    let frac = completed / requiredFields.length;

    // small boosts for explicit attribution format and last-updated
    if (policy['Attribution-Format'] && policy['Attribution-Format'].length > 5) frac += 0.15;
    if (policy['Last-Updated']) frac += 0.10;

    const score = Math.round(Math.max(0, Math.min(1, frac)) * 10);
    return this.clampScore(score);
  }

  /**
   * Score metadata completeness (15 points)
   */
  scoreMetadata(data) {
    const metadata = data.metadata || {};
    // Prefer validation stats if present
    const validation = data.validation || {};
    const canonicalCoverage = (typeof validation.canonicalCoverage === 'number') ? validation.canonicalCoverage : (typeof validation.canonical_coverage === 'number' ? validation.canonical_coverage : 0);
    const metaDescriptionCoverage = (typeof validation.metaDescriptionCoverage === 'number') ? validation.metaDescriptionCoverage : (typeof validation.meta_description_coverage === 'number' ? validation.meta_description_coverage : 0);
    const duplicateTitleCount = (typeof validation.duplicateTitleCount === 'number') ? validation.duplicateTitleCount : (typeof validation.duplicate_title_count === 'number' ? validation.duplicate_title_count : 0);

    let score = 10; // base

    // Basic positive signals
    if (metadata.title && metadata.title.length > 5) score += 0; // no increase, base covers
    // schema boosts
    if (metadata.schemaMarkup && metadata.schemaMarkup.types) {
      const types = metadata.schemaMarkup.types;
      if ((types.Organization && types.Organization.valid) || (types.WebSite && types.WebSite.valid)) score += 0; // kept in base
      if ((types.Article && types.Article.valid) || (types.Product && types.Product.valid) || (types.BlogPosting && types.BlogPosting.valid)) score += 0;
    }

    // Apply penalties as specified
    if (canonicalCoverage === 0) score -= 3;
    else if (canonicalCoverage < 0.5) score -= 2;

    if (metaDescriptionCoverage === 0) score -= 3;
    else if (metaDescriptionCoverage < 0.5) score -= 2;

    if (duplicateTitleCount > 30) score -= 3;
    else if (duplicateTitleCount > 20) score -= 2;
    else if (duplicateTitleCount > 10) score -= 1;

    // Ensure within 0..10
    return this.clampScore(score);
  }

  /**
   * Score legal + contact transparency (10 points)
   */
  scoreLegal(data) {
    const classified = data.classifiedPages || {};
    // Stronger legal detection: check explicit flags if available
    let score = 0;
    const legalPages = data.legalPages || {};
    if (legalPages.privacy) score += 4;
    if (legalPages.terms) score += 3;
    if (legalPages.cookie) score += 2;
    if (legalPages.refund) score += 1;

    // fallback: presence in classified pages
    if (score === 0 && classified.legal && classified.legal.length > 0) score = 3;

    return this.clampScore(score);
  }

  /**
   * Score formatting/output quality (10 points)
   */
  scoreFormatting(data) {
    // If a unified validation formatting score is available, use it as single source of truth
    if (data.validation && typeof data.validation.formattingScore === 'number') {
      return this.clampScore(data.validation.formattingScore);
    }

    // Fallback calculation (legacy)
    let penalty = 0;
    if (!data.generatedOutput || data.generatedOutput.length < 200) penalty += 4;

    const required_sections = ['AI Usage Guidelines', 'Site Overview', 'Primary Content'];
    const content = data.generatedOutput || '';
    const missingSections = required_sections.filter(s => !content.includes(s)).length;
    penalty += Math.min(4, missingSections * 2);

    if (data.duplicateTitles && data.duplicateTitles.length > 0) penalty += Math.min(2, data.duplicateTitles.length * 0.1);
    if (data.missingCanonicalCount && data.missingCanonicalCount > 0) penalty += 1;

    const score = Math.max(0, 10 - penalty);
    return this.clampScore(score);
  }

  /**
   * Ensure category scores are numeric and within 0-10
   */
  clampScore(v) {
    const n = Number(v) || 0;
    return Math.max(0, Math.min(10, Math.round(n)));
  }

  /**
   * Get letter grade (A-F)
   */
  getGrade(score) {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  /**
   * Get score interpretation
   */
  getInterpretation(score) {
    if (score >= 90) return 'Excellent AI readiness and compliance';
    if (score >= 80) return 'Good AI readiness with minor improvements needed';
    if (score >= 70) return 'Fair AI readiness - notable gaps exist';
    if (score >= 60) return 'Poor AI readiness - significant improvements recommended';
    return 'Critical AI readiness issues - immediate action needed';
  }

  /**
   * Generate improvement recommendations
   */
  generateRecommendations(scoreData) {
    const recommendations = [];
    const breakdown = scoreData.breakdown || {};

    if (breakdown.sitemap < 8) {
      recommendations.push('Create and publish sitemap.xml for full page index');
    }

    if (breakdown.robots < 8) {
      recommendations.push('Create robots.txt to manage crawler access');
    }

    if (breakdown.policy < 15) {
      recommendations.push('Complete and publish AI usage policy with all required fields');
    }

    if (breakdown.metadata < 10) {
      recommendations.push('Add structured metadata (title, description, schema markup)');
    }

    if (breakdown.legal < 7) {
      recommendations.push('Create dedicated legal/privacy/terms pages');
    }

    if (breakdown.classification < 15) {
      recommendations.push('Improve page organization and categorization');
    }

    return recommendations;
  }

  /**
   * Format score as readable output
   */
  formatScoreMarkdown(scoreData) {
    let markdown = `## AI Readiness Score\n\n`;
    markdown += `**Overall Score:** ${scoreData.score}/100 (Grade: ${scoreData.grade})\n\n`;
    markdown += `${scoreData.score >= 80 ? '✅' : '⚠️'} ${this.getInterpretation(scoreData.score)}\n\n`;

    markdown += `### Score Breakdown\n\n`;
    Object.entries(scoreData.breakdown).forEach(([category, score]) => {
      const weight = scoreData.weights[category];
      const bar = '█'.repeat(Math.round(score / 10)) + '░'.repeat(10 - Math.round(score / 10));
      markdown += `- **${category}:** ${score}/10 (${weight}%) ${bar}\n`;
    });

    return markdown;
  }
}

module.exports = new ScoringEngine();
