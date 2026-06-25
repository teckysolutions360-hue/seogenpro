const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const apiRoutes = require('./src/routes/api');
const sitemapRoute = require('./src/routes/sitemapRoute');
const sitemapSystem = require('./src/services/sitemap/sitemap-system');
const sitemapAdminRoutes = require('./src/services/sitemap/sitemap-admin-routes');
const saasSitemapRoutes = require('./src/services/saas-sitemap/saas-sitemap-routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Basic request logging to help diagnose routing in serverless environments
app.use((req, res, next) => {
  console.log(`[Req] ${req.method} ${req.originalUrl}`);
  next();
});

// CORS Configuration - Must be BEFORE helmet for proper cross-origin handling
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // In development, allow all localhost origins
    if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
      if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        return callback(null, true);
      }
    }
    
    // In production, check against whitelist
    const whitelist = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:3001,http://localhost:3002').split(',');
    if (whitelist.includes(origin)) {
      return callback(null, true);
    }
    
    callback(null, true); // Allow for now to prevent blocking
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));

// Security middleware - configured to not block CORS
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow cross-origin requests
  crossOriginOpenerPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX) || 1000, // Use env var, default to 1000
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for status check endpoints
    return req.path.includes('/sitemap/status') || req.path.includes('/api/enhance');
  }
});
app.use('/api/', limiter);

// Response timeout middleware - ensure responses are sent within a reasonable time
app.use('/api/', (req, res, next) => {
  const timeoutMs = parseInt(process.env.API_RESPONSE_TIMEOUT_MS, 10) || 120000; // 2 minutes default
  const timer = setTimeout(() => {
    if (!res.headersSent) {
      console.error(`[Timeout] API request exceeded ${timeoutMs}ms: ${req.method} ${req.originalUrl}`);
      res.status(504).json({
        success: false,
        error: 'Request timeout - backend took too long to respond'
      });
    }
  }, timeoutMs);

  // Clear timeout when response is sent
  const origSend = res.send;
  res.send = function(data) {
    clearTimeout(timer);
    return origSend.call(this, data);
  };

  const origJson = res.json;
  res.json = function(data) {
    clearTimeout(timer);
    return origJson.call(this, data);
  };

  next();
});

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes
app.use('/api', apiRoutes);

// Sitemap Admin Routes - at /api/sitemap/admin/*
app.use('/api/sitemap/admin', sitemapAdminRoutes);

// SaaS sitemap queue routes - at /api/saas/*
app.use('/api/saas', saasSitemapRoutes);

// Dynamic Sitemap Route - at /sitemap.xml
app.use('/', sitemapRoute);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Server is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Initialize sitemap system. Start server only when run directly (not when imported).
async function start() {
  try {
    await Promise.all([
      sitemapSystem.init(),
      saasSitemapRoutes.init && saasSitemapRoutes.init()
    ]);
    if (require.main === module) {
      app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
      });
    } else {
      console.log('Server initialized (app exported for serverless/runtime integration)');
    }
  } catch (err) {
    console.error('Failed to initialize sitemap system:', err);
    if (require.main === module) process.exit(1);
    throw err;
  }
}

if (require.main === module) {
  start();
} else {
  console.log('App loaded as module; initialization skipped.');
}

// Export app for serverless adapters or external runners (Vercel, serverless-http, etc.)
module.exports = app;