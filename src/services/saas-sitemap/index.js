/*
 * index.js
 * ----------
 * Convenience entry point for the sitemap service modules.  Consumers can
 * require the root directory and pull whichever piece they need.
 */

module.exports = {
  Crawler: require('./crawler'),
  SitemapBuilder: require('./sitemap-builder'),
  Robots: require('./robots'),
  Filter: require('./url-filter'),
  Metadata: require('./metadata')
};
