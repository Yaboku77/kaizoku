const axios = require('axios');
const fs = require('fs');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Referer': 'https://anikoto.net/',
};

async function test() {
  let log = '';
  const appendLog = (msg) => { log += msg + '\n'; };

  try {
    const epUrl = 'https://anikoto.net/watch/attack-on-titan-bgaoa/ep-1';
    appendLog('\n=== 1. Watch page ===');
    const { data: html } = await axios.get(epUrl, { headers: HEADERS });
    const idMatch = html.match(/data-ids=["']([^"']+)["']/);
    if (!idMatch) { appendLog('No data-ids found'); return fs.writeFileSync('aot_log.txt', log); }
    const dataIds = idMatch[1];
    appendLog('data-ids: ' + dataIds);

    appendLog('\n=== 2. Server list ===');
    const { data: serverList } = await axios.get(`https://anikoto.net/ajax/server/list?servers=${dataIds}`, {
      headers: { ...HEADERS, Referer: epUrl }
    });
    
    const linkIds = [...(serverList?.result?.matchAll(/data-link-id=["']([^"']+)["']/g) || [])].map(m => m[1]);
    appendLog('\nAll link IDs found: ' + JSON.stringify(linkIds));

    for (const linkId of linkIds) {
      appendLog(`\n=== 3. Getting embed for linkId: ${linkId} ===`);
      const { data: srcData } = await axios.get(`https://anikoto.net/ajax/server?get=${linkId}`, {
        headers: { ...HEADERS, Referer: epUrl, 'X-Requested-With': 'XMLHttpRequest' }
      });
      const embedUrl = srcData?.result?.url;
      appendLog('Embed URL: ' + embedUrl);
      if (!embedUrl) continue;

      const embedHost = new URL(embedUrl).host;
      const embedReferer = `https://${embedHost}/`;
      const { data: embedHtml } = await axios.get(embedUrl, {
        headers: { ...HEADERS, Referer: embedReferer }
      }).catch(e => ({ data: '' }));

      const megaId = embedHtml.match(/<title>File ([0-9]+)/)?.[1];
      if (megaId) {
        appendLog(`\n=== 4. Megaplay getSources for id=${megaId} ===`);
        const { data: sources } = await axios.get(`https://${embedHost}/stream/getSources?id=${megaId}`, {
          headers: { ...HEADERS, Referer: embedUrl, 'X-Requested-With': 'XMLHttpRequest' }
        });
        appendLog('RAW sources response:\n' + JSON.stringify(sources, null, 2));

        const m3u8Url = sources?.sources?.file || sources?.sources?.[0]?.file;
        if (m3u8Url) {
          appendLog('\n=== 5. m3u8 playlist content ===');
          const { data: m3u8 } = await axios.get(m3u8Url, {
            headers: { ...HEADERS, Referer: embedReferer }
          }).catch(e => ({ data: 'ERROR: ' + e.message }));
          appendLog(m3u8);
        }
      }
    }
  } catch (e) {
    appendLog('Error: ' + e.message);
  }
  
  fs.writeFileSync('aot_log.txt', log);
}

test();
