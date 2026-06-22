/**
 * Caching and Rate-Limiting Utilities
 * Handles caching of API responses and rate-limiting for external APIs
 */

const rateLimit = require('express-rate-limit');

// In-memory cache (can be replaced with Redis)
const cache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Get value from cache
 * @param {string} key - Cache key
 * @returns {any} Cached value or null
 */
function getCacheValue(key) {
  const item = cache.get(key);
  if (!item) return null;
  
  if (Date.now() > item.expires) {
    cache.delete(key);
    return null;
  }
  
  return item.value;
}

/**
 * Set value in cache
 * @param {string} key - Cache key
 * @param {any} value - Value to cache
 * @param {number} ttl - Time to live in milliseconds (default: 24h)
 */
function setCacheValue(key, value, ttl = CACHE_TTL) {
  cache.set(key, {
    value,
    expires: Date.now() + ttl
  });
}

/**
 * Clear cache
 * @param {string} key - Optional specific key to clear; if not provided, clears all
 */
function clearCache(key) {
  if (key) {
    cache.delete(key);
  } else {
    cache.clear();
  }
}

/**
 * Cache middleware for Express
 * @param {number} ttl - Time to live in milliseconds
 * @returns {function} Middleware function
 */
function cacheMiddleware(ttl = CACHE_TTL) {
  return (req, res, next) => {
    if (req.method !== 'POST') {
      return next();
    }
    
    // Create cache key from URL and request body
    const cacheKey = `${req.path}:${JSON.stringify(req.body)}`;
    
    // Check if cached
    const cached = getCacheValue(cacheKey);
    if (cached) {
      return res.json({
        ...cached,
        fromCache: true,
        cachedAt: new Date(Date.now() - ttl)
      });
    }
    
    // Store original json method
    const originalJson = res.json.bind(res);
    
    // Override json method to cache response
    res.json = function(data) {
      setCacheValue(cacheKey, data, ttl);
      return originalJson({
        ...data,
        fromCache: false
      });
    };
    
    next();
  };
}

/**
 * Rate limiting for SERP API
 * Ensures we don't exceed API quotas
 */
const serpApiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  message: 'Too many SERP API requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiting for general API endpoints
 * Prevents abuse
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15 minutes per IP
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiting for analysis endpoints
 * More strict since these are heavy operations
 */
const analysisLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 analysis requests per hour
  message: 'Too many analysis requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  getCacheValue,
  setCacheValue,
  clearCache,
  cacheMiddleware,
  serpApiLimiter,
  apiLimiter,
  analysisLimiter
};
