const axios = require('axios');
const fs = require('fs');
const query = `
query {
  recentComments: Page(page: 1, perPage: 3) {
    threadComments(sort: ID_DESC) {
      id
      comment(asHtml: true)
      createdAt
      user { name avatar { medium } }
      thread { title mediaCategories { title { romaji english } } }
    }
  }
}`;
axios.post('https://graphql.anilist.co', { query })
  .then(res => {
    fs.writeFileSync('C:\\anime\\kaizoku stream\\app\\graphql_test.json', JSON.stringify(res.data, null, 2));
  })
  .catch(err => {
    fs.writeFileSync('C:\\anime\\kaizoku stream\\app\\graphql_test.json', JSON.stringify(err.response?.data || err.message, null, 2));
  });
