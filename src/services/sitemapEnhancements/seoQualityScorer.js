/**
 * SEO Quality Scorer
 * 
 * Calculate 0-100 quality score with:
 * - Base score: 100
 * - Deductions for various issues
 * - Warnings and errors
 * - Structured JSON output
 */

class SeoQualityScorer {
  constructor() {
    this.cache = new Map();
    this.CACHE_TTL = 1000 * 60 * 60; // 1 hour
  }

  /**
   * Calculate overall quality score
   */
  calculateScore(sitemapData, options = {}) {
    const {
      baseScore = 100,
      cache = true
    } = options;

    const cacheKey = JSON.stringify(sitemapData).substring(0, 100);
    if (cache && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.CACHE_TTL) {
        return cached.value;
      }
    }

    let score = baseScore;
    const deductions = [];
    const warnings = [];
    const errors = [];

    // Check lastmod dates
    const lastmodValidation = this._validateLastmodDates(sitemapData);
    if (lastmodValidation.issues > 0) {
      const deduction = Math.min(20, lastmodValidation.issues * 2);
      score -= deduction;
      deductions.push({ issue: 'Invalid lastmod dates', deduction });
      errors.push(lastmodValidation.details);
    }

    // Check priority distribution
    const priorityValidation = this._validatePriority(sitemapData);
    if (priorityValidation.issues > 0) {
      const deduction = Math.min(15, priorityValidation.issues);
      score -= deduction;
      deductions.push({ issue: 'Poor priority distribution', deduction });
      warnings.push(priorityValidation.details);
    }

    // Check for duplicates
    const duplicates = this._checkDuplicates(sitemapData);
    if (duplicates.count > 0) {
      score -= Math.min(15, duplicates.count);
      deductions.push({ issue: 'Duplicate URLs', deduction: Math.min(15, duplicates.count) });
      errors.push(`Found ${duplicates.count} duplicate URLs`);
    }

    // Check changefreq validity
    const changefreqValidation = this._validateChangefreq(sitemapData);
    if (changefreqValidation.invalid > 0) {
      const deduction = Math.min(10, changefreqValidation.invalid);
      score -= deduction;
      deductions.push({ issue: 'Invalid changefreq values', deduction });
      warnings.push(changefreqValidation.details);
    }

    // Check URL format
    const urlValidation = this._validateUrlFormat(sitemapData);
    if (urlValidation.invalid > 0) {
      const deduction = Math.min(15, urlValidation.invalid * 2);
      score -= deduction;
      deductions.push({ issue: 'Invalid URL format', deduction });
      errors.push(urlValidation.details);
    }

    // Check for images/news usage
    const mediaValidation = this._validateMediaTags(sitemapData);
    if (mediaValidation.warnings > 0) {
      warnings.push(mediaValidation.details);
    }

    // Check size
    const sizeValidation = this._checkSitemapSize(sitemapData);
    if (sizeValidation.issues > 0) {
      const deduction = Math.min(10, sizeValidation.issues);
      score -= deduction;
      warnings.push(sizeValidation.details);
    }

    // Ensure score stays between 0-100
    score = Math.max(0, Math.min(100, score));

    const result = {
      score,
      baseScore,
      totalDeductions: baseScore - score,
      deductions,
      warnings,
      errors,
      grade: this._getGrade(score),
      metadata: {
        totalUrls: sitemapData.urls?.length || 0,
        hasImages: sitemapData.hasImages || false,
        hasNews: sitemapData.hasNews || false,
        sitemapCount: sitemapData.sitemapCount || 1,
        timestamp: new Date().toISOString()
      }
    };

    if (cache) {
      this.cache.set(cacheKey, { value: result, timestamp: Date.now() });
    }

    return result;
  }

  /**
   * Get detailed scoring breakdown
   */
  getBreakdown(scoreResult) {
    return {
      overall: {
        score: scoreResult.score,
        grade: scoreResult.grade,
        status: this._getStatus(scoreResult.score)
      },
      deductions: {
        items: scoreResult.deductions,
        total: scoreResult.totalDeductions
      },
      issues: {
        errors: scoreResult.errors.length > 0 ? scoreResult.errors : 'None',
        warnings: scoreResult.warnings.length > 0 ? scoreResult.warnings : 'None'
      },
      metadata: scoreResult.metadata
    };
  }

  /**
   * Get improvement recommendations
   */
  getRecommendations(scoreResult) {
    const recommendations = [];

    // Priority recommendations
    if (scoreResult.errors.length > 0) {
      recommendations.push({
        priority: 'critical',
        issues: scoreResult.errors,
        action: 'Fix these errors immediately to improve SEO'
      });
    }

    if (scoreResult.warnings.length > 0) {
      recommendations.push({
        priority: 'high',
        issues: scoreResult.warnings,
        action: 'Address these warnings to improve search engine compliance'
      });
    }

    // Score-based recommendations
    if (scoreResult.score < 50) {
      recommendations.push({
        priority: 'critical',
        issue: 'Very low quality score',
        action: 'Major issues detected - audit sitemap structure and data immediately'
      });
    } else if (scoreResult.score < 70) {
      recommendations.push({
        priority: 'high',
        issue: 'Below average quality',
        action: 'Consider a full sitemap audit to address deductions'
      });
    } else if (scoreResult.score < 85) {
      recommendations.push({
        priority: 'medium',
        issue: 'Room for improvement',
        action: 'Review specific deductions and update URLs/metadata'
      });
    }

    return recommendations;
  }

  /**
   * Compare multiple sitemaps
   */
  compare(sitemapResults) {
    const scores = sitemapResults.map(r => r.score);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;

    return {
      average: Math.round(avg * 100) / 100,
      highest: Math.max(...scores),
      lowest: Math.min(...scores),
      sitemaps: sitemapResults.map((r, i) => ({
        index: i + 1,
        score: r.score,
        grade: r.grade,
        vs_avg: Math.round((r.score - avg) * 100) / 100
      }))
    };
  }

  /**
   * Helper: validate lastmod dates
   */
  _validateLastmodDates(sitemapData) {
    if (!sitemapData.urls) return { issues: 0, details: '' };

    let issues = 0;
    let identical = 0;

    const dates = sitemapData.urls
      .map(u => u.lastmod)
      .filter(d => d);

    // Check for identical dates (too many)
    const dateFreq = {};
    dates.forEach(d => {
      dateFreq[d] = (dateFreq[d] || 0) + 1;
    });

    Object.values(dateFreq).forEach(count => {
      if (count > sitemapData.urls.length * 0.7) {
        issues += 5;
        identical++;
      }
    });

    // Check for future dates
    const now = new Date();
    sitemapData.urls.forEach(u => {
      if (u.lastmod && new Date(u.lastmod) > now) {
        issues += 2;
      }
    });

    return {
      issues: Math.min(10, issues),
      details: identical > 0 ? `${identical} lastmod dates used excessively` : ''
    };
  }

  /**
   * Helper: validate priority
   */
  _validatePriority(sitemapData) {
    if (!sitemapData.urls) return { issues: 0, details: '' };

    const priorities = sitemapData.urls
      .map(u => u.priority)
      .filter(p => p);

    // Check if all same
    const unique = new Set(priorities);
    if (unique.size === 1) {
      return {
        issues: 10,
        details: 'All URLs have same priority - prevent search engine optimization'
      };
    }

    // Check distribution
    const high = priorities.filter(p => p >= 0.9).length;
    const low = priorities.filter(p => p <= 0.2).length;

    if (high > sitemapData.urls.length * 0.7) {
      return {
        issues: 5,
        details: 'Too many high-priority URLs'
      };
    }

    return { issues: 0, details: '' };
  }

  /**
   * Helper: check duplicates
   */
  _checkDuplicates(sitemapData) {
    if (!sitemapData.urls) return { count: 0 };

    const urls = new Set();
    let duplicates = 0;

    sitemapData.urls.forEach(u => {
      if (urls.has(u.loc)) {
        duplicates++;
      } else {
        urls.add(u.loc);
      }
    });

    return { count: duplicates };
  }

  /**
   * Helper: validate changefreq
   */
  _validateChangefreq(sitemapData) {
    if (!sitemapData.urls) return { invalid: 0, details: '' };

    const valid = ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'];
    let invalid = 0;

    sitemapData.urls.forEach(u => {
      if (u.changefreq && !valid.includes(u.changefreq)) {
        invalid++;
      }
    });

    return {
      invalid,
      details: invalid > 0 ? `${invalid} invalid changefreq values found` : ''
    };
  }

  /**
   * Helper: validate URL format
   */
  _validateUrlFormat(sitemapData) {
    if (!sitemapData.urls) return { invalid: 0, details: '' };

    let invalid = 0;

    sitemapData.urls.forEach(u => {
      if (!u.loc || !this._isValidUrl(u.loc)) {
        invalid++;
      }
    });

    return {
      invalid,
      details: invalid > 0 ? `${invalid} URLsare not valid format` : ''
    };
  }

  /**
   * Helper: validate media tags
   */
  _validateMediaTags(sitemapData) {
    if (!sitemapData.urls) return { warnings: 0, details: '' };

    let imageUrls = 0;
    let newsEntries = 0;

    sitemapData.urls.forEach(u => {
      if (u.image) imageUrls += (Array.isArray(u.image) ? u.image.length : 1);
      if (u.news) newsEntries++;
    });

    return {
      warnings: 0,
      details: `Images: ${imageUrls}, News entries: ${newsEntries}`
    };
  }

  /**
   * Helper: check sitemap size
   */
  _checkSitemapSize(sitemapData) {
    if (!sitemapData.urls) return { issues: 0, details: '' };

    if (sitemapData.urls.length > 50000) {
      return {
        issues: 5,
        details: 'Sitemap exceeds 50,000 URL limit - split into index'
      };
    }

    return { issues: 0, details: '' };
  }

  /**
   * Helper: is valid URL
   */
  _isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Helper: get grade
   */
  _getGrade(score) {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  /**
   * Helper: get status
   */
  _getStatus(score) {
    if (score >= 85) return 'Excellent';
    if (score >= 70) return 'Good';
    if (score >= 50) return 'Fair';
    return 'Poor';
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }
}

module.exports = new SeoQualityScorer();
