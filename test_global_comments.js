const axios = require('axios');
const query = `
  query {
    Page(page: 1, perPage: 3) {
      threadComments(sort: ID_DESC) {
        id
        comment(asHtml: true)
        createdAt
        user { name avatar { medium } }
        thread { id title }
      }
    }
  }
`;
axios.post('https://graphql.anilist.co', { query })
  .then(res => console.log(JSON.stringify(res.data, null, 2)))
  .catch(err => console.log(JSON.stringify(err.response?.data || err.message, null, 2)));
