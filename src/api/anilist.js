import axios from 'axios';

const ANILIST_API_URL = 'https://graphql.anilist.co';

/**
 * Helper to make requests to the AniList GraphQL API.
 */
async function makeRequest(query, variables = {}, token = null) {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await axios.post(ANILIST_API_URL, {
      query,
      variables
    }, { headers });

    if (response.data.errors) {
      throw new Error(response.data.errors[0].message || 'AniList API Error');
    }
    return response.data.data;
  } catch (error) {
    console.error('AniList API request failed:', error);
    throw error;
  }
}

/**
 * Fetch the authenticated user's AniList profile info.
 */
export async function fetchViewer(token) {
  const query = `
    query {
      Viewer {
        id
        name
        avatar {
          large
          medium
        }
      }
    }
  `;
  const data = await makeRequest(query, {}, token);
  return data.Viewer;
}

/**
 * Post a user status/text activity update.
 */
export async function saveTextActivity(token, text) {
  const mutation = `
    mutation ($text: String) {
      SaveTextActivity (text: $text) {
        id
        text
        createdAt
      }
    }
  `;
  const data = await makeRequest(mutation, { text }, token);
  return data.SaveTextActivity;
}

/**
 * Fetch threads in the media category.
 */
export async function fetchAnimeThreads(mediaId) {
  const query = `
    query ($mediaId: Int) {
      Page(page: 1, perPage: 25) {
        threads(mediaCategoryId: $mediaId) {
          id
          title
          replyCount
          viewCount
          createdAt
          user {
            id
            name
            avatar {
              medium
            }
          }
        }
      }
    }
  `;
  const data = await makeRequest(query, { mediaId: parseInt(mediaId) });
  return data.Page.threads;
}

/**
 * Fetch comments for a specific thread.
 */
export async function fetchThreadComments(threadId, page = 1) {
  const query = `
    query ($threadId: Int, $page: Int) {
      Page(page: $page, perPage: 40) {
        threadComments(threadId: $threadId) {
          id
          comment(asHtml: true)
          createdAt
          likeCount
          user {
            id
            name
            avatar {
              medium
            }
          }
        }
      }
    }
  `;
  const data = await makeRequest(query, { threadId: parseInt(threadId), page });
  return data.Page.threadComments;
}

/**
 * Post a comment reply on a thread.
 */
export async function saveThreadComment(token, threadId, comment, parentCommentId = null) {
  const mutation = `
    mutation ($threadId: Int, $comment: String, $parentCommentId: Int) {
      SaveThreadComment(threadId: $threadId, comment: $comment, parentCommentId: $parentCommentId) {
        id
        comment
        createdAt
        user {
          id
          name
          avatar {
            medium
          }
        }
      }
    }
  `;
  const variables = { threadId: parseInt(threadId), comment };
  if (parentCommentId) {
    variables.parentCommentId = parseInt(parentCommentId);
  }
  const data = await makeRequest(mutation, variables, token);
  return data.SaveThreadComment;
}

/**
 * Create a new thread for the media category.
 */
export async function saveThread(token, title, body, mediaId) {
  const mutation = `
    mutation ($title: String, $body: String, $mediaCategories: [Int]) {
      SaveThread(title: $title, body: $body, mediaCategories: $mediaCategories) {
        id
        title
        body
      }
    }
  `;
  const data = await makeRequest(mutation, { title, body, mediaCategories: [parseInt(mediaId)] }, token);
  return data.SaveThread;
}

/**
 * Fetch a top comment and total thread comment count for the preview.
 */
export async function fetchAniListCommentsPreview(mediaId, epNum = null) {
  try {
    const threads = await fetchAnimeThreads(mediaId);
    let targetThreads = threads;

    if (epNum) {
      const epMatches = threads.filter(t =>
        t.title.toLowerCase().includes(`episode ${epNum}`) ||
        t.title.toLowerCase().includes(`ep ${epNum}`) ||
        t.title.toLowerCase().includes(`ep. ${epNum}`) ||
        t.title.toLowerCase().includes(`ep${epNum}`)
      );
      if (epMatches.length > 0) {
        targetThreads = epMatches;
      }
    }

    let totalComments = 0;
    targetThreads.forEach(t => {
      totalComments += (t.replyCount || 0);
    });

    let topComment = null;
    const sorted = targetThreads.sort((a, b) => (b.replyCount || 0) - (a.replyCount || 0));
    const bestThread = sorted.length > 0 ? sorted[0] : null;

    if (bestThread && bestThread.replyCount > 0) {
      const comments = await fetchThreadComments(bestThread.id);
      if (comments && comments.length > 0) {
        const last = comments[comments.length - 1];
        topComment = {
          id: String(last.id),
          displayName: last.user?.name || 'AniList User',
          photoURL: last.user?.avatar?.medium || '',
          text: last.comment?.replace(/<[^>]*>?/gm, '') || '',
          isAniList: true
        };
      }
    }

    if (!topComment && bestThread) {
      topComment = {
        id: String(bestThread.id),
        displayName: bestThread.user?.name || 'AniList User',
        photoURL: bestThread.user?.avatar?.medium || '',
        text: bestThread.title,
        isAniList: true
      };
    }
    return { totalComments, topComment };
  } catch (e) {
    return { totalComments: 0, topComment: null };
  }
}
