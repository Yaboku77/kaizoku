/**
 * Quick diagnostic: tests the full scraping pipeline
 * Run with: node test-scrape.js
 */
const axios = require('axios');

const BASE_URL = 'https://anikoto.net';
const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  Connection: 'keep-alive',
  'Cache-Control': 'no-cache',
  Referer: 'https://anikoto.net/',
};

async function test() {
  console.log('\n=== STEP 1: Search ===');
  try {
    const { data } = await axios.get(`${BASE_URL}/filter?keyword=Mushoku+Tensei`, {
      headers: DEFAULT_HEADERS,
      timeout: 15000,
    });
    const isCloudflare = data.includes('cf-browser-verification') || data.includes('Checking if the site connection is secure') || data.includes('Just a moment');
    console.log('Response length:', data.length);
    console.log('Is Cloudflare challenge?', isCloudflare);
    console.log('First 300 chars:', data.substring(0, 300));
    
    if (isCloudflare) {
      console.log('\n❌ BLOCKED BY CLOUDFLARE - this is the root cause');
      console.log('The scraping cannot work directly from a Node.js/mobile app');
      console.log('Solution: Deploy the API on Vercel (free) and use it as the backend');
      return;
    }
    console.log('✅ Page fetched successfully');
  } catch (err) {
    console.log('❌ STEP 1 FAILED:', err.message);
    if (err.response) {
      console.log('Status:', err.response.status);
      console.log('Headers:', err.response.headers);
    }
    return;
  }

  console.log('\n=== STEP 2: AJAX Server List ===');
  try {
    // Mushoku Tensei ep 1 — use a known dataIds value  
    // This tests the AJAX endpoint
    const { data } = await axios.get(`${BASE_URL}/ajax/server/list?servers=test`, {
      headers: {
        ...DEFAULT_HEADERS,
        Accept: 'application/json, text/javascript, */*',
        'X-Requested-With': 'XMLHttpRequest',
      },
      timeout: 10000,
    });
    console.log('AJAX response:', JSON.stringify(data).substring(0, 200));
  } catch (err) {
    console.log('❌ STEP 2 FAILED:', err.message);
  }
}

test().catch(console.error);
