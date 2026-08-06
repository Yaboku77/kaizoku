const axios = require('axios');
const cheerio = require('cheerio-without-node-native');

const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate',
  Connection: 'keep-alive',
  'Cache-Control': 'no-cache',
  Referer: 'https://anikoto.net/',
};

async function test() {
  try {
    const searchUrl = 'https://anikoto.net/search?keyword=one%20piece';
    const searchHtml = await axios.get(searchUrl, { headers: DEFAULT_HEADERS });
    const $1 = cheerio.load(searchHtml.data);
    let href = $1('.items .item a').first().attr('href');
    if (!href) throw new Error("Could not find search result");
    
    // Sometimes the search result is /watch/xyz or /watch/xyz/ep-1
    let watchUrl = href;
    if (!watchUrl.startsWith('http')) {
      watchUrl = 'https://anikoto.net' + (watchUrl.startsWith('/') ? '' : '/') + watchUrl;
    }
    
    // Make sure it goes to the watch page, not just the details page (append /ep-1 if missing)
    if (!watchUrl.includes('/ep-')) {
      watchUrl += '/ep-1';
    }

    console.log("Fetching:", watchUrl);
    const watchHtml = await axios.get(watchUrl, { headers: DEFAULT_HEADERS });
    const $2 = cheerio.load(watchHtml.data);
    const dataIds = $2('.ep-item').first().attr('data-ids');
    if (!dataIds) throw new Error("Could not find data-ids for episode");
    console.log("dataIds:", dataIds);

    const listUrl = `https://anikoto.net/ajax/server/list?servers=${dataIds}`;
    const listRes = await axios.get(listUrl, {
      headers: { ...DEFAULT_HEADERS, 'X-Requested-With': 'XMLHttpRequest' }
    });
    const $3 = cheerio.load(listRes.data.result);
    
    let targetLinkId = null;
    $3('.server').each((i, el) => {
      const text = $3(el).text().toLowerCase();
      if (text.includes('megacloud') || text.includes('megaplay')) {
        targetLinkId = $3(el).attr('data-link-id');
      }
    });

    if (!targetLinkId) throw new Error("Could not find MegaPlay/MegaCloud server");
    console.log("Server ID:", targetLinkId);

    const embedRes = await axios.get(`https://anikoto.net/ajax/server?get=${targetLinkId}`, {
      headers: { ...DEFAULT_HEADERS, 'X-Requested-With': 'XMLHttpRequest', 'Referer': watchUrl }
    });
    const embedUrl = embedRes.data.result.url;
    console.log("Embed URL:", embedUrl);

    const match = embedUrl.match(/e-1\/([a-zA-Z0-9_-]+)\?/);
    const id = match ? match[1] : embedUrl.split('/').pop().split('?')[0];
    const host = new URL(embedUrl).host;

    console.log(`Fetching from Megaplay (${host}) with ID: ${id}`);
    const sourcesRes = await axios.get(`https://${host}/stream/getSources?id=${id}`, {
      headers: { 'X-Requested-With': 'XMLHttpRequest', 'Referer': embedUrl }
    });

    console.log("Megaplay JSON Response:", JSON.stringify(sourcesRes.data, null, 2));

  } catch (e) {
    console.log("Error:", e.message);
  }
}

test();
