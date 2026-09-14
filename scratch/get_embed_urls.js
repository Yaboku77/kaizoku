const axios = require('axios');

async function test() {
  try {
    // Get the episode page
    const r1 = await axios.get('https://anikoto.net/watch/dr-stone-uenxt', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      }
    });
    
    // Find episode with ep-1 data-id
    const episodeListMatch = r1.data.match(/href="\/watch\/dr-stone-uenxt\/ep-1"[^>]*data-id="([^"]+)"/);
    const directDataId = r1.data.match(/data-id="([^"]+)"[^>]*data-default="yes"/);
    
    console.log('Episode match:', episodeListMatch ? episodeListMatch[1] : 'not found');
    console.log('Direct data-id:', directDataId ? directDataId[1] : 'not found');
    
    // Try to get ep-1 page directly
    const r2 = await axios.get('https://anikoto.net/watch/dr-stone-uenxt/ep-1', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Referer': 'https://anikoto.net/',
      }
    });

    // Find all data-ids
    const allDataIds = [...r2.data.matchAll(/data-id="(\d+)"/g)].map(m => m[1]);
    const uniqueIds = [...new Set(allDataIds)];
    console.log('\nData IDs on ep-1 page:', uniqueIds);
    
    // Try each data-id
    for (const id of uniqueIds.slice(0, 3)) {
      try {
        const r3 = await axios.get(`https://anikoto.net/ajax/server/list?servers=${id}`, {
          headers: {
            'Referer': 'https://anikoto.net/watch/dr-stone-uenxt/ep-1',
            'X-Requested-With': 'XMLHttpRequest',
          }
        });
        if (r3.data.result) {
          console.log(`\nServer list for data-id ${id}:`, r3.data.result.substring(0, 500));
          
          // Extract server link IDs
          const linkIds = [...r3.data.result.matchAll(/data-link-id="([^"]+)"/g)].map(m => m[1]);
          console.log('Link IDs:', linkIds);
          
          for (const linkId of linkIds.slice(0, 3)) {
            try {
              const r4 = await axios.get(`https://anikoto.net/ajax/server?get=${linkId}`, {
                headers: {
                  'Referer': 'https://anikoto.net/watch/dr-stone-uenxt/ep-1',
                  'X-Requested-With': 'XMLHttpRequest',
                }
              });
              console.log(`  Link ${linkId} URL:`, r4.data?.result?.url);
            } catch(err) {
              console.log(`  Link ${linkId} error:`, err.message);
            }
          }
        }
      } catch(err) {
        console.log(`Error for id ${id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

test();
