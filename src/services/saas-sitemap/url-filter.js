/*
 * url-filter.js
 * ----------------
 * This module encapsulates decision logic for whether a given URL should be
 * included in the crawl/sitemap.  All of the "poor filtering" rules from the
 * legacy generator live here, plus a handful of convenient options that can
 * be toggled by the caller.
 *
 * Patterns automatically excluded:
 *   - login, signup, register, cart, checkout, admin, dashboard, account,
 *     wp-admin
 *   - any URL containing a query string (optional pagination/search toggles)
 *   - common session ID parameters
 *
 * Additional features:
 *   * toggle pagination/search exclusion
 *   * custom include/exclude regexes
 *   * prevents URLs that do not begin with the crawl base
 */

const defaultBlacklists = [
  /\/(login|signup|register|cart|checkout|admin|dashboard|account|wp-admin|forgot-password)(\b|\/)*/i,
  /(sessionid|sessid|sid|phpsessid|utm_|fbclid|gclid)/i  // session and tracking params only
];

/**
 * Normalize origin by stripping www. for comparison
 */
function normalizeOrigin(origin) {
  try {
    const url = new URL(origin);
    url.hostname = url.hostname.replace(/^www\./, '');
    return url.origin;
  } catch {
    return origin;
  }
}

/**
 * Determine whether the provided URL is allowed for crawling.
 *
 * @param {string} rawUrl - URL to test (may be relative).  Should be absolute
 *                          or convertible via new URL(rawUrl, base).
 * @param {object} options - override behaviours
 * @param {boolean} options.includePagination - if true, permit page=& queries
 * @param {boolean} options.includeSearch     - if true, permit search/q params
 * @param {RegExp} options.excludeRegex       - additional exclusion pattern
 * @param {RegExp} options.includeRegex       - if provided, URL must match
 * @param {string} options.baseOrigin         - optional base origin to ensure
 *                                              internal-only crawling
 * @returns {boolean}
 */
function isAllowed(rawUrl, options = {}) {
  try {
    const url = new URL(rawUrl);
    const path = url.pathname + url.search;

    if (options.baseOrigin && normalizeOrigin(url.origin) !== normalizeOrigin(options.baseOrigin)) {
      return false;
    }

    // pagination & search: now include by default for discovery
    // (can be disabled via options if needed)
    if (options.excludePagination && /[?&]page=\d+/i.test(url.search)) {
      return false;
    }
    if (options.excludeSearch && /[?&](search|q)=/i.test(url.search)) {
      return false;
    }

    // apply blacklist patterns
    for (const re of defaultBlacklists) {
      if (re.test(path)) {
        return false;
      }
    }

    if (options.excludeRegex && options.excludeRegex.test(rawUrl)) {
      return false;
    }

    if (options.includeRegex && !options.includeRegex.test(rawUrl)) {
      return false;
    }

    return true;
  } catch (err) {
    // malformed URL
    return false;
  }
}

/**
 * Simple boolean check that applies the common rules requested by the
 * specification (no query strings, blacklist of private paths).
 */
function isValidUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    // quick checks: exclude any query string
    if (u.search && u.search.length > 0) return false;
    // exclude private/auth paths
    if (/login|signup|register|forgot-password|admin|dashboard|account|cart|checkout/i.test(u.pathname)) return false;
    return true;
  } catch {
    return false;
  }
}

module.exports = { isAllowed, isValidUrl };
