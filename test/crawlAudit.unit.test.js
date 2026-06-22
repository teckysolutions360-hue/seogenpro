jest.mock('axios');
const axios = require('axios');
const { generateAudit } = require('../src/services/crawlAuditService');

describe('crawlAuditService - unit', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('generates report structure with sitemap + robots + page', async () => {
    // mock robots.txt
    axios.get.mockImplementation(async (url, opts) => {
      if (url.endsWith('/robots.txt')) return { status: 200, data: 'User-agent: *\nDisallow: /private\nSitemap: https://example.com/sitemap.xml' };
      if (url === 'https://example.com/sitemap.xml') return { status: 200, data: `<?xml version="1.0"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>https://example.com/</loc></url>\n</urlset>` };
      if (url === 'https://example.com/') return { status: 200, data: '<html><head><link rel="canonical" href="https://example.com/" /><meta name="robots" content="index,follow" /></head><body><a href="/about">About</a></body></html>' };
      return { status: 404, data: '' };
    });

    axios.head.mockImplementation(async (url, opts) => {
      // assume external link (no broken)
      return { status: 200 };
    });

    const report = await generateAudit('https://example.com', { maxPages: 5, concurrency: 2 });
    expect(report).toBeDefined();
    expect(report.base_url).toMatch(/example.com/);
    expect(report.crawl_results_summary).toBeDefined();
    expect(typeof report.crawl_results_summary.final_score).toBe('number');
    expect(report.per_url).toBeDefined();
    expect(Object.keys(report.per_url).length).toBeGreaterThan(0);
  }, 20000);
});
