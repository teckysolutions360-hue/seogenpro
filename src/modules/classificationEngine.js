/**
 * Classification Engine Module
 * Intelligent page classification for AI compliance analysis
 */

class ClassificationEngine {
  constructor() {
    this.patterns = {
      primary: {
        keywords: [
          'article', 'blog', 'post', 'tutorial', 'guide', 'documentation',
          'how-to', 'example', 'case-study', 'category', 'archive', 'listing'
        ],
        patterns: [
          /\/blog\//, /\/articles?\//, /\/posts?\//, /\/tutorials?\//, 
          /\/guides?\//, /\/docs?\//, /\/category\//, /\/tag\//,
          /\/archive\//, /\/news\//
        ]
      },
      informational: {
        keywords: [
          'about', 'contact', 'team', 'careers', 'press', 'media',
          'company', 'mission', 'story', 'values', 'faq'
        ],
        patterns: [
          /\/about(?:\/|$)/, /\/contact(?:\/|$)/, /\/team(?:\/|$)/,
          /\/careers?(?:\/|$)/, /\/press(?:\/|$)/, /\/faq(?:\/|$)/,
          /\/company(?:\/|$)/, /\/mission(?:\/|$)/
        ]
      },
      legal: {
        keywords: [
          'privacy', 'terms', 'legal', 'disclaimer', 'policy',
          'agreement', 'license', 'compliance', 'copyright', 'dmca'
        ],
        patterns: [
          /\/privacy(?:\/|$)/, /\/terms?(?:\/|$)/, /\/legal(?:\/|$)/,
          /\/disclaimer(?:\/|$)/, /\/policies?(?:\/|$)/, /\/agreement(?:\/|$)/,
          /\/license(?:\/|$)/, /\/compliance(?:\/|$)/, /\/copyright(?:\/|$)/,
          /\/dmca(?:\/|$)/
        ]
      },
      monetization: {
        keywords: [
          'pricing', 'price', 'plans', 'billing', 'subscription', 'checkout',
          'cart', 'buy', 'shop', 'affiliate', 'sponsor', 'premium', 'upgrade'
        ],
        patterns: [
          /\/pricing(?:\/|$)/, /\/prices?(?:\/|$)/, /\/plans?(?:\/|$)/,
          /\/billing(?:\/|$)/, /\/subscription(?:\/|$)/, /\/checkout(?:\/|$)/,
          /\/cart(?:\/|$)/, /\/buy(?:\/|$)/, /\/shop(?:\/|$)/,
          /\/affiliate(?:\/|$)/, /\/sponsor(?:\/|$)/, /\/premium(?:\/|$)/,
          /\/upgrade(?:\/|$)/
        ]
      },
      restricted: {
        keywords: [
          'admin', 'dashboard', 'account', 'login', 'signin', 'signup',
          'register', 'api', 'webhook', 'private', 'internal', 'secret',
          'wp-admin', 'wp-login', 'admin-panel', 'user-panel'
        ],
        patterns: [
          /\/admin(?:\/|$)/, /\/dashboard(?:\/|$)/, /\/account(?:\/|$)/,
          /\/login(?:\/|$)/, /\/signin(?:\/|$)/, /\/signup(?:\/|$)/,
          /\/register(?:\/|$)/, /\/api(?:\/|$)/, /\/webhook(?:\/|$)/,
          /\/private(?:\/|$)/, /\/internal(?:\/|$)/, /\/secret(?:\/|$)/,
          /\/wp-admin(?:\/|$)/, /\/wp-login(?:\/|$)/, /\/user-panel(?:\/|$)/
        ]
      }
    };
  }

  /**
   * Classify a single page
   */
  classifyPage(url, title = '', description = '') {
    const urlLower = url.toLowerCase();
    const titleLower = (title || '').toLowerCase();
    const descLower = (description || '').toLowerCase();

    // Score each category
    const scores = {
      primary: this.scoreCategory('primary', urlLower, titleLower, descLower),
      informational: this.scoreCategory('informational', urlLower, titleLower, descLower),
      legal: this.scoreCategory('legal', urlLower, titleLower, descLower),
      monetization: this.scoreCategory('monetization', urlLower, titleLower, descLower),
      restricted: this.scoreCategory('restricted', urlLower, titleLower, descLower)
    };

    // Find category with highest score
    const maxCategory = Object.entries(scores).reduce((max, [cat, score]) => 
      score > max[1] ? [cat, score] : max
    );

    // Return category if score > 0, else 'primary' as default
    return maxCategory[1] > 0 ? maxCategory[0] : 'primary';
  }

  /**
   * Score a page against a category
   */
  scoreCategory(category, url, title, description) {
    let score = 0;
    const patterns = this.patterns[category];

    // URL pattern matching (highest weight)
    patterns.patterns.forEach(pattern => {
      if (pattern.test(url)) {
        score += 3;
      }
    });

    // Keyword matching in URL, title, description
    patterns.keywords.forEach(keyword => {
      if (url.includes(keyword)) score += 2;
      if (title.includes(keyword)) score += 1;
      if (description.includes(keyword)) score += 0.5;
    });

    return score;
  }

  /**
   * Classify multiple pages
   */
  classifyPages(pages) {
    const classified = {
      primary: [],
      informational: [],
      legal: [],
      monetization: [],
      restricted: []
    };

    pages.forEach(page => {
      const category = this.classifyPage(
        page.url,
        page.title,
        page.description
      );
      classified[category].push(page);
    });

    return classified;
  }

  /**
   * Get category display name
   */
  getCategoryName(category) {
    const names = {
      primary: 'Primary Content',
      informational: 'Company Information',
      legal: 'Legal Pages',
      monetization: 'Pricing & Plans',
      restricted: 'Restricted (Not Indexed)'
    };
    return names[category] || category;
  }

  /**
   * Get category icon/emoji
   */
  getCategoryEmoji(category) {
    const emojis = {
      primary: '📄',
      informational: 'ℹ️',
      legal: '⚖️',
      monetization: '💰',
      restricted: '🔒'
    };
    return emojis[category] || '📑';
  }

  /**
   * Generate classification summary
   */
  generateSummary(classified) {
    return {
      total: Object.values(classified).reduce((sum, cat) => sum + cat.length, 0),
      byCategory: Object.entries(classified).reduce((acc, [cat, pages]) => {
        acc[cat] = pages.length;
        return acc;
      }, {})
    };
  }
}

module.exports = new ClassificationEngine();
