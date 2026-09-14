const axios = require('axios');

async function test() {
  try {
    const r1 = await axios.get('https://anikoto.net/watch/daemons-of-the-shadow-realm-hxj32/ep-1');
    const match = r1.data.match(/data-id=['"]([^'"]+)['"]/);
    if (!match) return console.log('No data-id');
    const id = match[1];
    
    const r2 = await axios.get(`https://anikoto.net/ajax/server/list?servers=${id}`, {
      headers: { Referer: 'https://anikoto.net/watch/daemons-of-the-shadow-realm-hxj32/ep-1' }
    });
    const html = r2.data.result;
    
    const servers = [...html.matchAll(/data-link-id="([^"]+)".*?>\s*(.*?)\s*<\/a>/g)].map(m => ({ id: m[1], name: m[2] }));
    console.log('Servers:', servers);

    for (const s of servers) {
       try {
           const rs = await axios.get(`https://anikoto.net/ajax/server?get=${s.id}`, {
             headers: { Referer: 'https://anikoto.net/watch/daemons-of-the-shadow-realm-hxj32/ep-1' }
           });
           console.log(s.name, rs.data.result.url);
       } catch (err) {
           console.log(s.name, err.message);
       }
    }
  } catch (err) {
    console.error(err.message);
  }
}
test();
