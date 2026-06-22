#!/usr/bin/env bash
# setup-sitemap-system.sh
# Quick setup script for Dynamic Sitemap System 2.0

set -e

echo "================================================"
echo "Dynamic Sitemap System 2.0 - Setup Script"
echo "================================================"
echo ""

# Check if we're in the right directory
if [ ! -f "server.js" ]; then
  echo "Error: This script must be run from the server directory"
  echo "Current directory: $(pwd)"
  exit 1
fi

echo "✓ Running from server directory"
echo ""

# Step 1: Install dependencies
echo "Step 1: Installing dependencies..."
npm install node-cron
echo "✓ Dependencies installed"
echo ""

# Step 2: Verify module structure
echo "Step 2: Verifying sitemap system files..."
SITEMAP_DIR="server/src/services/sitemap"
REQUIRED_FILES=(
  "sitemap-config.js"
  "url-fetcher.js"
  "rules-engine.js"
  "cache-manager.js"
  "sitemap-builder.js"
  "scheduler.js"
  "sitemap-system.js"
  "sitemap-admin-routes.js"
)

MISSING_FILES=0
for file in "${REQUIRED_FILES[@]}"; do
  if [ -f "$SITEMAP_DIR/$file" ]; then
    echo "  ✓ $file"
  else
    echo "  ✗ $file (MISSING)"
    ((MISSING_FILES++))
  fi
done

if [ $MISSING_FILES -gt 0 ]; then
  echo ""
  echo "Error: $MISSING_FILES required files are missing"
  exit 1
fi
echo "✓ All required files present"
echo ""

# Step 3: Verify Node.js syntax
echo "Step 3: Verifying Node.js syntax..."
node -c server.js 2>&1 && echo "  ✓ server.js syntax OK" || echo "  ✗ server.js syntax error"
node -c src/services/sitemap/sitemap-config.js 2>&1 && echo "  ✓ sitemap-config.js syntax OK" || echo "  ✗ sitemap-config.js syntax error"
node -c src/services/sitemap/sitemap-system.js 2>&1 && echo "  ✓ sitemap-system.js syntax OK" || echo "  ✗ sitemap-system.js syntax error"
echo ""

# Step 4: Summary
echo "================================================"
echo "✓ Setup Complete!"
echo "================================================"
echo ""
echo "Next steps:"
echo "1. Review configuration: SITEMAP_SYSTEM_INTEGRATION.md"
echo "2. Start server: npm run dev"
echo "3. Test health: curl http://localhost:3000/api/sitemap/admin/status"
echo "4. View sitemap: curl http://localhost:3000/sitemap.xml"
echo ""
echo "For full documentation, see: SITEMAP_SYSTEM_INTEGRATION.md"
echo ""
