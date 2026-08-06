const https = require('https');

https.get('https://anikoto.net/filter?keyword=Attack+on+Titan', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    // Extract titles using simple regex
    const matches = [...data.matchAll(/class="name"[^>]*>([^<]+)<\/a>/g)];
    console.log(`Found ${matches.length} matches!`);
    matches.slice(0, 5).forEach((m, i) => console.log(`${i + 1}. ${m[1].trim()}`));
  });
}).on('error', err => console.log('Error: ', err.message));
