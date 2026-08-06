const https = require('https');

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function main() {
  console.log("Testing extractMegaplay...");
  const url = 'https://megaplay.buzz/stream/mal/21/1/sub';
  console.log(`URL: ${url}`);
  try {
    const html = await get(url);
    console.log("HTML length:", html.length);
    console.log("Match:", html.match(/<title>File ([0-9]+)/));
  } catch (err) {
    console.error(err);
  }
}

main();
