const axios = require('axios');
axios.get('https://anikoto.net/watch/daemons-of-the-shadow-realm-hxj32/ep-1')
  .then(r => {
    const match = r.data.match(/data-id=['"]([^'"]+)['"]/);
    console.log('Data ID:', match ? match[1] : null);
    if(match) {
       axios.get(`https://anikoto.net/ajax/server/list?server=${match[1]}`)
       .then(r2 => console.log(r2.data))
       .catch(e => console.error(e.message));
    }
  })
  .catch(e => console.error(e.message));
