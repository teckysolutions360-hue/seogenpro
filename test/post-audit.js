const axios = require('axios');

(async () => {
  try {
    const r = await axios.post('http://localhost:3000/api/analyze/crawl', { url: 'https://example.com' }, { timeout: 60000 });
    console.log('status', r.status);
    console.log('data', JSON.stringify(r.data, null, 2).slice(0, 2000));
  } catch (e) {
    if (e.response) {
      console.error('response status', e.response.status);
      console.error('response data', e.response.data);
    } else {
      console.error('request error', e.message);
    }
    process.exitCode = 2;
  }
})();
