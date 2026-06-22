/**
 * URL Validator Module
 * Validates and normalizes URLs for sitemap generation
 */

const URL_REGEX = /^https?:\/\/.+/i;

class URLValidator {
  /**
   * Validate and normalize a URL
   * @param {string} url - The URL to validate
   * @returns {Object} - { isValid: boolean, normalizedUrl: string, error: string }
   */
  static validate(url) {
    if (!url || typeof url !== 'string') {
      return {
        isValid: false,
        error: 'URL is required and must be a string'
      };
    }

    url = url.trim();

    // Check basic format
    if (!URL_REGEX.test(url)) {
      return {
        isValid: false,
        error: 'URL must start with http:// or https://'
      };
    }

    try {
      // Parse and validate
      const urlObj = new URL(url);

      // Reject invalid protocols
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return {
          isValid: false,
          error: 'Only http:// and https:// protocols are supported'
        };
      }

      // Reject localhost for public tool
      if (urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1') {
        return {
          isValid: false,
          error: 'Localhost URLs are not supported in public mode'
        };
      }

      // Normalize: remove trailing slash from base URL
      const normalizedUrl = `${urlObj.protocol}//${urlObj.host}`;

      return {
        isValid: true,
        normalizedUrl,
        baseUrl: normalizedUrl,
        hostname: urlObj.hostname,
        protocol: urlObj.protocol
      };
    } catch (error) {
      return {
        isValid: false,
        error: `Invalid URL: ${error.message}`
      };
    }
  }

  /**
   * Check if URL is absolute or relative
   */
  static isAbsolute(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Convert relative URL to absolute
   */
  static toAbsolute(baseUrl, relativePath) {
    try {
      return new URL(relativePath, baseUrl).href;
    } catch {
      return null;
    }
  }

  /**
   * Get domain from URL
   */
  static getDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return null;
    }
  }

  /**
   * Check if URL belongs to same domain
   */
  static isSameDomain(baseUrl, targetUrl) {
    const baseDomain = this.getDomain(baseUrl);
    const targetDomain = this.getDomain(targetUrl);
    return baseDomain === targetDomain;
  }
}

module.exports = URLValidator;
