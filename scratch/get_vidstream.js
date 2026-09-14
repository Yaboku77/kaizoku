const axios = require('axios');

async function test() {
  try {
    const linkId = 'MTF1dkFtaW9BRTZPbzJJRElFZUZrOWdjeldjOERLaWNMMXFNbVB3WUJqK3lSL21XaEZ4NGFZN3dEYS8wUk5wSUtqRTZickY5V091ZnE0UFMzVmlkZXFnMGM0NnozWkR6WW8vVjZNZFcyMU9nY2lqWUtKVmJ3bU1sVUJLU05keHhibWVWYVluZUZhdDNpS2dxbi9MWSt3Y3JBWGc2LzY4R2g3K2hrRXBDdVdzPQ';
    const rs = await axios.get(`https://anikoto.net/ajax/server?get=${linkId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': 'https://anikoto.net/watch/dr-stone-uenxt',
      }
    });
    console.log('Vidstream-2 link:', rs.data);

    const hd1Id = 'MTF1dkFtaW9BRTZPbzJJRElFZUZrOWdjeldjOERLaWNMMXFNbVB3WUJqK3lSL21XaEZ4NGFZN3dEYS8wUk5wSTRuVU0wOXlCRHJVcllPQkZHU2diLzd3bTUwRHRNMHppcDZOZFh5K24wWjJLUG9OazdocGhIZ1JFb2dKeXNmelZLNlBOb0RhdjZDWWcxUnBraGlDYm1TSWVHUEppSGdtUHl6a1ozckZGUGExZEliYVFNMTljOTVvdjlEejRhOHhI';
    const rs2 = await axios.get(`https://anikoto.net/ajax/server?get=${hd1Id}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': 'https://anikoto.net/watch/dr-stone-uenxt',
      }
    });
    console.log('HD-1 link:', rs2.data);
  } catch (err) {
    console.error('Error:', err.message);
  }
}
test();
