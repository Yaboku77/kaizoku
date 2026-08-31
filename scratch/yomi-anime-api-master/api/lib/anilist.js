/**
 * AniList GraphQL API client
 * Fetches anime metadata directly from AniList — the same source yomi.to uses.
 */

const ANILIST_URL = "https://graphql.anilist.co";

const ANILIST_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json",
};

// ─── Fragment (must be defined before queries that use it) ──────────────────

const MEDIA_FIELDS = `
fragment MediaFields on Media {
  id
  idMal
  title { romaji english native }
  coverImage { large medium color }
  bannerImage
  format
  status
  episodes
  meanScore
  averageScore
  popularity
  trending
  genres
  description
  season
  seasonYear
  nextAiringEpisode { episode airingAt }
}`;

// ─── Queries ────────────────────────────────────────────────────────────────

const ANIME_SEARCH_QUERY = `${MEDIA_FIELDS}
query ($search: String, $page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { total lastPage hasNextPage }
    media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
      ...MediaFields
    }
  }
}`;

const ANIME_DETAIL_QUERY = `${MEDIA_FIELDS}
query ($id: Int) {
  Media(id: $id, type: ANIME) {
    ...MediaFields
    duration
    streamingEpisodes { title thumbnail url site }
    relations {
      edges {
        relationType
        node { id title { romaji english native } coverImage { large color } format }
      }
    }
    recommendations(perPage: 10) {
      nodes {
        mediaRecommendation {
          ...MediaFields
        }
      }
    }
    characters(sort: ROLE, perPage: 15) {
      edge: edges {
        role
        voiceActors {
          id name { full } image { large } languageV2
        }
        node { id name { full } image { large } }
      }
    }
    staff(perPage: 10) {
      edge: edges {
        role
        node { id name { full } image { large } }
      }
    }
  }
}`;

const TRENDING_QUERY = `${MEDIA_FIELDS}
query ($page: Int, $perPage: Int, $sort: [MediaSort], $status: MediaStatus) {
  Page(page: $page, perPage: $perPage) {
    media(type: ANIME, sort: $sort, status: $status) {
      ...MediaFields
    }
  }
}`;

const BROWSE_QUERY = `${MEDIA_FIELDS}
query ($page: Int, $perPage: Int, $sort: [MediaSort], $genre: String, $format: MediaFormat, $status: MediaStatus, $season: MediaSeason, $seasonYear: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { total lastPage hasNextPage currentPage }
    media(type: ANIME, sort: $sort, genre: $genre, format: $format, status: $status, season: $season, seasonYear: $seasonYear) {
      ...MediaFields
    }
  }
}`;

const SEASONAL_QUERY = `${MEDIA_FIELDS}
query ($season: MediaSeason, $year: Int, $page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { total lastPage hasNextPage currentPage }
    media(type: ANIME, season: $season, seasonYear: $year, sort: POPULARITY_DESC) {
      ...MediaFields
    }
  }
}`;

const SCHEDULE_QUERY = `
query ($airingAt_greater: Int, $airingAt_lesser: Int, $page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { total hasNextPage }
    airingSchedules(airingAt_greater: $airingAt_greater, airingAt_lesser: $airingAt_lesser, sort: TIME) {
      id
      airingAt
      episode
      media {
        id
        idMal
        title { romaji english native }
        coverImage { large color }
        bannerImage
        format
        status
      }
    }
  }
}`;

// ─── Fetch helper ───────────────────────────────────────────────────────────

async function anilistFetch(query, variables = {}) {
  const res = await fetch(ANILIST_URL, {
    method: "POST",
    headers: ANILIST_HEADERS,
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`AniList API error: ${res.status}`);
  }

  const json = await res.json();
  if (json.errors) {
    console.error("[anilist] GraphQL errors:", json.errors);
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }

  return json.data;
}

// ─── Public API ─────────────────────────────────────────────────────────────

async function searchAnime(query, page = 1, perPage = 20) {
  const data = await anilistFetch(ANIME_SEARCH_QUERY, {
    search: query,
    page,
    perPage: Math.min(perPage, 50),
  });
  return data.Page;
}

async function getAnimeDetail(id) {
  const data = await anilistFetch(ANIME_DETAIL_QUERY, { id: Number(id) });
  return data.Media;
}

async function getTrending(page = 1, perPage = 20) {
  const data = await anilistFetch(TRENDING_QUERY, {
    page,
    perPage: Math.min(perPage, 50),
    sort: "TRENDING_DESC",
  });
  return data.Page;
}

async function browseAnime({ sort, genre, format, status, season, seasonYear, page = 1, perPage = 20 } = {}) {
  const variables = { page, perPage: Math.min(perPage, 50) };
  if (sort) variables.sort = sort;
  if (genre) variables.genre = genre;
  if (format) variables.format = format;
  if (status) variables.status = status;
  if (season) variables.season = season;
  if (seasonYear) variables.seasonYear = Number(seasonYear);

  const data = await anilistFetch(BROWSE_QUERY, variables);
  return data.Page;
}

async function getSeasonal(season, year, page = 1, perPage = 20) {
  const data = await anilistFetch(SEASONAL_QUERY, {
    season,
    year: Number(year),
    page,
    perPage: Math.min(perPage, 50),
  });
  return data.Page;
}

async function getSchedule(startUnix, endUnix, page = 1, perPage = 50) {
  const data = await anilistFetch(SCHEDULE_QUERY, {
    airingAt_greater: startUnix,
    airingAt_lesser: endUnix,
    page,
    perPage: Math.min(perPage, 50),
  });
  return data.Page;
}

module.exports = {
  searchAnime,
  getAnimeDetail,
  getTrending,
  browseAnime,
  getSeasonal,
  getSchedule,
};
