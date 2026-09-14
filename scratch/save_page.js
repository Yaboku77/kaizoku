const axios = require('axios');
const fs = require('fs');

async function test() {
  try {
    const r1 = await axios.get('https://anikoto.net/watch/dr-stone-uenxt', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      }
    });
    
    fs.writeFileSync('scratch/anikoto_page.html', r1.data);
    console.log('Saved page, length:', r1.data.length);
    
    // Search for any numeric IDs in key places
    const dataIds = [...r1.data.matchAll(/data-id="(\d+)"/g)].map(m=>m[1]);
    const idsUniq = [...new Set(dataIds)];
    console.log('All data-ids on page:', idsUniq);
    
    // Check what AJAX calls might be made
    const ajaxUrls = [...r1.data.matchAll(/ajax[^"']*/g)].map(m=>m[0]).filter(u=>!u.includes('google'));
    const uniqueAjax = [...new Set(ajaxUrls)];
    console.log('\nAJAX URLs found:', uniqueAjax.slice(0, 10));

  } catch (err) {
    console.error('Error:', err.message);
  }
}
test();
