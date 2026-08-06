// Run with: node test_aot.mjs
import axios from 'axios';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Referer': 'https://anikoto.net/',
};

async function test() {
  try {
    // 1. Fetch watch page
    const epUrl = 'https://anikoto.net/watch/attack-on-titan/ep-1';
    console.log('\n=== 1. Watch page ===');
    const { data: html } = await axios.get(epUrl, { headers: HEADERS });
    const idMatch = html.match(/data-ids=["']([^"']+)["']/);
    if (!idMatch) { console.log('No data-ids found'); return; }
    const dataIds = idMatch[1];
    console.log('data-ids:', dataIds);

    // 2. Get server list
    console.log('\n=== 2. Server list ===');
    const { data: serverList } = await axios.get(`https://anikoto.net/ajax/server/list?servers=${dataIds}`, {
      headers: { ...HEADERS, Referer: epUrl }
    });
    console.log('Server list HTML:', serverList?.result?.substring(0, 500));

    // 3. Extract link IDs
    const linkIds = [...(serverList?.result?.matchAll(/data-link-id=["']([^"']+)["']/g) || [])].map(m => m[1]);
    console.log('\nAll link IDs found:', linkIds);

    // Try each server
    for (const linkId of linkIds.slice(0, 3)) {
      console.log(`\n=== 3. Getting embed for linkId: ${linkId} ===`);
      const { data: srcData } = await axios.get(`https://anikoto.net/ajax/server?get=${linkId}`, {
        headers: { ...HEADERS, Referer: epUrl, 'X-Requested-With': 'XMLHttpRequest' }
      });
      const embedUrl = srcData?.result?.url;
      console.log('Embed URL:', embedUrl);
      if (!embedUrl) continue;

      // 4. Get embed page
      const embedHost = new URL(embedUrl).host;
      const embedReferer = `https://${embedHost}/`;
      const { data: embedHtml } = await axios.get(embedUrl, {
        headers: { ...HEADERS, Referer: embedReferer }
      }).catch(e => ({ data: '' }));

      const megaId = embedHtml.match(/<title>File ([0-9]+)/)?.[1];
      if (megaId) {
        console.log(`\n=== 4. Megaplay getSources for id=${megaId} ===`);
        const { data: sources } = await axios.get(`https://${embedHost}/stream/getSources?id=${megaId}`, {
          headers: { ...HEADERS, Referer: embedUrl, 'X-Requested-With': 'XMLHttpRequest' }
        });
        console.log('RAW sources response:');
        console.log(JSON.stringify(sources, null, 2));

        // Check the m3u8 to see how many quality levels
        const m3u8Url = sources?.sources?.file || sources?.sources?.[0]?.file;
        if (m3u8Url) {
          console.log('\n=== 5. m3u8 playlist content ===');
          const { data: m3u8 } = await axios.get(m3u8Url, {
            headers: { ...HEADERS, Referer: embedReferer }
          }).catch(e => ({ data: 'ERROR: ' + e.message }));
          console.log(m3u8);
        }
        break;
      }
    }
  } catch (e) {
    console.error('Error:', e.message);
  }
}

test();
