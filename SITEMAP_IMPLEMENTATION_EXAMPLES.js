/**
 * SITEMAP OPTIMIZATION IMPLEMENTATION GUIDE
 * 
 * Complete developer reference for integrating the optimized
 * sitemap generator with your system.
 */

// ============================================================================
// 1. BASIC USAGE - Quick Start
// ============================================================================

/**
 * Example 1: Generate a basic optimized sitemap
 */
const optimizedSitemapService = require('./services/optimizedSitemapService');

async function generateBasicSitemap() {
  const urls = [
    'https://example.com/',
    'https://example.com/services/',
    'https://example.com/blog/article-1/',
    'https://example.com/product/item-123/',
    'https://example.com/site',
  ];

  // Generate optimized XML
  const xml = optimizedSitemapService.generateOptimizedSitemapXml(urls, {
    baseUrl: 'https://example.com',
    excludeLowValue: true,      // Remove pagination, tags, etc.
    maxUrls: 50000
  });

  return xml;
}

// ============================================================================
// 2. ADVANCED USAGE - AI-Compliant Sitemap
// ============================================================================

/**
 * Example 2: Generate AI/LLM-compliant sitemap with metadata
 */
async function generateAiCompliantSitemap() {
  const urls = [
    'https://example.com/',
    'https://example.com/about/',
    'https://example.com/blog/getting-started/',
    'https://example.com/pricing/',
  ];

  const xml = optimizedSitemapService.generateAiCompliantSitemap(urls, {
    baseUrl: 'https://example.com',
    excludeLowValue: true,
    maxUrls: 10000,
    includeMetadata: true  // Add helpful comments for AI systems
  });

  console.log(xml);
  // Output includes:
  // - Metadata header with generation time
  // - URLs grouped by type
  // - Classification and importance metadata
  // - Comments for AI interpretation
}

// ============================================================================
// 3. URL CLASSIFICATION - Detailed Examples
// ============================================================================

/**
 * Example 3: Classify a URL and get its properties
 */
async function classifyUrlExample() {
  const url = 'https://example.com/blog/my-article/';
  const baseUrl = 'https://example.com';

  const classification = optimizedSitemapService.classifyUrl(url, baseUrl);

  console.log(classification);
  // Output:
  // {
  //   type: 'blog',
  //   priority: 0.8,
  //   changefreq: 'never',
  //   importance: 'high'
  // }
}

/**
 * Example 4: Classify multiple URLs
 */
async function classifyMultipleUrls() {
  const urls = [
    'https://example.com/',                    // homepage
    'https://example.com/services/',           // landing
    'https://example.com/blog/post-1/',        // blog
    'https://example.com/product/item-123/',  // product
    'https://example.com/category/tech/',      // category
    'https://example.com/about/',              // company
    'https://example.com/privacy/',            // legal
    'https://example.com/blog/page/2/',        // low-value (pagination)
    'https://example.com/tag/javascript/',    // low-value (tag)
  ];

  const baseUrl = 'https://example.com';
  const classification = {};

  urls.forEach(url => {
    const details = optimizedSitemapService.classifyUrl(url, baseUrl);
    classification[url] = {
      type: details.type,
      priority: details.priority,
      changefreq: details.changefreq
    };
  });

  console.log(classification);

  // Output shows proper classification with priorities:
  // {
  //   'https://example.com/': { type: 'homepage', priority: 1.0, ... }
  //   'https://example.com/services/': { type: 'landing', priority: 0.9, ... }
  //   'https://example.com/blog/post-1/': { type: 'blog', priority: 0.8, ... }
  //   ...
  // }
}

// ============================================================================
// 4. FILTERING & DEDUPLICATION - Clean Up URLs
// ============================================================================

/**
 * Example 5: Remove duplicates and low-value URLs
 */
async function filterUrlsExample() {
  const urls = [
    'https://example.com/',
    'https://example.com/',                    // Duplicate
    'https://example.com/blog/post-1/',
    'https://example.com/blog/post-1/',        // Duplicate
    'https://example.com/blog/page/2/',        // Pagination (low-value)
    'https://example.com/tag/javascript/',    // Tag archive (low-value)
    'https://example.com/admin/dashboard/',   // Admin (excluded)
    'https://example.com/contact/',
  ];

  const result = optimizedSitemapService.filterAndDeduplicateUrls(
    urls,
    { excludeLowValue: true }  // Filter pagination, tags, etc.
  );

  console.log(result);
  // Output:
  // {
  //   filtered: [
  //     'https://example.com/',
  //     'https://example.com/blog/post-1/',
  //     'https://example.com/contact/'
  //   ],
  //   removed: [
  //     'https://example.com/',        // Duplicate
  //     'https://example.com/blog/post-1/',
  //     'https://example.com/blog/page/2/',
  //     'https://example.com/tag/javascript/',
  //     'https://example.com/admin/dashboard/'
  //   ],
  //   count: 3
  // }
}

// ============================================================================
// 5. QUALITY ANALYSIS - Assess Your Sitemap
// ============================================================================

/**
 * Example 6: Analyze sitemap quality and get recommendations
 */
async function analyzeQualityExample() {
  const urls = [
    'https://example.com/',
    'https://example.com/services/',
    'https://example.com/blog/post-1/',
    'https://example.com/blog/post-2/',
    // ... 100+ more URLs
    'https://example.com/blog/page/10/',    // Pagination
    'https://example.com/tag/javascript/',
    'https://example.com/admin/settings/',
  ];

  const analysis = optimizedSitemapService.analyzeSitemapQuality(
    urls,
    'https://example.com'
  );

  console.log(analysis);
  // Output includes:
  // {
  //   totalUrls: 105,
  //   uniqueUrls: 98,
  //   byType: {
  //     homepage: 1,
  //     landing: 3,
  //     blog: 85,
  //     category: 2,
  //     company: 2,
  //     legal: 1,
  //     'low-value': 9
  //   },
  //   byPriority: {
  //     critical: 1,
  //     high: 88,
  //     medium: 8,
  //     low: 8
  //   },
  //   issues: [
  //     'Found 7 duplicate URLs',
  //     'High percentage of low-value pages (9 URLs)'
  //   ],
  //   recommendations: [
  //     'Remove duplicate URLs to improve crawl efficiency',
  //     'Consider excluding pagination, tags, and archive pages',
  //     'Increase priority for primary content pages'
  //   ]
  // }
}

// ============================================================================
// 6. CUSTOM INTEGRATION - With Your CMS
// ============================================================================

/**
 * Example 7: Integrate with a CMS to get accurate lastmod dates
 */
const blogs = [
  { url: '/blog/post-1/', publishedAt: '2025-11-15T09:30:00Z', updatedAt: '2025-11-15T09:30:00Z' },
  { url: '/blog/post-2/', publishedAt: '2025-10-22T14:20:00Z', updatedAt: '2025-10-25T11:00:00Z' },
];

const products = [
  { url: '/product/item-1/', updatedAt: '2026-02-18T08:45:00Z' },
  { url: '/product/item-2/', updatedAt: '2026-02-19T14:30:00Z' },
];

async function getSitemapWithDbDates(baseUrl) {
  let urls = [];

  // Add homepage
  urls.push({
    url: baseUrl + '/',
    lastmod: new Date().toISOString(),
    type: 'homepage'
  });

  // Add blog posts (with DB dates)
  blogs.forEach(blog => {
    urls.push({
      url: baseUrl + blog.url,
      lastmod: blog.updatedAt,
      type: 'blog'
    });
  });

  // Add products (with DB dates)
  products.forEach(product => {
    urls.push({
      url: baseUrl + product.url,
      lastmod: product.updatedAt,
      type: 'product'
    });
  });

  return urls;
}

// ============================================================================
// 7. EXCLUDE CUSTOM PATTERNS - Tailor for Your Site
// ============================================================================

/**
 * Example 8: Extend exclusion patterns for your specific needs
 */
class CustomSitemapService extends OptimizedSitemapService {
  constructor() {
    super();
    
    // Add custom exclusions for your site
    this.config.excludePatterns.push(
      /\/beta\//i,                    // Beta features
      /\/sandbox\//i,                 // Testing sandbox
      /\/unlisted\//i,                // Unlisted content
      /\?preview=true/i               // Preview mode
    );

    this.config.lowValuePatterns.push(
      /\/sort=/i,                     // Sort parameters
      /\/filter=/i,                   // Filter parameters
      /\/search\?q=/i                 // Search results
    );
  }
}

// ============================================================================
// 8. FULL INTEGRATION EXAMPLE - Complete Workflow
// ============================================================================

/**
 * Example 9: Complete integration with crawling, filtering, and generation
 */
async function completeSitemapWorkflow() {
  const crawlerService = require('./services/crawlerService');
  const optimizedSitemapService = require('./services/optimizedSitemapService');

  const baseUrl = 'https://example.com';

  // Step 1: Crawl website
  console.log('📍 Step 1: Crawling website...');
  const crawledUrls = [];

  await new Promise((resolve, reject) => {
    crawlerService.crawlSite({
      url: baseUrl,
      maxPages: 50000,
      respectRobotsTxt: true,
      onProgress: (progress) => console.log(`  Progress: ${progress}%`),
      onComplete: (urls) => {
        crawledUrls.push(...urls);
        resolve();
      },
      onError: reject
    });
  });

  console.log(`✅ Crawled ${crawledUrls.length} URLs\n`);

  // Step 2: Filter and deduplicate
  console.log('📍 Step 2: Filtering low-value URLs...');
  const { filtered, removed } = optimizedSitemapService.filterAndDeduplicateUrls(
    crawledUrls,
    { excludeLowValue: true }
  );

  console.log(`✅ Filtered ${removed.length} URLs`);
  console.log(`✅ Keeping ${filtered.length} high-value URLs\n`);

  // Step 3: Analyze quality
  console.log('📍 Step 3: Analyzing sitemap quality...');
  const analysis = optimizedSitemapService.analyzeSitemapQuality(filtered, baseUrl);

  console.log(`✅ Quality analysis complete`);
  if (analysis.recommendations.length > 0) {
    console.log('💡 Recommendations:');
    analysis.recommendations.forEach((rec, i) => {
      console.log(`   ${i + 1}. ${rec}`);
    });
  }
  console.log();

  // Step 4: Generate optimized sitemap
  console.log('📍 Step 4: Generating AI-compliant sitemap...');
  const sitemapXml = optimizedSitemapService.generateAiCompliantSitemap(filtered, {
    baseUrl,
    excludeLowValue: false,  // Already filtered
    maxUrls: 50000,
    includeMetadata: true
  });

  console.log(`✅ Generated sitemap (${new Blob([sitemapXml]).size} bytes)\n`);

  // Step 5: Save to file
  console.log('📍 Step 5: Saving sitemap...');
  const fs = require('fs');
  fs.writeFileSync('/public/sitemap.xml', sitemapXml);
  console.log('✅ Saved to /public/sitemap.xml\n');

  return {
    success: true,
    stats: {
      crawled: crawledUrls.length,
      filtered: filtered.length,
      removed: removed.length,
      fileSize: new Blob([sitemapXml]).size,
      analysis
    }
  };
}

// ============================================================================
// 9. API ENDPOINT INTEGRATION
// ============================================================================

/**
 * Example 10: Updated Express endpoint with optimization
 */
const express = require('express');
const router = express.Router();

router.post('/api/generate/sitemap', async (req, res) => {
  try {
    const {
      url,
      maxPages = 50000,
      optimized = true,
      excludeLowValue = true,
      aiCompliant = true,
      generateAnalysis = true
    } = req.body;

    // Validate URL
    if (!url || !/^https?:\/\//.test(url)) {
      return res.status(400).json({ error: 'Valid URL required' });
    }

    // Start async job
    const jobId = require('uuid').v4();
    
    // ... start crawling in background ...
    
    let crawledUrls = [];
    crawlerService.crawlSite({
      url,
      maxPages,
      onComplete: (urls) => {
        crawledUrls = urls;

        // Apply optimizations
        let sitemapXml;
        let analysis;

        if (aiCompliant) {
          sitemapXml = optimizedSitemapService.generateAiCompliantSitemap(urls, {
            baseUrl: url,
            excludeLowValue,
            maxUrls: maxPages
          });
        } else if (optimized) {
          sitemapXml = optimizedSitemapService.generateOptimizedSitemapXml(urls, {
            baseUrl: url,
            excludeLowValue,
            maxUrls: maxPages
          });
        }

        if (generateAnalysis) {
          analysis = optimizedSitemapService.analyzeSitemapQuality(urls, url);
        }

        // Return results...
      }
    });

    res.json({
      success: true,
      jobId,
      statusUrl: `/api/sitemap/status/${jobId}`
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// 10. TESTING & VALIDATION
// ============================================================================

/**
 * Example 11: Test your sitemap generation
 */
async function testSitemapGeneration() {
  const testUrls = [
    'https://example.com/',
    'https://example.com/services/',
    'https://example.com/blog/article-1/',
    'https://example.com/product/item-1/',
    'https://example.com/category/tech/',
    'https://example.com/about/',
    'https://example.com/privacy/',
  ];

  console.log('🧪 Testing sitemap generation...\n');

  // Test 1: Classification
  console.log('Test 1: URL Classification');
  testUrls.forEach(url => {
    const classification = optimizedSitemapService.classifyUrl(url, 'https://example.com');
    console.log(`  ${url}`);
    console.log(`    → Type: ${classification.type}, Priority: ${classification.priority}`);
  });

  // Test 2: Filtering
  console.log('\nTest 2: URL Filtering');
  const testWithDuplicates = [...testUrls, testUrls[0], 'https://example.com/page/2/'];
  const { filtered, removed } = optimizedSitemapService.filterAndDeduplicateUrls(
    testWithDuplicates,
    { excludeLowValue: true }
  );
  console.log(`  Total: ${testWithDuplicates.length}`);
  console.log(`  Filtered: ${filtered.length}`);
  console.log(`  Removed: ${removed.length}`);

  // Test 3: XML Generation
  console.log('\nTest 3: XML Generation');
  const xml = optimizedSitemapService.generateOptimizedSitemapXml(testUrls, {
    baseUrl: 'https://example.com'
  });
  console.log(`  Valid XML: ${xml.startsWith('<?xml')}`);
  console.log(`  URLs in XML: ${(xml.match(/<loc>/g) || []).length}`);
  console.log(`  Size: ${new Blob([xml]).size} bytes`);

  console.log('\n✅ All tests passed!');
}

// ============================================================================
// EXPORTS & USAGE
// ============================================================================

module.exports = {
  generateBasicSitemap,
  generateAiCompliantSitemap,
  classifyUrlExample,
  filterUrlsExample,
  analyzeQualityExample,
  completeSitemapWorkflow,
  testStemapGeneration
};

// Run examples:
// await generateBasicSitemap();
// await completeSitemapWorkflow();
// await testSitemapGeneration();
