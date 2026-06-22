/**
 * Sitemap Enhancements - Usage Examples
 * 
 * Complete examples showing how to use each module
 * and the orchestrator for production scenarios
 */

// ==========================================
// EXAMPLE 1: Basic Usage - Orchestrator
// ==========================================

async function exampleBasicUsage() {
  const enhancements = require('./index');

  // Sample URLs
  const urls = [
    { loc: 'https://example.com/', changefreq: 'daily', priority: 1.0 },
    { loc: 'https://example.com/about', changefreq: 'weekly', priority: 0.8 },
    { loc: 'https://example.com/blog/post-1', changefreq: 'monthly', priority: 0.6 },
    { loc: 'https://example.com/blog/post-2', changefreq: 'monthly', priority: 0.6 }
  ];

  // Generate enhanced sitemap
  const result = await enhancements.generateEnhancedSitemap(urls, {
    baseUrl: 'https://example.com',
    validateLastmod: true,
    useIntelligentPriority: true,
    calculateQuality: true
  });

  // Output
  console.log('Enhanced Sitemap Generated');
  console.log('Stats:', enhancements.getStatistics(result));
  console.log('Recommendations:', enhancements.getRecommendations(result));
  
  return result;
}

// ==========================================
// EXAMPLE 2: Individual Module - XML Validator
// ==========================================

async function exampleXmlValidator() {
  const { xmlStructureValidator } = require('./index');

  const urls = [
    { loc: 'https://example.com/page1' },
    { loc: 'https://example.com/page1' }, // duplicate
    { loc: 'https://example.com/page2' }
  ];

  // Remove duplicates
  const cleaned = xmlStructureValidator.removeDuplicates(urls);
  console.log(`Cleaned: ${urls.length} → ${cleaned.length} URLs`);

  // Validate each URL
  cleaned.forEach(url => {
    const validation = xmlStructureValidator.validateUrlElement(url);
    if (!validation.valid) {
      console.error(`Invalid URL: ${url.loc}`, validation.errors);
    }
  });

  // Generate clean XML
  const xml = xmlStructureValidator.generateCleanXml(cleaned, {
    includeImages: false,
    includeNews: false
  });

  console.log('XML Length:', xml.length, 'bytes');
  return xml;
}

// ==========================================
// EXAMPLE 3: Individual Module - Lastmod Resolver
// ==========================================

async function exampleLastmodResolver() {
  const { lastModResolver } = require('./index');

  // With database record
  const result1 = await lastModResolver.resolveLastMod(
    'https://example.com/page',
    {
      dbRecord: { updated_at: '2024-01-15T10:30:00Z' },
      timeout: 5000
    }
  );
  console.log('From DB:', result1.date, `(${result1.source})`);

  // Without database record - will try HTTP/Meta/FileSystem
  const result2 = await lastModResolver.resolveLastMod(
    'https://example.com/blog/post',
    { timeout: 5000 }
  );
  console.log('From HTTP/Meta:', result2.date, `(${result2.source})`);

  // Batch processing
  const urls = [
    'https://example.com/page1',
    'https://example.com/page2',
    'https://example.com/page3'
  ];

  const batchResults = await lastModResolver.resolveBatch(urls, {
    concurrent: 3,
    cache: true,
    timeout: 5000
  });

  console.log('Batch resolved:', batchResults.length, 'lastmod dates');
  batchResults.forEach((result, i) => {
    console.log(`[${i}] ${urls[i]} → ${result.date} (${result.source})`);
  });
}

// ==========================================
// EXAMPLE 4: Individual Module - Priority Calculator
// ==========================================

async function examplePriorityCalculator() {
  const { priorityCalculator } = require('./index');

  const testUrls = [
    'https://example.com/',
    'https://example.com/about',
    'https://example.com/products',
    'https://example.com/products/item-1',
    'https://example.com/blog/my-post',
    'https://example.com/blog/my-post?page=2',
    'https://example.com/jobs/engineer',
    'https://example.com/legal/privacy'
  ];

  console.log('Priority Calculation Examples:');
  testUrls.forEach(url => {
    const result = priorityCalculator.calculate(url, {
      baseUrl: 'https://example.com'
    });
    console.log(`  ${url}`);
    console.log(`    → ${result.priority} (Classification: ${result.classification})`);
  });

  // Custom rule
  priorityCalculator.setCustomRule('job_posting', 0.8); // Increase job priority

  // Batch processing
  const batchResults = priorityCalculator.calculateBatch(testUrls, {
    baseUrl: 'https://example.com'
  });

  // Analyze distribution
  const distribution = priorityCalculator.analyzeDistribution(testUrls, {
    baseUrl: 'https://example.com'
  });

  console.log('\nPriority Distribution:');
  console.log(`  Average: ${distribution.average}`);
  console.log(`  Highest: ${distribution.highest}`);
  console.log(`  Lowest: ${distribution.lowest}`);
}

// ==========================================
// EXAMPLE 5: Individual Module - Canonical Validator
// ==========================================

async function exampleCanonicalValidator() {
  const { canonicalValidator } = require('./index');

  // Validate single URL
  try {
    const result = await canonicalValidator.validate('https://example.com/page', {
      timeout: 5000,
      cache: true
    });

    console.log('Canonical Validation:');
    console.log(`  Valid: ${result.valid}`);
    console.log(`  URL: ${result.url}`);
    console.log(`  Canonical: ${result.canonical}`);
    if (!result.valid) {
      console.log(`  Issue: ${result.issues}`);
    }
  } catch (error) {
    console.log('Could not reach page:', error.message);
  }

  // Batch validation
  const urls = [
    'https://example.com/page1',
    'https://example.com/page2',
    'https://example.com/page3'
  ];

  const results = await canonicalValidator.validateBatch(urls, {
    concurrent: 2,
    timeout: 5000,
    cache: true
  });

  const mismatches = results.filter(r => !r.valid);
  console.log(`\nBatch Results: ${results.length} URLs, ${mismatches.length} mismatches`);

  // Get report
  const report = canonicalValidator.getReport();
  console.log('Report:', report);
}

// ==========================================
// EXAMPLE 6: Individual Module - Image Extractor
// ==========================================

async function exampleImageExtractor() {
  const { imageExtractor } = require('./index');

  // Extract from single URL
  try {
    const result = await imageExtractor.extract('https://example.com/article', {
      maxImages: 5,
      types: ['featured', 'og', 'article'],
      timeout: 5000,
      cache: true
    });

    console.log('Images Extracted:');
    console.log(`  Featured: ${result.featuredImage || 'None'}`);
    console.log(`  OG Image: ${result.ogImage || 'None'}`);
    console.log(`  Article Images: ${result.articleImages?.length || 0}`);
  } catch (error) {
    console.log('Could not extract images:', error.message);
  }

  // Batch extraction
  const urls = [
    'https://example.com/article-1',
    'https://example.com/article-2',
    'https://example.com/article-3'
  ];

  const results = await imageExtractor.extractBatch(urls, {
    concurrent: 3,
    maxImages: 5,
    cache: true
  });

  // Get statistics
  const stats = imageExtractor.getStatistics(results);
  console.log('\nImage Statistics:');
  console.log(`  Coverage: ${stats.coverage}%`);
  console.log(`  Total Images: ${stats.totalImages}`);
  console.log(`  Average per URL: ${stats.averagePerUrl}`);
}

// ==========================================
// EXAMPLE 7: Individual Module - Sitemap Index
// ==========================================

function exampleSitemapIndex() {
  const { sitemapIndexGenerator } = require('./index');

  // Generate 75,000 sample URLs
  const largeUrlSet = Array.from({ length: 75000 }, (_, i) => ({
    loc: `https://example.com/page-${i + 1}`
  }));

  // Check if needs splitting
  const needsSplit = sitemapIndexGenerator.needsSplitting(largeUrlSet);
  console.log(`Needs Index: ${needsSplit}`);

  // Get recommendations
  const recommendations = sitemapIndexGenerator.getRecommendations(largeUrlSet);
  console.log('Recommendations:', recommendations);

  // Generate structure
  const structure = sitemapIndexGenerator.generate(largeUrlSet, {
    baseUrl: 'https://example.com',
    sitemapPath: '/sitemap'
  });

  if (structure.needsIndex) {
    console.log(`\nGenerated Index:`);
    console.log(`  Total Chunks: ${structure.totalChunks}`);
    console.log(`  Index URL: ${structure.indexUrl}`);
    console.log(`  Sitemaps:`);
    structure.sitemaps.forEach(sitemap => {
      console.log(`    - ${sitemap.filename}: ${sitemap.count} URLs`);
    });
  }
}

// ==========================================
// EXAMPLE 8: Individual Module - Coverage Validator
// ==========================================

function exampleCoverageValidator() {
  const { coverageValidator } = require('./index');

  // Sitemap URLs from your index
  const sitemapUrls = [
    'https://example.com/',
    'https://example.com/page1',
    'https://example.com/page2',
    'https://example.com/page3',
    'https://example.com/products/item-1',
    'https://example.com/products/item-2',
    'https://example.com/blog/post-1',
    'https://example.com/blog/post-2'
  ];

  // Crawled URLs from your crawler/analytics
  const crawledUrls = [
    'https://example.com/',
    'https://example.com/page1',
    'https://example.com/page2',
    'https://example.com/page4', // Not in sitemap
    'https://example.com/products/item-1',
    'https://example.com/products/item-3', // Not in sitemap
    'https://example.com/blog/post-1',
    'https://example.com/blog/post-2'
  ];

  // Validate coverage
  const result = coverageValidator.validate(sitemapUrls, crawledUrls);

  console.log('Coverage Validation:');
  console.log(`  Covered: ${result.covered}/${result.totalCrawled}`);
  console.log(`  Coverage: ${result.coveragePercentage}%`);
  console.log(`  Health Score: ${result.healthScore}/100`);
  console.log(`  Missing from sitemap: ${result.missing.length}`);
  result.missing.forEach(url => console.log(`    - ${url}`));
  console.log(`  Orphaned in sitemap: ${result.orphan.length}`);

  // Get detailed report
  const report = coverageValidator.getReport(result);
  console.log('\nDetailed Report:');
  console.log(JSON.stringify(report, null, 2));
}

// ==========================================
// EXAMPLE 9: Individual Module - Quality Scorer
// ==========================================

function exampleQualityScorer() {
  const { seoQualityScorer } = require('./index');

  // Sample sitemap data
  const sitemapData = {
    urls: [
      { loc: 'https://example.com/', priority: 1.0, lastmod: '2024-01-20', changefreq: 'daily' },
      { loc: 'https://example.com/page1', priority: 0.8, lastmod: '2024-01-15', changefreq: 'weekly' },
      { loc: 'https://example.com/page2', priority: 0.8, lastmod: '2024-01-20', changefreq: 'weekly' },
      { loc: 'https://example.com/page3', priority: 0.8, lastmod: '2024-01-20', changefreq: 'weekly' },
      { loc: 'https://example.com/page1', priority: 0.7, lastmod: '2024-01-20' }, // duplicate
      { loc: 'https://example.com/blog/post', priority: 0.6, lastmod: 'invalid-date' } // bad date
    ]
  };

  // Calculate score
  const result = seoQualityScorer.calculateScore(sitemapData);

  console.log('Quality Score:');
  console.log(`  Score: ${result.score}/100`);
  console.log(`  Grade: ${result.grade}`);
  console.log(`  Total Deductions: ${result.totalDeductions}`);

  console.log('\nDeductions:');
  result.deductions.forEach(d => {
    console.log(`  - ${d.issue}: -${d.deduction}`);
  });

  if (result.errors.length > 0) {
    console.log('\nErrors:');
    result.errors.forEach(e => console.log(`  - ${e}`));
  }

  if (result.warnings.length > 0) {
    console.log('\nWarnings:');
    result.warnings.forEach(w => console.log(`  - ${w}`));
  }

  // Get recommendations
  const recommendations = seoQualityScorer.getRecommendations(result);
  console.log('\nRecommendations:');
  recommendations.forEach(r => {
    console.log(`  [${r.priority.toUpperCase()}] ${r.message}`);
  });

  // Get detailed breakdown
  const breakdown = seoQualityScorer.getBreakdown(result);
  console.log('\nDetailed Breakdown:');
  console.log(JSON.stringify(breakdown, null, 2));
}

// ==========================================
// EXAMPLE 10: Complete Pipeline with Orchestrator
// ==========================================

async function exampleCompletePipeline() {
  const { orchestrator } = require('./index');

  // Get URLs from your database
  const urls = [
    { loc: 'https://example.com/', lastmod: '2024-01-20' },
    { loc: 'https://example.com/about', lastmod: '2024-01-10' },
    { loc: 'https://example.com/services' },
    { loc: 'https://example.com/blog/post-1' },
    { loc: 'https://example.com/blog/post-2' },
    { loc: 'https://example.com/contact' }
  ];

  // Get crawled URLs (from crawler, analytics, etc.)
  const crawledUrls = [
    'https://example.com/',
    'https://example.com/about',
    'https://example.com/services',
    'https://example.com/blog/post-1',
    'https://example.com/blog/post-2',
    'https://example.com/contact',
    'https://example.com/admin' // Crawled but not in sitemap
  ];

  console.log('Starting Complete Pipeline...\n');

  const result = await orchestrator.generateEnhancedSitemap(urls, {
    baseUrl: 'https://example.com',
    validateLastmod: true,
    useIntelligentPriority: true,
    validateCanonical: false, // Skip for demo (would require real pages)
    extractImages: false,      // Skip for demo
    generateIndex: false,
    validateCoverage: true,
    calculateQuality: true,
    crawledUrls
  });

  // Display results
  console.log('Pipeline Complete!\n');

  console.log('Processing Steps:');
  result.steps.forEach((step, i) => {
    const symbol = step.status === 'completed' ? '✓' : '✗';
    console.log(`  ${symbol} ${step.name}`);
    if (step.result) {
      Object.entries(step.result).forEach(([key, value]) => {
        console.log(`      ${key}: ${value}`);
      });
    }
  });

  console.log('\nFinal Output:');
  console.log(`  XML Length: ${result.output.xml.length} bytes`);

  if (result.output.quality) {
    console.log(`  Quality Score: ${result.output.quality.score}/100 (${result.output.quality.grade})`);
  }

  if (result.output.coverage) {
    console.log(`  Coverage: ${result.output.coverage.coveragePercentage}%`);
    console.log(`  Health Score: ${result.output.coverage.healthScore}/100`);
  }

  console.log(`\nProcessing Time: ${result.duration}ms`);

  return result;
}

// ==========================================
// RUN EXAMPLES
// ==========================================

async function runAllExamples() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Sitemap Enhancements - Usage Examples');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    console.log('EXAMPLE 1: Basic Usage');
    console.log('───────────────────────');
    await exampleBasicUsage();
    console.log('\n');

    console.log('EXAMPLE 2: XML Validator');
    console.log('───────────────────────');
    await exampleXmlValidator();
    console.log('\n');

    console.log('EXAMPLE 3: Priority Calculator');
    console.log('──────────────────────────────');
    await examplePriorityCalculator();
    console.log('\n');

    console.log('EXAMPLE 4: Sitemap Index');
    console.log('────────────────────────');
    exampleSitemapIndex();
    console.log('\n');

    console.log('EXAMPLE 5: Coverage Validator');
    console.log('────────────────────────────');
    exampleCoverageValidator();
    console.log('\n');

    console.log('EXAMPLE 6: Quality Scorer');
    console.log('─────────────────────────');
    exampleQualityScorer();
    console.log('\n');

    console.log('EXAMPLE 10: Complete Pipeline');
    console.log('─────────────────────────────');
    await exampleCompletePipeline();
    console.log('\n');

    console.log('═══════════════════════════════════════════════════════════');
    console.log('All examples completed successfully!');
    console.log('═══════════════════════════════════════════════════════════');

  } catch (error) {
    console.error('Error running examples:', error.message);
  }
}

// Export examples for use elsewhere
module.exports = {
  exampleBasicUsage,
  exampleXmlValidator,
  exampleLastmodResolver,
  examplePriorityCalculator,
  exampleCanonicalValidator,
  exampleImageExtractor,
  exampleSitemapIndex,
  exampleCoverageValidator,
  exampleQualityScorer,
  exampleCompletePipeline,
  runAllExamples
};

// Uncomment to run:
// if (require.main === module) {
//   runAllExamples();
// }
