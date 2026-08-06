const axios = require('axios');

async function testAot() {
  try {
    const epUrl = 'https://anikoto.net/watch/attack-on-titan/ep-1';
    console.log('Fetching watch page:', epUrl);
    const { data: watchHtml } = await axios.get(epUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://anikoto.net/'
      }
    });

    const idMatch = watchHtml.match(/data-ids=["']([^"']+)["']/);
    console.log('data-ids match:', idMatch ? idMatch[1] : 'null');

    if (idMatch) {
      const serversUrl = `https://anikoto.net/ajax/server/list?servers=${idMatch[1]}`;
      const { data: serversData } = await axios.get(serversUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': epUrl
        }
      });
      console.log('Servers result:', serversData?.result);

      const linkIdMatches = serversData?.result?.match(/data-link-id=["']([^"']+)["']/g);
      console.log('Link IDs found:', linkIdMatches?.length);

      if (linkIdMatches && linkIdMatches[0]) {
        const linkId = linkIdMatches[0].match(/data-link-id=["']([^"']+)["']/)[1];
        console.log('Getting source for linkId:', linkId);
        const sourceUrl = `https://anikoto.net/ajax/server?get=${linkId}`;
        const { data: sourceData } = await axios.get(sourceUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': epUrl,
            'X-Requested-With': 'XMLHttpRequest'
          }
        });
        console.log('Embed URL:', sourceData?.result?.url);

        const embedUrl = sourceData?.result?.url;
        if (embedUrl) {
          const host = new URL(embedUrl).host;
          const { data: embedHtml } = await axios.get(embedUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Referer': 'https://' + host + '/'
            }
          });

          const megaplayIdMatch = embedHtml.match(/<title>File ([0-9]+)/);
          if (megaplayIdMatch) {
            const megaplayId = megaplayIdMatch[1];
            const megaplayGetSources = `https://${host}/stream/getSources?id=${megaplayId}`;
            console.log('Fetching Megaplay getSources:', megaplayGetSources);
            const { data: megaplayData } = await axios.get(megaplayGetSources, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': embedUrl,
                'X-Requested-With': 'XMLHttpRequest'
              }
            });
            console.log('Megaplay response:', JSON.stringify(megaplayData, null, 2));

            const m3u8Url = megaplayData?.sources?.file || megaplayData?.sources?.[0]?.file;
            if (m3u8Url) {
              console.log('Fetching m3u8 playlist:', m3u8Url);
              const { data: m3u8Content } = await axios.get(m3u8Url, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                  'Referer': 'https://' + host + '/'
                }
              });
              console.log('m3u8 Content:\n', m3u8Content);
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

testAot();
