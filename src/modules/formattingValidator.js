const axios = require('axios');
const cheerio = require('cheerio');

class FormattingValidator {
  /**
   * Validate generated output structure and site pages for formatting.
   * pages: [{url, title, description}]
   * options: { concurrency=5, maxSamples=50, sampleRate=0.1, runInBackground=false }
   */
  validate(generatedOutput, pages = [], options = {}) {
    const opts = Object.assign({ concurrency: 5, maxSamples: 50, sampleRate: 0.1, runInBackground: false }, options || {});

    const run = async () => {
      const result = {
        missingSections: [],
        headingHierarchyOk: true,
        metaDescriptionCoverage: 0,
        canonicalCoverage: 0,
        duplicateTitleCount: 0,
        brokenLinksCount: 0,
        formattingScore: 0
      };

      // Required sections
      const required = ['AI Usage Guidelines', 'Site Overview', 'Primary Content'];
      required.forEach(s => { if (!generatedOutput || !generatedOutput.includes(s)) result.missingSections.push(s); });

      // Basic heading check: ensure at least one H1
      if (!generatedOutput || !/\n#\s+\w+/m.test(generatedOutput)) result.headingHierarchyOk = false;

      // Determine sample set
      const total = pages.length;
      let sampleSize = Math.min(opts.maxSamples, Math.ceil(total * opts.sampleRate));
      if (sampleSize === 0 && total > 0) sampleSize = Math.min(opts.maxSamples, Math.min(10, total));
      const sample = [];
      if (sampleSize >= total) sample.push(...pages);
      else {
        // evenly sample to cover site breadth
        const step = Math.max(1, Math.floor(total / sampleSize));
        for (let i = 0; i < total && sample.length < sampleSize; i += step) sample.push(pages[i]);
      }

      // concurrency-limited workers
      const concurrency = Math.max(1, opts.concurrency);
      let idx = 0;
      const metaCountObj = { count: 0 };
      const canonicalCountObj = { count: 0 };
      const titleMap = {};
      let brokenLinksCount = 0;

      const worker = async () => {
        while (true) {
          const i = idx++;
          if (i >= sample.length) break;
          const p = sample[i];
          try {
            const r = await axios.get(p.url, { timeout: 8000, maxRedirects: 3, validateStatus: ()=>true });
            if (r.status >= 200 && r.status < 400 && r.data) {
              const $ = cheerio.load(r.data);
              const desc = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '';
              const canonical = $('link[rel="canonical"]').attr('href');
              if (desc && desc.trim().length > 20) metaCountObj.count++;
              if (canonical) canonicalCountObj.count++;
              const title = ($('title').text() || '').trim() || p.title || '';
              const key = title.toLowerCase();
              titleMap[key] = (titleMap[key] || 0) + 1;

              // extract and sample links up to 6 for broken link detection
              const links = [];
              $('a[href]').each((i, el) => { const href = $(el).attr('href'); if (href && !href.startsWith('mailto:') && !href.startsWith('tel:')) links.push(href); });
              const linkSample = links.slice(0,6);
              for (const href of linkSample) {
                try {
                  const linkUrl = new URL(href, p.url).toString();
                  const head = await axios.head(linkUrl, { timeout: 5000, maxRedirects: 3, validateStatus: ()=>true });
                  if (head.status >= 400) brokenLinksCount++;
                } catch (e) { brokenLinksCount++; }
              }
            }
          } catch (e) {
            // treat as missing
          }
        }
      };

      // launch workers
      const workers = [];
      for (let i=0;i<concurrency;i++) workers.push(worker());
      await Promise.all(workers);

      const metaCount = metaCountObj.count;
      const canonicalCount = canonicalCountObj.count;
      const sampleLen = sample.length || 0;
      result.metaDescriptionCoverage = sampleLen === 0 ? 0 : (metaCount / sampleLen);
      result.canonicalCoverage = sampleLen === 0 ? 0 : (canonicalCount / sampleLen);
      result.duplicateTitleCount = Object.values(titleMap).filter(c => c > 1).reduce((s,c)=>s+(c-1),0);
      result.brokenLinksCount = brokenLinksCount;

      // compute formattingScore per rules
      let penalty = 0;
      penalty += Math.min(4, result.missingSections.length * 2);
      if (!result.headingHierarchyOk) penalty += 2;
      if (result.metaDescriptionCoverage < 0.8) penalty += 1;
      if (result.canonicalCoverage < 0.8) penalty += 1;
      penalty += Math.min(2, result.brokenLinksCount * 0.5);
      penalty += Math.min(2, result.duplicateTitleCount * 0.5);

      result.formattingScore = Math.max(0, 10 - penalty);
      return result;
    };

    if (opts.runInBackground) {
      const promise = run();
      return { background: true, promise };
    }

    return run();
  }
}

module.exports = new FormattingValidator();
