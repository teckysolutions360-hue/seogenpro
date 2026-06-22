const crawlAudit = require('../src/services/crawlAuditService');

(async () => {
  try {
    console.log('Starting local audit for https://www.wscubetech.com/');
    const r = await crawlAudit.generateAudit('https://www.wscubetech.com/', { maxPages: 500, depthLimit: 3, followExternal: false, renderAllPages: false, concurrency: 6, rateLimitMs: 50 });
    console.log('\n=== AUDIT SUMMARY ===');
    console.log('Final Score:', r.crawl_results_summary.final_score + '/100');
    console.log('Total URLs Discovered:', r.total_urls_discovered);
    console.log('Crawlable URLs:', r.crawl_results_summary.crawlable_urls);
    console.log('Broken Links Count:', r.crawl_results_summary.broken_count);
    console.log('Sitemaps Found:', (r.robots.sitemaps || []).length);
    console.log('\n=== HUMAN SUMMARY ===');
    console.log(r.human_summary);
    console.log('\n=== FULL REPORT ===');
    console.log(JSON.stringify(r, null, 2));
  } catch (e) {
    console.error('Local audit failed:', e && (e.stack || e));
    process.exitCode = 2;
  }
})();
