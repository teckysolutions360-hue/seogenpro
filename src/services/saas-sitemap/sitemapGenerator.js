/*
 * sitemapGenerator.js
 * -------------------
 * High-level wrapper to produce sitemap XML files from `pages` array.
 * Enforces modern default (no changefreq/priority) unless `advancedMode` is true.
 * Returns an object with `files` (array of XML strings) and optional `index`.
 */

const SitemapBuilder = require('./sitemap-builder');

const fs = require('fs');
const path = require('path');

function generate(pages, options = {}) {
  const builderOptions = {
    maxUrls: options.maxUrls,
    maxBytes: options.maxBytes,
    advancedMode: !!options.advancedMode,
    baseUrl: options.baseUrl
  };
  const { xmlFiles, indexXml } = SitemapBuilder.build(pages, builderOptions);
  const result = { files: xmlFiles, index: indexXml };

  // optionally persist to disk
  if (options.outputDir) {
    try {
      fs.mkdirSync(options.outputDir, { recursive: true });
      result.filePaths = [];
      xmlFiles.forEach((xml, i) => {
        const fname = `sitemap-${i + 1}.xml`;
        const fpath = path.join(options.outputDir, fname);
        fs.writeFileSync(fpath, xml, 'utf8');
        result.filePaths.push(fpath);
      });
      if (indexXml) {
        const idxPath = path.join(options.outputDir, 'sitemap-index.xml');
        fs.writeFileSync(idxPath, indexXml, 'utf8');
        result.indexPath = idxPath;
      }
      result.outputDir = options.outputDir;
    } catch (err) {
      // fail silently; caller should handle if persistence is critical
      console.error('[SitemapGenerator] failed to write files', err.message);
    }
  }

  return result;
}

module.exports = { generate };
