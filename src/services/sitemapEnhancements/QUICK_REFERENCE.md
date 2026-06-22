# Sitemap Enhancements - Quick Reference

## 🚀 Import & Use

### Basic Import
```javascript
const enhancements = require('./services/sitemapEnhancements');
```

### With Destructuring
```javascript
const {
  orchestrator,
  xmlStructureValidator,
  lastModResolver,
  priorityCalculator,
  canonicalValidator,
  imageExtractor,
  sitemapIndexGenerator,
  coverageValidator,
  seoQualityScorer
} = require('./services/sitemapEnhancements');
```

---

## 📋 Common Use Cases

### Use Case 1: Generate Enhanced Sitemap

```javascript
const result = await enhancements.generateEnhancedSitemap(urls, {
  baseUrl: 'https://example.com',
  validateLastmod: true,
  useIntelligentPriority: true,
  calculateQuality: true
});

// Get XML
const xml = result.output.xml;

// Get quality report
const quality = result.output.quality;
console.log(`Quality: ${quality.score}/100 (${quality.grade})`);
```

---

### Use Case 2: Just Get Real Lastmod Dates

```javascript
const dates = await enhancements.lastModResolver.resolveBatch(urls, {
  concurrent: 5,
  cache: true
});

// dates[i].date → '2024-01-15'
// dates[i].source → 'database' | 'http' | 'meta' | 'filesystem'
```

---

### Use Case 3: Intelligent Priority Assignment

```javascript
const priorities = enhancements.priorityCalculator.calculateBatch(urls, {
  baseUrl: 'https://example.com'
});

// priorities[i].priority → 0.0 - 1.0
// priorities[i].classification → 'homepage' | 'blog_post' | etc
```

---

### Use Case 4: Coverage Analysis

```javascript
const coverage = enhancements.coverageValidator.validate(
  sitemapUrls,
  crawledUrls
);

console.log(`Coverage: ${coverage.coveragePercentage}%`);
console.log(`Missing: ${coverage.missing.length} URLs`);
console.log(`Orphan: ${coverage.orphan.length} URLs`);
console.log(`Health Score: ${coverage.healthScore}/100`);
```

---

### Use Case 5: Quality Score

```javascript
const quality = enhancements.seoQualityScorer.calculateScore({
  urls: sitemapUrls
});

console.log(`Score: ${quality.score}/100`);
console.log(`Grade: ${quality.grade}`);
console.log('Issues:', quality.deductions);
```

---

## 🔧 Configuration Presets

### Preset 1: Full Enhancement (Thorough)
```javascript
{
  baseUrl: 'https://example.com',
  validateLastmod: true,
  useIntelligentPriority: true,
  validateCanonical: true,
  extractImages: true,
  generateIndex: true,
  validateCoverage: true,
  calculateQuality: true,
  crawledUrls: [...] // Required for coverage
}
```
**Best for**: Small to medium sites, comprehensive analysis

---

### Preset 2: Balanced (Recommended)
```javascript
{
  baseUrl: 'https://example.com',
  validateLastmod: { concurrent: 5, timeout: 5000 },
  useIntelligentPriority: true,
  validateCanonical: { concurrent: 2, timeout: 5000 },
  extractImages: false,  // Skip
  generateIndex: true,
  validateCoverage: true,
  calculateQuality: true,
  crawledUrls: [...]
}
```
**Best for**: Medium sites, good performance/quality balance

---

### Preset 3: Fast Local Only
```javascript
{
  baseUrl: 'https://example.com',
  validateLastmod: false,      // No HTTP
  useIntelligentPriority: true,
  validateCanonical: false,    // No HTTP
  extractImages: false,        // No HTTP
  generateIndex: true,
  validateCoverage: false,
  calculateQuality: true
}
```
**Best for**: Large sites, speed critical, resources constrained

---

### Preset 4: Security Focus
```javascript
{
  baseUrl: 'https://example.com',
  validateLastmod: { concurrent: 1, timeout: 3000 },
  useIntelligentPriority: true,
  validateCanonical: false,
  extractImages: false,
  generateIndex: true,
  validateCoverage: false,
  calculateQuality: true
}
```
**Best for**: Restricted environments, minimal external requests

---

## 📊 Module Reference

### 1️⃣ XML Structure Validator
```javascript
// Remove duplicates
enhancements.xmlStructureValidator.removeDuplicates(urls);

// Generate clean XML
enhancements.xmlStructureValidator.generateCleanXml(urls, {
  includeImages: false,
  includeNews: false
});

// Validate structure
enhancements.xmlStructureValidator.validateUrlElement(url);
```

---

### 2️⃣ Last Mod Resolver
```javascript
// Single URL
const result = await enhancements.lastModResolver.resolveLastMod(url, {
  dbRecord: { updated_at: '2024-01-15' },
  timeout: 5000
});

// Batch
const results = await enhancements.lastModResolver.resolveBatch(urls, {
  concurrent: 5,
  cache: true
});
```

---

### 3️⃣ Priority Calculator
```javascript
// Single URL
enhancements.priorityCalculator.calculate(url, { baseUrl });

// Batch
enhancements.priorityCalculator.calculateBatch(urls, { baseUrl });

// Custom rule
enhancements.priorityCalculator.setCustomRule('product_page', 0.9);

// Get distribution
enhancements.priorityCalculator.analyzeDistribution(urls, { baseUrl });
```

---

### 4️⃣ Canonical Validator
```javascript
// Single URL
const result = await enhancements.canonicalValidator.validate(url, {
  timeout: 5000,
  cache: true
});

// Batch
const results = await enhancements.canonicalValidator.validateBatch(urls, {
  concurrent: 3,
  timeout: 5000
});

// Get report
enhancements.canonicalValidator.getReport();
```

---

### 5️⃣ Image Extractor
```javascript
// Single URL
const result = await enhancements.imageExtractor.extract(url, {
  maxImages: 5,
  types: ['featured', 'og', 'article'],
  timeout: 5000
});

// Batch
const results = await enhancements.imageExtractor.extractBatch(urls, {
  concurrent: 5,
  maxImages: 5
});

// Get stats
enhancements.imageExtractor.getStatistics(results);
```

---

### 6️⃣ Sitemap Index Generator
```javascript
// Check if needed
enhancements.sitemapIndexGenerator.needsSplitting(urls);

// Generate structure
const structure = enhancements.sitemapIndexGenerator.generate(urls, {
  baseUrl: 'https://example.com',
  sitemapPath: '/sitemap'
});

// Generate all files
const files = enhancements.sitemapIndexGenerator.generateAllFiles(urls, xmlGenerator);
```

---

### 7️⃣ Coverage Validator
```javascript
// Validate
const result = enhancements.coverageValidator.validate(
  sitemapUrls,
  crawledUrls,
  { ignoreTrailingSlash: true, ignoreScheme: true }
);

// Get metrics
enhancements.coverageValidator.getMetrics(result);

// Get report
enhancements.coverageValidator.getReport(result);

// Group by status
enhancements.coverageValidator.groupByStatus(result);
```

---

### 8️⃣ Quality Scorer
```javascript
// Calculate score
const result = enhancements.seoQualityScorer.calculateScore({
  urls: sitemapUrls
});

// Get breakdown
enhancements.seoQualityScorer.getBreakdown(result);

// Get recommendations
enhancements.seoQualityScorer.getRecommendations(result);

// Compare multiple
enhancements.seoQualityScorer.compare([result1, result2, result3]);
```

---

## 🎯 Real-World Examples

### Example: Express Middleware
```javascript
const enhancements = require('./services/sitemapEnhancements');

app.get('/sitemap.xml', async (req, res) => {
  try {
    const urls = await getUrlsFromDb();
    const result = await enhancements.generateEnhancedSitemap(urls, {
      baseUrl: req.get('origin'),
      validateLastmod: true,
      useIntelligentPriority: true,
      calculateQuality: true
    });

    res.set('Content-Type', 'application/xml');
    res.send(result.output.xml);
  } catch (error) {
    console.error(error);
    res.status(500).send('Error');
  }
});
```

---

### Example: Report Generation
```javascript
const result = await enhancements.generateEnhancedSitemap(urls, {
  baseUrl: 'https://example.com',
  validateLastmod: true,
  useIntelligentPriority: true,
  validateCanonical: false,
  extractImages: false,
  validateCoverage: true,
  calculateQuality: true,
  crawledUrls: crawlData
});

const report = {
  timestamp: new Date().toISOString(),
  statistics: enhancements.orchestrator.getStatistics(result),
  quality: result.output.quality,
  coverage: result.output.coverage,
  recommendations: enhancements.orchestrator.getRecommendations(result)
};

console.log(JSON.stringify(report, null, 2));
```

---

### Example: Batch Processing
```javascript
const BATCH_SIZE = 1000;
for (let i = 0; i < urls.length; i += BATCH_SIZE) {
  const batch = urls.slice(i, i + BATCH_SIZE);
  
  const result = await enhancements.generateEnhancedSitemap(batch, {
    baseUrl: 'https://example.com',
    validateLastmod: false,  // Skip HTTP for speed
    useIntelligentPriority: true,
    calculateQuality: true
  });

  // Save to file
  fs.writeFileSync(`sitemap-${i/BATCH_SIZE + 1}.xml`, result.output.xml);
  
  console.log(`Batch ${i/BATCH_SIZE + 1}: ${result.output.urlCount} URLs`);
}
```

---

## 🔍 Debugging

### Debug: Check Module Loading
```javascript
const enhancements = require('./services/sitemapEnhancements');

console.log('Modules loaded:');
console.log('  orchestrator:', typeof enhancements.orchestrator);
console.log('  xmlValidator:', typeof enhancements.xmlStructureValidator);
console.log('  lastModResolver:', typeof enhancements.lastModResolver);
console.log('  priorityCalculator:', typeof enhancements.priorityCalculator);
console.log('  canonicalValidator:', typeof enhancements.canonicalValidator);
console.log('  imageExtractor:', typeof enhancements.imageExtractor);
console.log('  sitemapIndex:', typeof enhancements.sitemapIndexGenerator);
console.log('  coverage:', typeof enhancements.coverageValidator);
console.log('  quality:', typeof enhancements.seoQualityScorer);
```

---

### Debug: Test Single Module
```javascript
// Test Priority Calculator
const priorities = enhancements.priorityCalculator.calculateBatch([
  'https://example.com/',
  'https://example.com/blog/post',
  'https://example.com/legal/privacy'
], { baseUrl: 'https://example.com' });

priorities.forEach((p, i) => {
  console.log(`${i}: ${p.priority} (${p.classification})`);
});
```

---

### Debug: Quality Issues
```javascript
const quality = enhancements.seoQualityScorer.calculateScore({ urls: myUrls });

console.log('Score:', quality.score);
console.log('Grade:', quality.grade);
console.log('Deductions:', quality.deductions);
console.log('Warnings:', quality.warnings);
console.log('Errors:', quality.errors);

// See full breakdown
console.log(JSON.stringify(quality, null, 2));
```

---

## 📈 Performance Monitoring

### Track Processing Time
```javascript
const startTime = Date.now();

const result = await enhancements.generateEnhancedSitemap(urls, options);

const duration = Date.now() - startTime;
console.log(`Processing time: ${duration}ms`);
console.log(`Per URL: ${(duration / urls.length).toFixed(2)}ms`);
```

---

### Track Memory Usage
```javascript
const before = process.memoryUsage().heapUsed;

const result = await enhancements.generateEnhancedSitemap(urls, options);

const after = process.memoryUsage().heapUsed;
const used = (after - before) / 1024 / 1024;
console.log(`Memory used: ${used.toFixed(2)}MB`);
```

---

## 🚨 Common Issues & Fixes

### Issue: Slow HTTP Requests
**Fix**: Reduce concurrency, increase timeout
```javascript
{
  validateCanonical: { concurrent: 1, timeout: 10000 },
  validateLastmod: { concurrent: 1, timeout: 10000 }
}
```

---

### Issue: High Memory Usage
**Fix**: Process in batches, skip non-essential modules
```javascript
// Skip image extraction
{ extractImages: false }

// Skip canonical validation
{ validateCanonical: false }

// Process in batches
for (let i = 0; i < urls.length; i += 1000) {
  const batch = urls.slice(i, i + 1000);
  const result = await enhancements.generateEnhancedSitemap(batch, options);
}
```

---

### Issue: Low Quality Score
**Fix**: Check deductions and address issues
```javascript
const quality = enhancements.seoQualityScorer.calculateScore({ urls });

// See specific issues
quality.deductions.forEach(d => {
  console.log(`${d.issue}: -${d.deduction}`);
});

// Fix recommendations
const recommendations = enhancements.seoQualityScorer.getRecommendations(quality);
```

---

## 📚 Documentation Files

- **IMPLEMENTATION_SUMMARY.md** - Overview & status
- **INTEGRATION_GUIDE.md** - Step-by-step integration
- **README.md** - Complete reference
- **DEPLOYMENT_CHECKLIST.md** - Deployment steps
- **EXAMPLES.js** - Working code examples
- **QUICK_REFERENCE.md** - This file

---

## 🎓 Learning Resources

1. **Start**: Read INTEGRATION_GUIDE.md
2. **Understand**: Review README.md
3. **Try**: Run EXAMPLES.js
4. **Integrate**: Update your controller
5. **Deploy**: Follow DEPLOYMENT_CHECKLIST.md
6. **Reference**: Use this QUICK_REFERENCE.md

---

## 💡 Tips & Tricks

### Tip 1: Cache Warm-up
```javascript
// Pre-fetch commonly accessed URLs
const warmUpUrls = ['/', '/about', '/contact'];
await enhancements.lastModResolver.resolveBatch(warmUpUrls, { cache: true });
```

---

### Tip 2: Parallel Processing
```javascript
// Process multiple batches in parallel
const batches = [...];
const results = await Promise.all(
  batches.map(batch => enhancements.generateEnhancedSitemap(batch, options))
);
```

---

### Tip 3: Custom Priority Rules
```javascript
// Set custom priorities for your site
enhancements.priorityCalculator.setCustomRule('feature_page', 0.9);
enhancements.priorityCalculator.setCustomRule('archive_page', 0.4);
```

---

### Tip 4: Monitor Quality Trend
```javascript
// Track quality score over time
const dailyScores = [];
dailyScores.push({
  date: new Date().toISOString().split('T')[0],
  score: quality.score,
  grade: quality.grade
});
// Add to database for trending
```

---

## 🔗 Quick Links

- View source: `server/src/services/sitemapEnhancements/`
- Import path: `./services/sitemapEnhancements`
- Main export: `index.js`
- Entry point: `orchestrator.js`

---

## ✅ Validation Checklist

Before going to production:

- [ ] All modules load without errors
- [ ] Test with sample URLs works
- [ ] XML output is valid
- [ ] Quality score is reasonable
- [ ] Performance is acceptable
- [ ] Memory usage is stable
- [ ] Error handling works
- [ ] Logging is configured
- [ ] Monitoring is set up

---

**Version**: 1.0  
**Last Updated**: 2024-01-20  
**Status**: Production Ready ✅
