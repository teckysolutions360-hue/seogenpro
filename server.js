const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const apiRoutes = require('./src/routes/api');
const sitemapRoute = require('./src/routes/sitemapRoute');
const sitemapSystem = require('./src/services/sitemap/sitemap-system');
const sitemapAdminRoutes = require('./src/services/sitemap/sitemap-admin-routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Basic request logging to help diagnose routing in serverless environments
app.use((req, res, next) => {
  console.log(`[Req] ${req.method} ${req.originalUrl}`);
  next();
});

// Security middleware
app.use(helmet());

// CORS Configuration - Allow any localhost port for development
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

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes
app.use('/api', apiRoutes);

// Sitemap Admin Routes - at /api/sitemap/admin/*
app.use('/api/sitemap/admin', sitemapAdminRoutes);

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
    await sitemapSystem.init();
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

start();

// Export app for serverless adapters or external runners (Vercel, serverless-http, etc.)
module.exports = app;