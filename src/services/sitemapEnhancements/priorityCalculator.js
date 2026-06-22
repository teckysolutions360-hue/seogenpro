/**
 * Priority Calculator
 * 
 * Dynamic priority calculation based on page type:
 * - Homepage: 1.0
 * - Core service/product pages: 0.8
 * - Category pages: 0.7
 * - Blog posts: 0.6
 * - Resource pages: 0.5
 * - Legal pages: 0.3
 * - Other: 0.5
 */

class PriorityCalculator {
  constructor() {
    this.rules = this._defaultRules();
  }

  /**
   * Default priority rules
   */
  _defaultRules() {
    return {
      homepage: 1.0,
      core_pages: 0.8,
      service_pages: 0.8,
      product_pages: 0.8,
      category_pages: 0.7,
      subcategory_pages: 0.65,
      blog_index: 0.65,
      blog_post: 0.6,
      article: 0.6,
      resource: 0.5,
      download: 0.5,
      job: 0.5,
      testimonial: 0.4,
      case_study: 0.55,
      legal: 0.3,
      privacy: 0.3,
      terms: 0.3,
      contact: 0.6,
      about: 0.7,
      portfolio: 0.7,
      other: 0.5
    };
  }

  /**
   * Classify URL and calculate priority
   */
  calculate(url, options = {}) {
    const {
      baseUrl = '',
      customRules = {},
      override = null // Allow manual override
    } = options;

    // If override is provided, use it
    if (override !== null && override >= 0 && override <= 1) {
      return {
        priority: parseFloat(override.toFixed(1)),
        type: 'custom_override',
        confidence: 'high'
      };
    }

    // Merge custom rules with defaults
    const rules = { ...this.rules, ...customRules };

    // Classify the URL
    const classification = this._classifyUrl(url, baseUrl);

    // Get priority from rules
    const priority = rules[classification.type] || rules.other;

    // Apply modifiers based on characteristics
    const modified = this._applyModifiers(priority, url, classification);

    return {
      priority: Math.max(0, Math.min(1, parseFloat(modified.toFixed(1)))),
      type: classification.type,
      classification,
      confidence: classification.confidence
    };
  }

  /**
   * Classify URL by path patterns
   */
  _classifyUrl(url, baseUrl = '') {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname.toLowerCase();
      const parts = pathname.split('/').filter(p => p);

      // Homepage
      if (pathname === '/' || pathname === '') {
        return {
          type: 'homepage',
          path: pathname,
          confidence: 'high'
        };
      }

      // Legal pages
      if (pathname.includes('/privacy') || pathname.includes('/terms') || pathname.includes('/policy')) {
        return {
          type: pathname.includes('/privacy') ? 'privacy' : 'terms',
          path: pathname,
          confidence: 'high'
        };
      }

      // Contact page
      if (pathname.includes('/contact') || pathname.includes('/inquiry')) {
        return {
          type: 'contact',
          path: pathname,
          confidence: 'high'
        };
      }

      // About page
      if (pathname.includes('/about') || pathname.includes('/team') || pathname.includes('/company')) {
        return {
          type: 'about',
          path: pathname,
          confidence: 'high'
        };
      }

      // Blog detection
      if (pathname.includes('/blog') || pathname.includes('/article') || pathname.includes('/post')) {
        if (parts.length === 2 && (parts[0] === 'blog' || parts[0] === 'articles' || parts[0] === 'posts')) {
          return {
            type: 'blog_index',
            path: pathname,
            confidence: 'high'
          };
        }
        return {
          type: 'blog_post',
          path: pathname,
          confidence: 'high'
        };
      }

      // Product/Service pages
      if (pathname.includes('/product') || pathname.includes('/service') || pathname.includes('/offer')) {
        if (pathname.includes('/product')) {
          return {
            type: 'product_pages',
            path: pathname,
            confidence: 'high'
          };
        }
        return {
          type: 'service_pages',
          path: pathname,
          confidence: 'high'
        };
      }

      // Category pages
      if (pathname.includes('/category') || pathname.includes('/categories')) {
        const level = parts.length - 1;
        if (level <= 2) {
          return {
            type: 'category_pages',
            path: pathname,
            confidence: 'high'
          };
        }
        return {
          type: 'subcategory_pages',
          path: pathname,
          confidence: 'high'
        };
      }

      // Job pages
      if (pathname.includes('/job') || pathname.includes('/career') || pathname.includes('/position')) {
        return {
          type: 'job',
          path: pathname,
          confidence: 'high'
        };
      }

      // Case studies
      if (pathname.includes('/case-study') || pathname.includes('/casestudy')) {
        return {
          type: 'case_study',
          path: pathname,
          confidence: 'high'
        };
      }

      // Resource/Download pages
      if (pathname.includes('/resource') || pathname.includes('/download') || pathname.includes('/guide')) {
        return {
          type: pathname.includes('/download') ? 'download' : 'resource',
          path: pathname,
          confidence: 'high'
        };
      }

      // Portfolio
      if (pathname.includes('/portfolio') || pathname.includes('/work') || pathname.includes('/projects')) {
        return {
          type: 'portfolio',
          path: pathname,
          confidence: 'high'
        };
      }

      // Test for main category pages (first level deep)
      if (parts.length === 1) {
        return {
          type: 'core_pages',
          path: pathname,
          confidence: 'medium'
        };
      }

      // Default
      return {
        type: 'other',
        path: pathname,
        confidence: 'low'
      };
    } catch (error) {
      return {
        type: 'other',
        path: url,
        confidence: 'low',
        error: error.message
      };
    }
  }

  /**
   * Apply modifiers based on characteristics
   */
  _applyModifiers(basePriority, url, classification) {
    let priority = basePriority;

    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname.toLowerCase();

      // Reduce priority for pagination
      if (pathname.includes('/page/') || pathname.includes('?page=') || urlObj.search.includes('page=')) {
        priority *= 0.7;
      }

      // Reduce priority for tag/category archive pages
      if (pathname.includes('/tag/') || pathname.includes('/category/') || pathname.includes('/author/')) {
        priority *= 0.6;
      }

      // Increase priority for main product/service pages without pagination
      if ((pathname.includes('/product/') || pathname.includes('/service/')) && !pathname.includes('/page')) {
        priority = Math.min(1.0, priority * 1.1);
      }

      // Reduce priority for very deep pages (>5 levels)
      const pathDepth = pathname.split('/').filter(p => p).length;
      if (pathDepth > 5) {
        priority *= 0.85;
      }

      // Reduce priority for pages with query parameters (except product filters)
      if (!urlObj.search.includes('product_id=') && !urlObj.search.includes('filter=') && urlObj.search) {
        priority *= 0.8;
      }

    } catch (error) {
      // If URL parsing fails, return base priority
    }

    return priority;
  }

  /**
   * Calculate priority for batch of URLs
   */
  calculateBatch(urls, options = {}) {
    const results = [];

    urls.forEach(url => {
      results.push(this.calculate(typeof url === 'string' ? url : (url.loc || url.url || url), options));
    });

    return results;
  }

  /**
   * Set custom priority rule
   */
  setCustomRule(type, priority) {
    if (priority < 0 || priority > 1) {
      throw new Error('Priority must be between 0 and 1');
    }
    this.rules[type] = priority;
    return { rule: type, priority: this.rules[type] };
  }

  /**
   * Set multiple custom rules at once
   */
  setCustomRules(rulesMap) {
    const results = {};
    Object.entries(rulesMap).forEach(([type, priority]) => {
      results[type] = this.setCustomRule(type, priority);
    });
    return results;
  }

  /**
   * Get all rules
   */
  getRules() {
    return { ...this.rules };
  }

  /**
   * Reset to default rules
   */
  reset() {
    this.rules = this._defaultRules();
    return { reset: true };
  }

  /**
   * Analyze priority distribution
   */
  analyzeDistribution(urls, options = {}) {
    const calculations = this.calculateBatch(urls, options);
    const distribution = {};
    const typeDistribution = {};

    Object.values(calculations).forEach(calc => {
      const priority = calc.priority;
      const range = Math.floor(priority * 10) / 10;
      distribution[range] = (distribution[range] || 0) + 1;
      typeDistribution[calc.type] = (typeDistribution[calc.type] || 0) + 1;
    });

    const priorities = Object.values(calculations).map(c => c.priority);
    const avgPriority = priorities.reduce((a, b) => a + b, 0) / priorities.length;

    return {
      totalUrls: urls.length,
      averagePriority: parseFloat(avgPriority.toFixed(3)),
      priorityDistribution: distribution,
      typeDistribution: typeDistribution,
      minPriority: Math.min(...priorities),
      maxPriority: Math.max(...priorities)
    };
  }
}

module.exports = new PriorityCalculator();
