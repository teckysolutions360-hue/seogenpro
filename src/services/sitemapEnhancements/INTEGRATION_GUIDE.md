# Sitemap Enhancements Integration Guide

## Overview

The sitemap enhancements system consists of 8 specialized modules that can be used independently or together through the orchestrator service. This guide shows how to integrate them into your existing sitemap system.

---

## Quick Start

### Basic Integration (No Changes Needed)

```javascript
const { generateEnhancedSitemap } = require('./services/sitemapEnhancements');

// In your sitemap controller
const result = await generateEnhancedSitemap(urlList, {
  baseUrl: 'https://example.com',
  validateLastmod: true,
  useIntelligentPriority: true,
  calculateQuality: true
});

// Get the XML
const xml = result.output.xml;

// Get statistics
const stats = organizer.getStatistics(result);
```

---

## Module Reference

### 1. XML Structure Validator

**Purpose**: Clean XML, remove unused namespaces, validate structure

**Key Methods**:
- `generateCleanXml(urls, options)` - Generate clean XML with only needed namespaces
- `removeDuplicates(urls)` - Deduplicate URLs
- `detectRequiredNamespaces(urls)` - Check what namespaces are needed
- `validateUrlElement(url)` - Validate individual URL entry

**Example**:
```javascript
const { xmlStructureValidator } = require('./services/sitemapEnhancements');

const urls = [
  { loc: 'https://example.com', lastmod: '2024-01-01', priority: 0.8 },
  { loc: 'https://example.com', lastmod: '2024-01-01', priority: 0.8 } // duplicate
];

// Remove duplicates
const cleaned = xmlStructureValidator.removeDuplicates(urls);
// Result: 1 URL

// Generate clean XML
const xml = xmlStructureValidator.generateCleanXml(cleaned, {
  includeImages: true,
  includeNews: false
});
```

---

### 2. Last Mod Resolver

**Purpose**: Get real lastmod dates from multiple sources (DB, HTTP, Meta, FileSystem)

**Key Methods**:
- `resolveLastMod(url, options)` - Resolve single URL's lastmod
- `resolveBatch(urls, options)` - Resolve multiple URLs concurrently

**Priority Order**:
1. Database `updated_at` field
2. HTTP `Last-Modified` header
3. Page metadata (OG tags)
4. File system modification time
5. Current date (fallback)

**Example**:
```javascript
const { lastModResolver } = require('./services/sitemapEnhancements');

// Resolve single URL
const result = await lastModResolver.resolveLastMod('https://example.com/blog/post', {
  dbRecord: { updated_at: '2024-01-15' }
});
// Result: { date: '2024-01-15', source: 'database' }

// Resolve batch
const urls = [
  'https://example.com/page1',
  'https://example.com/page2'
];

const results = await lastModResolver.resolveBatch(urls, {
  concurrent: 5,
  cache: true,
  timeout: 5000
});
```

---

### 3. Priority Calculator

**Purpose**: Assign intelligent priorities based on page type

**Key Methods**:
- `calculate(url, options)` - Calculate priority for single URL
- `calculateBatch(urls, options)` - Calculate for multiple URLs
- `setCustomRule(type, priority)` - Override priority for specific type
- `analyzeDistribution(urls, options)` - Get priority statistics

**Default Priority Schedule**:
- Homepage: 1.0
- Core/Service Pages: 0.8
- Category Pages: 0.7
- Blog Posts: 0.6
- Job Postings: 0.5
- Legal Pages: 0.3

**Modifiers Applied**:
- Paginated URLs: ×0.7
- Deep URLs (>3 levels): ×0.8
- Query parameter URLs: ×0.7

**Example**:
```javascript
const { priorityCalculator } = require('./services/sitemapEnhancements');

// Calculate single URL
const result = priorityCalculator.calculate('https://example.com/blog/post-title', {
  baseUrl: 'https://example.com'
});
// Result: { priority: 0.6, classification: 'blog_post', modifiers: [] }

// Custom rules
priorityCalculator.setCustomRule('product_page', 0.9);

// Analyze distribution
const stats = priorityCalculator.analyzeDistribution(urls);
// Result: { average: 0.68, highest: 1.0, lowest: 0.3, ... }
```

---

### 4. Canonical Validator

**Purpose**: Validate canonical tags & detect mismatches

**Key Methods**:
- `validate(url, options)` - Validate single URL
- `validateBatch(urls, options)` - Validate multiple URLs concurrently
- `getRecommendations(result)` - Get action items

**Validations**:
- Fetches page HTML
- Extracts canonical tag
- Compares with sitemap URL
- Logs mismatches
- Excludes if canonical points elsewhere

**Example**:
```javascript
const { canonicalValidator } = require('./services/sitemapEnhancements');

// Validate single URL
const result = await canonicalValidator.validate('https://example.com/page');
// Result: { valid: true, canonical: 'https://example.com/page', ... }

// Batch validate
const results = await canonicalValidator.validateBatch(urls, {
  concurrent: 3,
  cache: true
});

// Get recommendations
const recommendations = canonicalValidator.getRecommendations(results[0]);
// Result: ['Fix canonical tag', 'Check redirect chain', ...]
```

---

### 5. Image Extractor

**Purpose**: Extract images for image sitemap generation

**Key Methods**:
- `extract(url, options)` - Extract images from single URL
- `extractBatch(urls, options)` - Extract from multiple URLs
- `getStatistics(results)` - Get coverage statistics

**Image Types Detected**:
- Featured/hero images
- OG image meta tags
- Article content images

**Example**:
```javascript
const { imageExtractor } = require('./services/sitemapEnhancements');

// Extract from single URL
const result = await imageExtractor.extract('https://example.com/article', {
  maxImages: 5,
  types: ['featured', 'og', 'article']
});
// Result: { images: [...], sources: [...], ... }

// Batch extract
const results = await imageExtractor.extractBatch(urls, {
  concurrent: 5,
  cache: true,
  maxImages: 5
});

// Get stats
const stats = imageExtractor.getStatistics(results);
// Result: { coverage: 45%, totalImages: 250, ... }
```

---

### 6. Sitemap Index Generator

**Purpose**: Split large sitemaps & create index

**Key Methods**:
- `generate(urls, options)` - Generate index structure
- `generateAllFiles(urls, generator, options)` - Generate all files
- `needsSplitting(urls)` - Check if splitting needed

**Behavior**:
- If URLs > 50,000 → splits into multiple files
- Creates sitemap index file
- Names files: sitemap.xml, sitemap-2.xml, sitemap-3.xml, etc.

**Example**:
```javascript
const { sitemapIndexGenerator } = require('./services/sitemapEnhancements');

// Check if splitting needed
const needsSplit = sitemapIndexGenerator.needsSplitting(urls);

// Generate structure
const result = sitemapIndexGenerator.generate(urls, {
  baseUrl: 'https://example.com',
  sitemapPath: '/sitemap'
});

if (result.needsIndex) {
  console.log(`Need ${result.totalChunks} sitemaps`);
  
  // Generate all files
  const files = sitemapIndexGenerator.generateAllFiles(urls, xmlGenerator);
  // Result: { files: [...], indexFile: 'sitemap_index.xml' }
}
```

---

### 7. Coverage Validator

**Purpose**: Compare crawled URLs vs sitemap URLs

**Key Methods**:
- `validate(sitemapUrls, crawledUrls, options)` - Compare URL sets
- `getMetrics(result)` - Get coverage metrics
- `getReport(result)` - Get detailed report

**Output**:
- Missing: URLs crawled but not in sitemap
- Orphan: URLs in sitemap but not crawled
- Coverage %: Sitemap coverage of crawl

**Example**:
```javascript
const { coverageValidator } = require('./services/sitemapEnhancements');

const sitemapUrls = ['https://example.com', 'https://example.com/page1'];
const crawledUrls = [
  'https://example.com',
  'https://example.com/page1',
  'https://example.com/page2' // missing from sitemap
];

const result = coverageValidator.validate(sitemapUrls, crawledUrls);
// Result: {
//   covered: 2,
//   missing: ['https://example.com/page2'],
//   orphan: [],
//   coveragePercentage: 66.67,
//   healthScore: 85
// }

// Get report
const report = coverageValidator.getReport(result);
// Includes summary, recommendations, etc.
```

---

### 8. SEO Quality Scorer

**Purpose**: Calculate sitemap quality score (0-100)

**Key Methods**:
- `calculateScore(sitemapData, options)` - Calculate quality score
- `getBreakdown(result)` - Get detailed breakdown
- `getRecommendations(result)` - Get improvement suggestions

**Scoring Deductions**:
- Invalid lastmod dates: -20 max
- Poor priority distribution: -15 max
- Duplicate URLs: -15 max
- Invalid changefreq: -10 max
- Invalid URL format: -15 max
- Exceeds URL limit: -10 max

**Example**:
```javascript
const { seoQualityScorer } = require('./services/sitemapEnhancements');

const result = seoQualityScorer.calculateScore(
  { urls: sitemapUrls },
  { baseScore: 100 }
);
// Result: {
//   score: 88,
//   grade: 'B',
//   deductions: [...],
//   warnings: [...],
//   errors: [...]
// }

// Get recommendations
const recommendations = seoQualityScorer.getRecommendations(result);
```

---

## Integration Examples

### Example 1: Basic Enhancement

```javascript
// In sitemapController.js
const { orchestrator } = require('./services/sitemapEnhancements');

router.get('/sitemap.xml', async (req, res) => {
  const urls = await getUrlsFromDatabase();
  
  const result = await orchestrator.generateEnhancedSitemap(urls, {
    baseUrl: req.get('origin'),
    validateLastmod: true,
    useIntelligentPriority: true,
    calculateQuality: true
  });

  const stats = orchestrator.getStatistics(result);
  console.log(`Generated sitemap: ${stats.totalUrls} URLs, Quality: ${stats.quality.score}`);

  res.set('Content-Type', 'application/xml');
  res.send(result.output.xml);
});
```

### Example 2: Advanced with Coverage

```javascript
router.get('/sitemap-report.json', async (req, res) => {
  const urls = await getUrlsFromDatabase();
  const crawledUrls = await getCrawledUrls(); // From analytics/crawler

  const result = await orchestrator.generateEnhancedSitemap(urls, {
    baseUrl: req.get('origin'),
    validateLastmod: true,
    useIntelligentPriority: true,
    validateCanonical: true,
    extractImages: true,
    validateCoverage: true,
    calculateQuality: true,
    crawledUrls
  });

  res.json({
    sitemap: result.output.xml.substring(0, 100) + '...',
    statistics: orchestrator.getStatistics(result),
    quality: result.output.quality,
    coverage: result.output.coverage,
    recommendations: orchestrator.getRecommendations(result)
  });
});
```

### Example 3: Per-Module Usage

```javascript
// Just extract images, don't change everything else
const { imageExtractor } = require('./services/sitemapEnhancements');

const images = await imageExtractor.extractBatch(urls, { concurrent: 5 });

// Add to existing XML generation
urls.forEach((url, i) => {
  if (images[i].images?.length > 0) {
    url.images = images[i].images;
  }
});
```

---

## Performance Considerations

### Concurrency Settings

```javascript
// For large sites (100k+ URLs)
const result = await orchestrator.generateEnhancedSitemap(urls, {
  validateLastmod: { concurrent: 10 }, // Fetch more in parallel
  validateCanonical: { concurrent: 5 },
  extractImages: { concurrent: 5 }
});

// For smaller sites
const result = await orchestrator.generateEnhancedSitemap(urls, {
  validateLastmod: { concurrent: 3 },
  validateCanonical: { concurrent: 2 },
  extractImages: { concurrent: 3 }
});
```

### Caching

All modules support 1-hour in-memory caching. To disable:

```javascript
const result = await lastModResolver.resolveLastMod(url, {
  cache: false
});
```

### Timeouts

```javascript
const result = await orchestrator.generateEnhancedSitemap(urls, {
  validateLastmod: { timeout: 3000 }, // 3 seconds per request
  validateCanonical: { timeout: 5000 }
});
```

---

## Troubleshooting

### Issue: Too many HTTP requests

**Solution**: Reduce concurrency or enable caching

```javascript
const result = await orchestrator.generateEnhancedSitemap(urls, {
  validateCanonical: { concurrent: 1 } // Reduce to 1
});
```

### Issue: Memory usage high with large sitemap

**Solution**: Skip non-critical validations

```javascript
const result = await orchestrator.generateEnhancedSitemap(urls, {
  validateCanonical: false,
  extractImages: false,
  validateCoverage: false
});
```

### Issue: Quality score too low

**Review the deductions**:

```javascript
const { seoQualityScorer } = require('./services/sitemapEnhancements');
const result = seoQualityScorer.calculateScore({ urls });
console.log(result.deductions); // See what's hurting the score
```

---

## Next Steps

1. **Choose integration point**: Which controller/route handles sitemaps?
2. **Select features**: Start with basic enhancements, add more as needed
3. **Test thoroughly**: Run with small URL set first
4. **Monitor performance**: Check processing time and memory usage
5. **Iterate**: Adjust concurrency/caching based on results

---

## File Locations

All enhancement modules are in:
```
server/src/services/sitemapEnhancements/
├── xmlStructureValidator.js
├── lastModResolver.js
├── priorityCalculator.js
├── canonicalValidator.js
├── imageExtractor.js
├── sitemapIndexGenerator.js
├── coverageValidator.js
├── seoQualityScorer.js
├── orchestrator.js
└── index.js
```

Import via:
```javascript
const enhancements = require('./services/sitemapEnhancements');
```
