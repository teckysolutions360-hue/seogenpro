# 🔍 Sitemap Analyzer & Optimizer - Complete Guide

## 📋 Overview

The **Sitemap Analyzer & Optimizer** is a powerful Node.js tool that:

✅ **Analyzes your sitemap XML** - Parses and classifies all URLs  
✅ **Intelligently assigns priorities** - Based on content type and importance  
✅ **Detects duplicates & low-value URLs** - Removes pagination, tags, filters  
✅ **Optimizes changefreq values** - Based on content update patterns  
✅ **Generates recommendations** - Actionable SEO improvements  
✅ **Produces optimized sitemaps** - With AI/LLM-friendly metadata  

---

## 🚀 Quick Start

### Option 1: Use the Test Script

```bash
cd c:\Users\Perfect\OneDrive\Desktop\llms\server
node test-sitemap-analyzer.js
```

This will:
- Parse your example sitemap
- Generate a detailed analysis report
- Create optimized sitemap XML
- Save both to JSON and XML files

### Option 2: Use the REST API

```bash
# Start your Express server
node server.js

# Then make requests to:
POST /api/analyze/sitemap
GET /api/analyze/sitemap/status/:jobId
GET /api/analyze/sitemap/xml/:jobId
```

---

## 💻 API Endpoints

### 1. Analyze a Sitemap

**Endpoint:** `POST /api/analyze/sitemap`

**Request:**
```javascript
{
  // Option A: Provide XML string directly
  "sitemapXml": "<?xml version=\"1.0\"?>...",
  
  // Option B: Provide sitemap URL
  "sitemapUrl": "https://example.com/sitemap.xml",
  
  // Optional parameters
  "baseUrl": "https://example.com",
  "excludeLowValue": true,
  "generateOptimizedXml": true,
  "fetchLastmod": false  // Fetch actual page timestamps
}
```

**Response:**
```javascript
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "statusUrl": "/api/analyze/sitemap/status/550e8400-e29b-41d4-a716-446655440000",
  "message": "Analysis started. Check status URL for results."
}
```

**Example with curl:**
```bash
curl -X POST http://localhost:3000/api/analyze/sitemap \
  -H "Content-Type: application/json" \
  -d '{
    "sitemapXml": "<?xml version=\"1.0\"?><urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\"><url><loc>https://example.com/</loc></url></urlset>",
    "baseUrl": "https://example.com"
  }'
```

---

### 2. Get Analysis Status & Results

**Endpoint:** `GET /api/analyze/sitemap/status/:jobId`

**Response (while processing):**
```javascript
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "processing",
  "progress": 45,
  "elapsedSeconds": 12.34
}
```

**Response (completed):**
```javascript
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "completedTime": "2026-02-20T15:30:00.000Z",
  "analysis": {
    "baseUrl": "https://sjwrites.com",
    "statistics": {
      "totalUrls": 10,
      "optimizedUrls": 8,
      "removedUrls": 2,
      "duplicatesFound": 0,
      "lowValueUrlsIdentified": 2,
      "byType": {
        "homepage": 1,
        "blog_index": 1,
        "blog_post": 2,
        "company": 2,
        "legal": 2
      },
      "byPriority": {
        "1": 1,
        "0.9": 1,
        "0.8": 2,
        "0.7": 2,
        "0.5": 2
      }
    },
    "recommendations": [
      {
        "priority": "high",
        "title": "Exclude Low-Value URLs",
        "description": "Found 2 pagination and tag pages that waste crawl budget",
        "action": "Use robots.txt or noindex to exclude these patterns",
        "impact": "Improves crawl budget allocation by 20-25%"
      }
    ]
  },
  "downloadLinks": {
    "report": "/api/analyze/sitemap/report/550e8400-e29b-41d4-a716-446655440000",
    "optimizedXml": "/api/analyze/sitemap/xml/550e8400-e29b-41d4-a716-446655440000",
    "json": "/api/analyze/sitemap/json/550e8400-e29b-41d4-a716-446655440000"
  }
}
```

---

### 3. Download Optimized Sitemap XML

**Endpoint:** `GET /api/analyze/sitemap/xml/:jobId`

**Response:** Returns optimized sitemap.xml file with:
- Intelligent priority assignment
- Optimized changefreq values
- AI/LLM metadata comments
- Low-value URLs excluded

**Example:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!-- Optimized Sitemap
  Generated: 2026-02-20T15:30:00.000Z
  URLs: 8
  Classification: Complete priority assignment applied
  For AI/LLM: Each URL includes type and importance metadata
-->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://sjwrites.com/</loc>
    <lastmod>2026-02-20</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
    <!-- classification: homepage -->
    <!-- importance: critical -->
  </url>
  <url>
    <loc>https://sjwrites.com/blogs</loc>
    <lastmod>2026-02-20</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
    <!-- classification: blog_index -->
    <!-- importance: high -->
  </url>
</urlset>
```

---

### 4. Download Analysis Report (Text)

**Endpoint:** `GET /api/analyze/sitemap/report/:jobId`

Returns a human-readable analysis report with all findings and recommendations.

---

### 5. Download Analysis Data (JSON)

**Endpoint:** `GET /api/analyze/sitemap/json/:jobId`

Returns detailed analysis data as JSON for programmatic use.

---

### 6. Classify a Single URL

**Endpoint:** `POST /api/analyze/classify`

**Request:**
```javascript
{
  "url": "https://example.com/blog/my-article",
  "baseUrl": "https://example.com"
}
```

**Response:**
```javascript
{
  "url": "https://example.com/blog/my-article",
  "classification": {
    "type": "blog_post",
    "priority": 0.8,
    "changefreq": "monthly",
    "importance": "high",
    "rationale": "Published blog article"
  }
}
```

---

### 7. Classify Multiple URLs

**Endpoint:** `POST /api/analyze/classify-bulk`

**Request:**
```javascript
{
  "urls": [
    "https://example.com/",
    "https://example.com/blog/article",
    "https://example.com/about",
    "https://example.com/blog/page/2"
  ],
  "baseUrl": "https://example.com"
}
```

**Response:**
```javascript
{
  "count": 4,
  "classifications": [
    {
      "url": "https://example.com/",
      "type": "homepage",
      "priority": 1.0,
      "changefreq": "weekly",
      "importance": "critical"
    },
    {
      "url": "https://example.com/blog/article",
      "type": "blog_post",
      "priority": 0.8,
      "changefreq": "monthly",
      "importance": "high"
    },
    // ... more URLs
  ]
}
```

---

### 8. Get Job Statistics

**Endpoint:** `GET /api/analyze/stats/:jobId`

**Response:**
```javascript
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "duration": "4.25s",
  "startTime": "2026-02-20T15:29:55.000Z",
  "completedTime": "2026-02-20T15:30:00.000Z",
  "statistics": {
    "totalUrls": 10,
    "optimizedUrls": 8,
    "removedUrls": 2,
    "duplicatesFound": 0,
    "lowValueUrlsIdentified": 2
  }
}
```

---

### 9. List All Jobs

**Endpoint:** `GET /api/analyze/jobs`

**Response:**
```javascript
{
  "total": 3,
  "jobs": [
    {
      "jobId": "550e8400-e29b-41d4-a716-446655440000",
      "status": "completed",
      "created": "2026-02-20T15:29:55.000Z",
      "completed": "2026-02-20T15:30:00.000Z",
      "urlsAnalyzed": 8
    },
    // ... more jobs
  ]
}
```

---

### 10. Delete a Job

**Endpoint:** `DELETE /api/analyze/jobs/:jobId`

**Response:**
```javascript
{
  "message": "Job deleted",
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed"
}
```

---

## 📊 URL Classification System

The analyzer automatically classifies URLs into 7 categories:

### 1. **Homepage** (Priority 1.0)
- Pattern: `/` or `/index`
- Changefreq: `weekly`
- Importance: `critical`
- **Why:** Main entry point for crawlers

```javascript
{
  "type": "homepage",
  "priority": 1.0,
  "changefreq": "weekly"
}
```

---

### 2. **Blog Index** (Priority 0.9)
- Pattern: `/blog`, `/blogs`
- Changefreq: `weekly`
- Importance: `high`
- **Why:** Hub for all blog content

```javascript
{
  "type": "blog_index",
  "priority": 0.9,
  "changefreq": "weekly"
}
```

---

### 3. **Blog Post** (Priority 0.8)
- Pattern: `/blog/article-title`
- Changefreq: `monthly`
- Importance: `high`
- **Why:** Individual published articles

```javascript
{
  "type": "blog_post",
  "priority": 0.8,
  "changefreq": "monthly"
}
```

---

### 4. **Product/Service** (Priority 0.8)
- Pattern: `/product/item`, `/services/service`
- Changefreq: `monthly`
- Importance: `high`
- **Why:** Sales-focused content

```javascript
{
  "type": "product",
  "priority": 0.8,
  "changefreq": "monthly"
}
```

---

### 5. **Landing Pages** (Priority 0.9)
- Pattern: `/services`, `/pricing`, `/features`
- Changefreq: `monthly`
- Importance: `high`
- **Why:** Main section entry points

```javascript
{
  "type": "landing",
  "priority": 0.9,
  "changefreq": "monthly"
}
```

---

### 6. **Company Info** (Priority 0.7)
- Pattern: `/about`, `/team`, `/contact`
- Changefreq: `monthly`
- Importance: `medium`
- **Why:** Brand-building pages

```javascript
{
  "type": "company",
  "priority": 0.7,
  "changefreq": "monthly"
}
```

---

### 7. **Legal Pages** (Priority 0.5)
- Pattern: `/privacy`, `/terms`, `/legal`
- Changefreq: `yearly`
- Importance: `medium`
- **Why:** Required but infrequently updated

```javascript
{
  "type": "legal",
  "priority": 0.5,
  "changefreq": "yearly"
}
```

---

## 🚫 Automatically Excluded URLs

These patterns are automatically identified as low-value:

| Pattern | Reason |
|---------|--------|
| `/page/2/`, `/page/3/` | Pagination |
| `/tag/javascript/` | Tag archives |
| `/search/?q=...` | Search results |
| `/admin/`, `/dashboard/` | Admin pages |
| `/login/`, `/signup/` | Authentication |
| `/cart/`, `/checkout/` | Commerce flow |
| `?utm_source=...` | Tracking parameters |
| `?fbclid=...`, `?gclid=...` | Ad tracking |

---

## 💻 JavaScript Usage Examples

### Example 1: Analyze Sitemap from String

```javascript
const SitemapAnalyzer = require('./utils/sitemapAnalyzer');
const fs = require('fs');

async function analyzeSitemap() {
  const analyzer = new SitemapAnalyzer();
  
  // Read your sitemap XML
  const sitemapXml = fs.readFileSync('public/sitemap.xml', 'utf-8');
  
  // Parse it
  const urls = await analyzer.parseSitemapFromString(sitemapXml);
  
  // Analyze
  const analysis = await analyzer.analyzeSitemap(urls, {
    baseUrl: 'https://example.com',
    excludeLowValue: true
  });
  
  // Generate report
  const report = analyzer.generateReport(analysis);
  console.log(report);
  
  // Generate optimized XML
  const optimizedXml = analyzer.generateOptimizedXml(
    analysis.optimizedUrls,
    { includeMetadata: true }
  );
  
  // Save it
  fs.writeFileSync('public/sitemap-optimized.xml', optimizedXml);
}

analyzeSitemap().catch(console.error);
```

---

### Example 2: Classify a Single URL

```javascript
const SitemapAnalyzer = require('./utils/sitemapAnalyzer');

const analyzer = new SitemapAnalyzer();

const classification = analyzer.classifyUrl(
  'https://blog.example.com/posts/my-article',
  'https://blog.example.com'
);

console.log(classification);
// Output:
// {
//   type: 'blog_post',
//   priority: 0.8,
//   changefreq: 'monthly',
//   importance: 'high',
//   rationale: 'Published blog article'
// }
```

---

### Example 3: Check for Duplicates

```javascript
const SitemapAnalyzer = require('./utils/sitemapAnalyzer');

const analyzer = new SitemapAnalyzer();

const urls = [
  { loc: 'https://example.com/page' },
  { loc: 'https://example.com/page/' },  // Duplicate with trailing slash
  { loc: 'https://example.com/blog' }
];

const duplicates = analyzer.detectDuplicates(urls);
console.log(duplicates);
// Output: Shows the trailing slash variation as a duplicate
```

---

### Example 4: Identify Low-Value URLs

```javascript
const SitemapAnalyzer = require('./utils/sitemapAnalyzer');

const analyzer = new SitemapAnalyzer();

const urls = [
  { loc: 'https://example.com/' },
  { loc: 'https://example.com/blog/page/2' },      // Pagination
  { loc: 'https://example.com/blog/tag/javascript' }, // Tag
  { loc: 'https://example.com/search' }            // Search
];

const lowValue = analyzer.identifyLowValueUrls(urls);
console.log(lowValue);
// Output: Lists all low-value URLs with reasons
```

---

### Example 5: Full Async Analysis Workflow

```javascript
const SitemapAnalyzer = require('./utils/sitemapAnalyzer');
const axios = require('axios');

async function fullWorkflow() {
  const analyzer = new SitemapAnalyzer();
  
  // Fetch sitemap from URL
  const response = await axios.get('https://example.com/sitemap.xml');
  
  // Parse it
  const urls = await analyzer.parseSitemapFromString(response.data);
  
  // Analyze
  const analysis = await analyzer.analyzeSitemap(urls, {
    baseUrl: 'https://example.com',
    excludeLowValue: true
  });
  
  // Show statistics
  console.log('Analysis Complete!');
  console.log(`Total URLs: ${analysis.statistics.totalUrls}`);
  console.log(`Optimized URLs: ${analysis.statistics.optimizedUrls}`);
  
  // Show top recommendations
  console.log('\nTop Recommendations:');
  analysis.recommendations.slice(0, 3).forEach(rec => {
    console.log(`- ${rec.title}: ${rec.description}`);
  });
  
  // Generate optimized XML
  const optimizedXml = analyzer.generateOptimizedXml(
    analysis.optimizedUrls,
    { includeMetadata: true }
  );
  
  return optimizedXml;
}

fullWorkflow().then(xml => console.log(xml));
```

---

### Example 6: Fetch Actual Page Timestamps

```javascript
const SitemapAnalyzer = require('./utils/sitemapAnalyzer');
const fs = require('fs');

async function updateTimestamps() {
  const analyzer = new SitemapAnalyzer();
  
  // Read sitemap
  const sitemapXml = fs.readFileSync('public/sitemap.xml', 'utf-8');
  const urls = await analyzer.parseSitemapFromString(sitemapXml);
  
  // Update lastmod for each URL
  console.log('Fetching page timestamps...');
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    if (!url.lastmod) {
      const lastmod = await analyzer.extractLastmod(url.loc);
      if (lastmod) {
        url.lastmod = lastmod;
        console.log(`✓ ${url.loc}: ${lastmod}`);
      }
    }
  }
  
  // Generate with actual timestamps
  const analysis = await analyzer.analyzeSitemap(urls, {
    baseUrl: 'https://example.com'
  });
  
  const optimizedXml = analyzer.generateOptimizedXml(analysis.optimizedUrls);
  fs.writeFileSync('public/sitemap-optimized.xml', optimizedXml);
  
  console.log('✅ Sitemap updated with real timestamps!');
}

updateTimestamps().catch(console.error);
```

---

## 🌐 Web UI Integration

### Add Analyzer to Your Frontend (React/Next.js)

```jsx
import { useState } from 'react';

export default function SitemapAnalyzerUI() {
  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);

  const analyzeSitemap = async (sitemapUrl) => {
    setLoading(true);
    
    // Start analysis
    const startResponse = await fetch('/api/analyze/sitemap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sitemapUrl,
        excludeLowValue: true,
        generateOptimizedXml: true
      })
    });
    
    const { jobId: newJobId } = await startResponse.json();
    setJobId(newJobId);
    
    // Poll for results
    let completed = false;
    while (!completed) {
      const statusResponse = await fetch(`/api/analyze/sitemap/status/${newJobId}`);
      const data = await statusResponse.json();
      
      setStatus(data);
      
      if (data.status === 'completed') {
        setAnalysis(data.analysis);
        completed = true;
      } else if (data.status === 'error') {
        console.error('Analysis failed:', data.error);
        completed = true;
      } else {
        // Wait 1 second before next poll
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    setLoading(false);
  };

  return (
    <div>
      <h1>Sitemap Analyzer</h1>
      
      <form onSubmit={(e) => {
        e.preventDefault();
        const sitemapUrl = e.target.sitemapUrl.value;
        analyzeSitemap(sitemapUrl);
      }}>
        <input
          name="sitemapUrl"
          placeholder="https://example.com/sitemap.xml"
          required
        />
        <button type="submit" disabled={loading}>
          Analyze
        </button>
      </form>

      {loading && <p>Analyzing... {status?.progress || 0}%</p>}

      {analysis && (
        <div>
          <h2>Analysis Results</h2>
          <p>Base URL: {analysis.baseUrl}</p>
          <p>Total URLs: {analysis.statistics.totalUrls}</p>
          <p>Optimized URLs: {analysis.statistics.optimizedUrls}</p>
          
          <h3>Recommendations</h3>
          <ul>
            {analysis.recommendations.map((rec) => (
              <li key={rec.title}>
                <strong>{rec.title}</strong>
                <p>{rec.description}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

---

## ⚙️ Configuration Options

### Analyzer Options

```javascript
const options = {
  // Base URL for relative URL detection (auto-detected if not provided)
  baseUrl: 'https://example.com',
  
  // Exclude low-value URLs (pagination, tags, etc.)
  excludeLowValue: true,  // Default: true
  
  // Fetch actual page timestamps
  fetchLastmod: false,  // Default: false (slow for large sitemaps)
  
  // Generate optimized XML output
  generateOptimizedXml: true,  // Default: true
  
  // Include AI/LLM metadata in XML
  includeMetadata: true,  // Default: true
  
  // Maximum URLs to fetch timestamps for
  maxFetchLastmod: 100  // Default: 100
};

const analysis = await analyzer.analyzeSitemap(urls, options);
```

---

## 📈 Interpretation Guide

### Read the Statistics

```javascript
// By Type
"byType": {
  "homepage": 1,        // 1 homepage
  "blog_post": 150,     // 150 individual articles
  "category": 25        // 25 category pages
}

// By Priority
"byPriority": {
  "1.0": 1,   // 1 critical page
  "0.9": 10,  // 10 high-priority pages
  "0.8": 150, // 150 important pages
  "0.5": 50   // 50 low-priority pages
}

// By Change Frequency
"byChangefreq": {
  "weekly": 160,   // Pages that update weekly
  "monthly": 40,   // Pages that update monthly
  "yearly": 10     // Rarely-updated pages
}
```

### Understanding Recommendations

Each recommendation includes:

- **Priority:** High (critical), Medium (important), Low (nice-to-have)
- **Title:** Brief summary
- **Description:** What the issue is
- **Action:** What to do about it
- **Impact:** Expected improvement

---

## 🔧 Advanced Usage

### Custom Classification Rules

```javascript
class CustomAnalyzer extends SitemapAnalyzer {
  classifyUrl(url, baseUrl) {
    // Call parent
    let classification = super.classifyUrl(url, baseUrl);
    
    // Add custom rules
    if (url.includes('/news/')) {
      return {
        type: 'news',
        priority: 0.95,
        changefreq: 'daily',
        importance: 'critical'
      };
    }
    
    return classification;
  }
}
```

---

### Batch Processing Multiple Sitemaps

```javascript
const analyzers = require('./utils/sitemapAnalyzer');

async function analyzeMultipleSites(sites) {
  const analyzer = new SitemapAnalyzer();
  
  const results = {};
  
  for (const site of sites) {
    const response = await axios.get(site.sitemapUrl);
    const urls = await analyzer.parseSitemapFromString(response.data);
    const analysis = await analyzer.analyzeSitemap(urls, {
      baseUrl: site.baseUrl
    });
    
    results[site.name] = analysis;
  }
  
  return results;
}
```

---

## 🐛 Troubleshooting

### Issue: No lastmod dates in the sitemap

**Solution:** Use the `fetchLastmod` option to extract from page metadata:

```javascript
const analysis = await analyzer.analyzeSitemap(urls, {
  fetchLastmod: true
});
```

---

### Issue: Incorrect URL classification

**Solution:** Review and customize the classification rules in `sitemapAnalyzer.js` or create a custom subclass.

---

### Issue: Analysis is slow for large sitemaps

**Solution:** Disable `fetchLastmod` and limit URL count:

```javascript
const analysis = await analyzer.analyzeSitemap(urls.slice(0, 1000), {
  fetchLastmod: false
});
```

---

## ✅ Best Practices

1. **Run weekly:** Keep your sitemap analysis up-to-date
2. **Review recommendations:** Address high-priority issues first
3. **Monitor changes:** Track how priorities evolve
4. **Submit to GSC:** Update Google Search Console with optimized sitemaps
5. **Exclude low-value URLs:** Use robots.txt to block pagination/tags
6. **Keep timestamps accurate:** Update lastmod values regularly
7. **Test with crawlers:** Use tools like Screaming Frog to validate

---

## 📝 Summary

The **Sitemap Analyzer & Optimizer** provides:

✅ Intelligent URL classification (7 types)  
✅ Automatic priority assignment  
✅ Low-value URL detection  
✅ Duplicate identification  
✅ Comprehensive recommendations  
✅ AI/LLM-friendly metadata  
✅ Multiple output formats  
✅ REST API integration  

**Ready to optimize your sitemap? Start with:** `node test-sitemap-analyzer.js`

---

**For API details:** [Endpoint Reference](#-api-endpoints)  
**For code examples:** [JavaScript Examples](#-javascript-usage-examples)  
**For configuration:** [Configuration Options](#️-configuration-options)
