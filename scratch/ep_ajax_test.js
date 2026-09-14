const axios = require('axios');

async function test() {
  try {
    const animeId = '1432'; // Dr. Stone on anikoto
    
    // Step 1: Get episode list via AJAX
    const epList = await axios.get(`https://anikoto.net/ajax/episode/list/${animeId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': 'https://anikoto.net/watch/dr-stone-uenxt',
      }
    });
    
    const html = epList.data.result;
    console.log('Episode list HTML snippet (first 500 chars):', html.substring(0, 500));
    
    // Find data-ids on episode 1
    const ep1Match = html.match(/data-num="1"[^>]*(?:data-ids="([^"]+)")?[^>]*(?:data-mal="([^"]+)")?/);
    const ep1Alt = html.match(/data-ids="([^"]+)"[^>]*data-num="1"/);
    console.log('\nEp1 data-ids match:', ep1Match);
    console.log('Ep1 alt data-ids:', ep1Alt);
    
    // Find ALL data-ids
    const allDataIds = [...html.matchAll(/data-ids="([^"]+)"/g)].map(m => m[1]).slice(0, 3);
    console.log('\nFirst 3 data-ids values:', allDataIds);
    
    if (allDataIds.length > 0) {
      // Step 2: Try server list with the data-ids
      const serverListResp = await axios.get(`https://anikoto.net/ajax/server/list?servers=${allDataIds[0]}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': 'https://anikoto.net/watch/dr-stone-uenxt/ep-1',
        }
      });
      console.log('\nServer list response:', serverListResp.data);
    }
  } catch (err) {
    console.error('Error:', err.message);
    if (err.response) console.error('Response status:', err.response.status, err.response.data?.substring?.(0, 200));
  }
}
test();
