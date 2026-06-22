/**
 * sitemap-config.js
 * Central configuration for the sitemap system
 */

module.exports = {
  // Cache settings (in-memory)
  cache: {
    enabled: true,
    ttl: 3600 * 1000, // 1 hour in milliseconds
    maxSize: 10000 // max URLs to cache
  },

  // Scheduler settings
  scheduler: {
    enabled: process.env.SITEMAP_SCHEDULER_ENABLED !== 'false',
    cronExpression: process.env.SITEMAP_CRON || '0 */6 * * *', // Every 6 hours
    autoRun: process.env.SITEMAP_AUTO_RUN !== 'false'
  },

  // Type-based rules (priority, changefreq, recency boost)
  rules: {
    homepage: { priority: 1.0, changefreq: 'weekly', recentDays: 0, recentBoost: 0 },
    landing: { priority: 0.9, changefreq: 'monthly', recentDays: 30, recentBoost: 0.05 },
    product: { priority: 0.8, changefreq: 'weekly', recentDays: 7, recentBoost: 0.1 },
    blog: { priority: 0.7, changefreq: 'monthly', recentDays: 30, recentBoost: 0.2 },
    category: { priority: 0.6, changefreq: 'monthly', recentDays: 0, recentBoost: 0 },
    job: { priority: 0.6, changefreq: 'weekly', recentDays: 14, recentBoost: 0.15 },
    legal: { priority: 0.5, changefreq: 'yearly', recentDays: 0, recentBoost: 0 },
    other: { priority: 0.5, changefreq: 'monthly', recentDays: 0, recentBoost: 0 }
  },

  // URL patterns for type detection (fallback if DB doesn't provide type)
  typePatterns: {
    homepage: /^\/$/,
    landing: /\/(services|contact|inquiry|lead|about|company)\b/i,
    product: /\/(product|software|tool|offer)\b/i,
    blog: /\/(blog|article|post|news)\b/i,
    category: /\/(category|categories|tag|collection)\b/i,
    job: /\/(job|jobs|career|position|hiring)\b/i,
    legal: /\/(privacy|terms|policy|disclaimer|legal)\b/i
  },

  // Output settings
  output: {
    filename: 'sitemap.xml',
    path: process.env.SITEMAP_PATH || process.cwd(),
    includeNewsNamespace: false, // set to true if news URLs exist
    maxUrlsPerSitemap: 50000, // Google limit
    indexEnabled: false // set true for sitemap index (multiple sitemaps)
  },

  // Performance settings
  performance: {
    batchSize: 1000, // Process URLs in batches
    concurrency: 5, // Parallel HTTP requests for lastmod fetching
    httpTimeout: 6000, // 6 seconds for HTTP requests
    skipHttpFetch: process.env.SITEMAP_SKIP_HTTP !== 'false' // skip HTTP if DB has data
  },

  // Database settings (connect to your app's DB)
  database: {
    queryMode: process.env.SITEMAP_DB_MODE || 'function', // 'function' uses db.getAllPages(), 'query' uses raw SQL
    enableMocking: process.env.SITEMAP_MOCK_DB === 'true' // for testing without DB
  },

  // Debug/logging
  debug: process.env.SITEMAP_DEBUG === 'true',
  verbose: process.env.SITEMAP_VERBOSE === 'true'
};
