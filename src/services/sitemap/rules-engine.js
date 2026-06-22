/**
 * rules-engine.js
 * Calculates priority and changefreq based on URL type and last modified date
 * Implements recency boost for frequently updated content
 */

const config = require('./sitemap-config');

class RulesEngine {
  constructor() {
    this.rules = config.rules;
    this.logger = { log: (...a) => config.verbose && console.log('[sitemap-rules]', ...a) };
  }

  /**
   * Calculate priority and changefreq for a URL
   */
  calculate(url) {
    const type = url.type || 'other';
    const rule = this.rules[type] || this.rules.other;
    let priority = rule.priority;

    // Boost priority for recently updated content
    if (rule.recentDays > 0 && url.lastmod) {
      const ageDays = this._getAgeDays(url.lastmod);
      if (ageDays <= rule.recentDays) {
        priority = Math.min(1.0, priority + rule.recentBoost);
        this.logger.log(`Boosted ${type} (age ${ageDays}d): ${priority}`);
      }
    }

    // Ensure priority is valid (0.0 - 1.0, one decimal)
    priority = Math.max(0.1, Math.min(1.0, parseFloat(priority.toFixed(1))));

    return {
      priority: priority.toFixed(1),
      changefreq: rule.changefreq,
      type,
      boosted: priority > rule.priority
    };
  }

  /**
   * Calculate for batch of URLs
   */
  calculateBatch(urls) {
    return urls.map(url => ({
      ...url,
      ...this.calculate(url)
    }));
  }

  /**
   * Get age in days
   */
  _getAgeDays(dateStr) {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now - date;
      return Math.floor(diffMs / (1000 * 60 * 60 * 24));
    } catch (e) {
      return 999;
    }
  }

  /**
   * Get statistics on priority distribution
   */
  getStats(urls) {
    const enriched = this.calculateBatch(urls);
    const byType = {};
    const byPriority = {};
    let boostedCount = 0;

    enriched.forEach(u => {
      // By type
      if (!byType[u.type]) byType[u.type] = 0;
      byType[u.type]++;

      // By priority
      const p = u.priority;
      if (!byPriority[p]) byPriority[p] = 0;
      byPriority[p]++;

      // Boosted count
      if (u.boosted) boostedCount++;
    });

    return { byType, byPriority, boostedCount, total: enriched.length };
  }
}

module.exports = new RulesEngine();
