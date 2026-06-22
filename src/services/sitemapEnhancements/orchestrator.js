/**
 * Sitemap Enhancements Orchestrator
 * 
 * Combines all 8 enhancement modules:
 * 1. XML validation & cleaning
 * 2. Real lastmod resolution
 * 3. Intelligent priority assignment
 * 4. Canonical validation
 * 5. Image extraction
 * 6. Sitemap index generation
 * 7. Coverage analysis
 * 8. Quality scoring
 */

const XmlStructureValidator = require('./xmlStructureValidator');
const LastModResolver = require('./lastModResolver');
const PriorityCalculator = require('./priorityCalculator');
const CanonicalValidator = require('./canonicalValidator');
const ImageExtractor = require('./imageExtractor');
const SitemapIndexGenerator = require('./sitemapIndexGenerator');
const CoverageValidator = require('./coverageValidator');
const SeoQualityScorer = require('./seoQualityScorer');

class SitemapEnhancementsOrchestrator {
  constructor() {
    this.validators = {
      xml: XmlStructureValidator,
      lastmod: LastModResolver,
      priority: PriorityCalculator,
      canonical: CanonicalValidator,
      images: ImageExtractor,
      index: SitemapIndexGenerator,
      coverage: CoverageValidator,
      quality: SeoQualityScorer
    };
  }

  /**
   * Generate fully enhanced sitemap
   */
  async generateEnhancedSitemap(urls, options = {}) {
    const {
      baseUrl = '',
      validateLastmod = true,
      useIntelligentPriority = true,
      validateCanonical = false,
      extractImages = false,
      generateIndex = true,
      validateCoverage = false,
      calculateQuality = true,
      crawledUrls = null
    } = options;

    const pipeline = {
      input: { urls, count: urls.length },
      steps: [],
      output: null,
      errors: [],
      duration: 0
    };

    const startTime = Date.now();

    try {
      // Step 1: Deduplicate & validate URLs
      pipeline.steps.push({
        name: 'Deduplication',
        status: 'processing'
      });
      const cleaned = this.validators.xml.removeDuplicates(urls);
      pipeline.steps[0].status = 'completed';
      pipeline.steps[0].result = { before: urls.length, after: cleaned.length };

      // Step 2: Resolve real lastmod dates
      if (validateLastmod) {
        pipeline.steps.push({
          name: 'Resolve Lastmod Dates',
          status: 'processing'
        });
        const lastmodResolved = await this.validators.lastmod.resolveBatch(
          cleaned,
          { concurrent: 5, cache: true }
        );
        pipeline.steps[1].status = 'completed';
        pipeline.steps[1].result = { resolvedCount: lastmodResolved.length };

        // Merge lastmod into URLs
        cleaned.forEach((url, i) => {
          if (lastmodResolved[i]) {
            url.lastmod = lastmodResolved[i].date;
            url.lastmodSource = lastmodResolved[i].source;
          }
        });
      }

      // Step 3: Calculate intelligent priorities
      if (useIntelligentPriority) {
        pipeline.steps.push({
          name: 'Calculate Priorities',
          status: 'processing'
        });
        const prioritiesCalculated = this.validators.priority.calculateBatch(
          cleaned,
          { baseUrl }
        );
        pipeline.steps[pipeline.steps.length - 1].status = 'completed';
        pipeline.steps[pipeline.steps.length - 1].result = {
          prioritiesAssigned: prioritiesCalculated.length
        };

        // Merge priorities
        cleaned.forEach((url, i) => {
          if (prioritiesCalculated[i]) {
            url.priority = prioritiesCalculated[i].priority;
            url.classification = prioritiesCalculated[i].classification;
          }
        });
      }

      // Step 4: Validate canonical tags
      if (validateCanonical) {
        pipeline.steps.push({
          name: 'Validate Canonical Tags',
          status: 'processing'
        });
        const canonicalValidated = await this.validators.canonical.validateBatch(
          cleaned,
          { concurrent: 3, cache: true }
        );
        pipeline.steps[pipeline.steps.length - 1].status = 'completed';
        pipeline.steps[pipeline.steps.length - 1].result = {
          mismatches: canonicalValidated.filter(c => !c.valid).length
        };

        // Mark to exclude if canonical mismatch
        cleaned.forEach((url, i) => {
          if (canonicalValidated[i]) {
            url.canonicalValid = canonicalValidated[i].valid;
            url.canonical = canonicalValidated[i].canonical;
          }
        });

        // Filter out mismatches if requested (apply to cleaned list)
        cleaned = cleaned.filter(u => u.canonicalValid !== false);
      }

      // Step 5: Extract images
      if (extractImages) {
        pipeline.steps.push({
          name: 'Extract Images',
          status: 'processing'
        });
        const imagesExtracted = await this.validators.images.extractBatch(
          cleaned,
          { concurrent: 5, maxImages: 5, cache: true }
        );
        pipeline.steps[pipeline.steps.length - 1].status = 'completed';
        pipeline.steps[pipeline.steps.length - 1].result = {
          urlsWithImages: imagesExtracted.filter(i => i.images?.length > 0).length
        };

        // Merge images
        cleaned.forEach((url, i) => {
          if (imagesExtracted[i] && imagesExtracted[i].images) {
            url.images = imagesExtracted[i].images;
          }
        });
      }

      // Step 6: Generate sitemap index if needed
      if (generateIndex && cleaned.length > 50000) {
        pipeline.steps.push({
          name: 'Generate Sitemap Index',
          status: 'processing'
        });
        const indexGenerated = this.validators.index.generate(cleaned, { baseUrl });
        pipeline.steps[pipeline.steps.length - 1].status = 'completed';
        pipeline.steps[pipeline.steps.length - 1].result = {
          needsIndex: indexGenerated.needsIndex,
          chunks: indexGenerated.sitemaps?.length || 1
        };
      }

      // Step 7: Validate coverage
      if (validateCoverage && crawledUrls) {
        pipeline.steps.push({
          name: 'Validate Coverage',
          status: 'processing'
        });
        const coverageValidated = this.validators.coverage.validate(
          cleaned.map(u => u.loc),
          crawledUrls
        );
        pipeline.steps[pipeline.steps.length - 1].status = 'completed';
        pipeline.steps[pipeline.steps.length - 1].result = {
          coverage: coverageValidated.coveragePercentage,
          missing: coverageValidated.missing.length,
          orphan: coverageValidated.orphan.length
        };
      }

      // Step 8: Calculate quality score
      if (calculateQuality) {
        pipeline.steps.push({
          name: 'Calculate Quality Score',
          status: 'processing'
        });
        const qualityScored = this.validators.quality.calculateScore(
          { urls: cleaned }
        );
        pipeline.steps[pipeline.steps.length - 1].status = 'completed';
        pipeline.steps[pipeline.steps.length - 1].result = {
          score: qualityScored.score,
          grade: qualityScored.grade
        };
      }

      // Build final XML
      pipeline.steps.push({
        name: 'Generate XML',
        status: 'processing'
      });
      const finalXml = this.validators.xml.generateCleanXml(cleaned, {
        includeImages: extractImages,
        includeNews: false
      });
      pipeline.steps[pipeline.steps.length - 1].status = 'completed';

      pipeline.output = {
        xml: finalXml,
        urlCount: cleaned.length,
        quality: calculateQuality ? 
          this.validators.quality.calculateScore({ urls: cleaned }) : null,
        coverage: validateCoverage ? 
          this.validators.coverage.validate(cleaned.map(u => u.loc), crawledUrls || []) : null
      };

      pipeline.duration = Date.now() - startTime;
      pipeline.status = 'success';

      return pipeline;
    } catch (error) {
      pipeline.status = 'error';
      pipeline.errors.push(error.message);
      pipeline.duration = Date.now() - startTime;
      throw error;
    }
  }

  /**
   * Get enhancement statistics
   */
  getStatistics(result) {
    return {
      totalUrls: result.output.urlCount,
      timestamp: new Date().toISOString(),
      steps: result.steps.map(s => ({
        name: s.name,
        status: s.status,
        result: s.result || {}
      })),
      quality: result.output.quality ? {
        score: result.output.quality.score,
        grade: result.output.quality.grade,
        deductions: result.output.quality.totalDeductions
      } : null,
      coverage: result.output.coverage ? {
        percentage: result.output.coverage.coveragePercentage,
        properly_indexed: result.output.coverage.covered
      } : null,
      processingTimeMs: result.duration
    };
  }

  /**
   * Batch process multiple URL sets
   */
  async batchEnhance(urlSets, options = {}) {
    const results = [];

    for (const set of urlSets) {
      try {
        const result = await this.generateEnhancedSitemap(set.urls, {
          ...options,
          baseUrl: set.baseUrl
        });
        results.push({
          name: set.name,
          status: 'success',
          result
        });
      } catch (error) {
        results.push({
          name: set.name,
          status: 'error',
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Get recommendations
   */
  getRecommendations(result) {
    const recommendations = [];

    // Quality recommendations
    if (result.output.quality) {
      if (result.output.quality.score < 70) {
        recommendations.push({
          type: 'quality',
          severity: 'high',
          message: 'Sitemap quality score is below 70 - review errors'
        });
      }
    }

    // Coverage recommendations
    if (result.output.coverage) {
      if (result.output.coverage.coveragePercentage < 90) {
        recommendations.push({
          type: 'coverage',
          severity: 'high',
          message: `Coverage is ${result.output.coverage.coveragePercentage}% - add missing URLs`
        });
      }
    }

    return recommendations;
  }
}

module.exports = new SitemapEnhancementsOrchestrator();
