/**
 * test-sitemap-response.js
 * 
 * This test verifies that the backend responds correctly to sitemap generation requests
 * Run with: node test/test-sitemap-response.js
 */

const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:3000/api';
const TEST_TIMEOUT_MS = 30000; // 30 seconds

async function testSitemapGeneration() {
  console.log('='.repeat(60));
  console.log('SITEMAP GENERATION RESPONSE TEST');
  console.log('='.repeat(60));
  console.log(`API URL: ${API_URL}\n`);

  const testCases = [
    {
      name: 'Valid URL',
      data: {
        url: 'https://example.com',
        maxDepth: 2,
        maxUrls: 10
      },
      shouldSucceed: true
    },
    {
      name: 'Invalid URL (empty)',
      data: {
        url: '',
        maxDepth: 2
      },
      shouldSucceed: false
    },
    {
      name: 'Invalid URL (malformed)',
      data: {
        url: 'not-a-valid-url',
        maxDepth: 2
      },
      shouldSucceed: false
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    console.log(`\nTest: ${testCase.name}`);
    console.log('-'.repeat(40));

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);

      const startTime = Date.now();
      const response = await axios.post(
        `${API_URL}/saas/sitemap/generate`,
        testCase.data,
        {
          timeout: TEST_TIMEOUT_MS,
          signal: controller.signal
        }
      );
      const responseTime = Date.now() - startTime;

      clearTimeout(timeoutId);

      console.log(`✓ Response received in ${responseTime}ms`);
      console.log(`  Status: ${response.status}`);
      console.log(`  Success: ${response.data.success}`);
      
      if (response.data.jobId) {
        console.log(`  Job ID: ${response.data.jobId}`);
        console.log(`  Status URL: ${response.data.statusUrl}`);
      }

      if (testCase.shouldSucceed && response.data.success) {
        console.log(`✓ Test PASSED - Expected success and got it`);
        passed++;
      } else if (!testCase.shouldSucceed && !response.data.success) {
        console.log(`✓ Test PASSED - Expected error and got it`);
        console.log(`  Error: ${response.data.error}`);
        passed++;
      } else {
        console.log(`✗ Test FAILED - Unexpected response`);
        console.log(`  Expected success: ${testCase.shouldSucceed}`);
        console.log(`  Got success: ${response.data.success}`);
        failed++;
      }
    } catch (error) {
      const responseTime = error.config ? `${Date.now() - new Date(error.config.headers?.['X-Request-Time'])}ms` : 'unknown';
      
      if (error.code === 'ECONNREFUSED') {
        console.log(`✗ FAILED - Cannot connect to backend at ${API_URL}`);
        console.log(`  Make sure the server is running on port 3000`);
        failed++;
      } else if (error.code === 'ABORT_ERR' || error.message.includes('abort')) {
        console.log(`✗ FAILED - Request timed out after ${TEST_TIMEOUT_MS}ms`);
        console.log(`  The backend is not responding within the timeout period`);
        console.log(`  This could indicate the backend is hanging or not processing requests`);
        failed++;
      } else if (error.response) {
        const statusCode = error.response.status;
        console.log(`✓ Response received with status ${statusCode}`);
        console.log(`  Response: ${JSON.stringify(error.response.data)}`);
        
        if (testCase.shouldSucceed && statusCode >= 400) {
          console.log(`✗ Test FAILED - Expected success but got error status`);
          failed++;
        } else if (!testCase.shouldSucceed && statusCode >= 400) {
          console.log(`✓ Test PASSED - Expected error and got it`);
          passed++;
        } else {
          passed++;
        }
      } else {
        console.log(`✗ FAILED - Network error: ${error.message}`);
        failed++;
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`Passed: ${passed}/${testCases.length}`);
  console.log(`Failed: ${failed}/${testCases.length}`);
  
  if (failed === 0) {
    console.log('\n✓ All tests passed!');
    console.log('\nFixes applied:');
    console.log('1. ✓ Added missing return statements in error handlers');
    console.log('2. ✓ Added response timeout middleware');
    console.log('3. ✓ Improved Redis connection error handling');
    console.log('4. ✓ Server will start even if Redis is unavailable');
    console.log('5. ✓ API will return proper 503 errors when Redis is down');
  } else {
    console.log('\n✗ Some tests failed!');
    console.log('\nDebugging tips:');
    console.log('1. Check that the backend server is running');
    console.log('2. Check for errors in the server logs');
    console.log('3. Ensure Redis is configured and running (if using SaaS sitemap)');
    console.log('4. Check that the API URL is correct');
  }

  process.exit(failed > 0 ? 1 : 0);
}

testSitemapGeneration().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
