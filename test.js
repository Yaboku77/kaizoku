const axios = require('axios');
const query = `
  query ($threadId: Int, $page: Int) {
    Page(page: $page, perPage: 40) {
      threadComments(threadId: $threadId) {
        id
        comment(asHtml: true)
        likeCount
        createdAt
        user { id name avatar { medium } }
        childComments {
          id
          comment(asHtml: true)
          likeCount
          createdAt
          user { id name avatar { medium } }
        }
      }
    }
  }
`;
axios.post('https://graphql.anilist.co', { query, variables: { threadId: 67332, page: 1 } })
  .then(res => console.log(JSON.stringify(res.data, null, 2)))
  .catch(err => console.log(JSON.stringify(err.response?.data || err.message, null, 2)));
