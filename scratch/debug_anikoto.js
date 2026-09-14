const axios = require('axios');

async function test() {
  try {
    // The data-ids comes from episode list page - get the main watch page
    const r1 = await axios.get('https://anikoto.net/watch/dr-stone-uenxt', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer': 'https://anikoto.net/'
      }
    });

    // Find the episodesDataId (data-id on the film_list or ep-item)
    const dataIdsMatch = r1.data.match(/data-ids="([^"]+)"/);
    const epsMatch = [...r1.data.matchAll(/data-ep-id="([^"]+)"/g)].map(m=>m[1]);
    const epLinks = [...r1.data.matchAll(/href="\/watch\/[^"]+\/ep-(\d+)"[^>]*data-id="([^"]+)"/g)].map(m => ({ep: m[1], id: m[2]}));
    
    console.log('data-ids:', dataIdsMatch ? dataIdsMatch[1] : 'not found');
    console.log('data-ep-ids:', epsMatch.slice(0, 5));
    console.log('ep links:', epLinks.slice(0, 5));

    // Look for episode list AJAX pattern
    const ajaxMatch = r1.data.match(/ajax\/ep\/list[^"']*/);
    const animeId = r1.data.match(/anime_id\s*[:=]\s*["']?(\d+)/);
    console.log('\najax pattern:', ajaxMatch ? ajaxMatch[0] : 'not found');
    console.log('anime_id:', animeId ? animeId[1] : 'not found');
    
    // Find data-id in episode <li> elements
    const liDataIds = [...r1.data.matchAll(/<li[^>]+data-id="(\d+)"[^>]*ep-item/g)].map(m=>m[1]);
    const epItems = [...r1.data.matchAll(/ep-item[^>]+data-id="(\d+)"/g)].map(m=>m[1]);
    console.log('\nli data-ids:', liDataIds.slice(0, 5));
    console.log('ep-item data-ids:', epItems.slice(0, 5));
    
    // Try the correct AJAX format
    // Anikoto's episode list usually is /ajax/episode/list/{anime_id}
    const animeIdMatch = r1.data.match(/data-id="(\d+)"[^>]*class="[^"]*seasons[^"]*"/);
    const filmData = r1.data.match(/"film_id":\s*(\d+)/);
    console.log('\nseasons data-id:', animeIdMatch ? animeIdMatch[1] : 'not found');
    console.log('film_id:', filmData ? filmData[1] : 'not found');
    
    // Try extracting from script tags
    const scriptMatch = r1.data.match(/var\s+animeId\s*=\s*(\d+)/);
    const idMatch2 = r1.data.match(/anime_id\s*=\s*(\d+)/);
    console.log('var animeId:', scriptMatch ? scriptMatch[1] : 'not found');
    console.log('anime_id=:', idMatch2 ? idMatch2[1] : 'not found');

  } catch (err) {
    console.error('Error:', err.message);
  }
}

test();
