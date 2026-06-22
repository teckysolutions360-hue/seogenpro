/*
 * canonicalHandler.js
 * -------------------
 * Small helper that uses the metadata extractor to read and normalise the
 * canonical URL from HTML.  Ensures canonical is same-origin and returns a
 * normalized URL or null.
 */

const Metadata = require('./metadata');
const { URL } = require('url');

function getCanonicalFor(url, response, html, baseOrigin) {
  const info = Metadata.extract(url, response, html);
  if (!info || !info.canonical) return null;
  try {
    const c = new URL(info.canonical, url);
    if (baseOrigin && c.origin !== baseOrigin) return null;
    // strip fragments/trailing slash normalization similar to crawler
    c.hash = '';
    if (c.pathname !== '/' && c.pathname.endsWith('/')) c.pathname = c.pathname.slice(0, -1);
    return c.href;
  } catch {
    return null;
  }
}

module.exports = { getCanonicalFor };
