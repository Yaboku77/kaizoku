export const HOME_QUERY = `
query ($page: Int) {
  trending: Page(page: 1, perPage: 10) {
    media(sort: TRENDING_DESC, type: ANIME, isAdult: false) {
      id title { romaji english } coverImage { extraLarge color } bannerImage format status seasonYear
    }
  }
  popular: Page(page: 1, perPage: 10) {
    media(sort: POPULARITY_DESC, type: ANIME, isAdult: false) {
      id title { romaji english } coverImage { extraLarge color } format status seasonYear
    }
  }
  upcoming: Page(page: 1, perPage: 1) {
    media(sort: POPULARITY_DESC, type: ANIME, status: NOT_YET_RELEASED, isAdult: false) {
      id title { romaji english } coverImage { extraLarge } source description genres nextAiringEpisode { timeUntilAiring }
    }
  }
  recent: Page(page: $page, perPage: 5) {
    media(sort: UPDATED_AT_DESC, type: ANIME, status: RELEASING, isAdult: false) {
      id title { romaji english } coverImage { extraLarge medium } trailer { id site } nextAiringEpisode { episode } updatedAt
    }
  }
}
`;

export const DETAILS_QUERY = `
query ($id: Int) {
  Media(id: $id, type: ANIME) {
    id title { romaji english native } synonyms coverImage { extraLarge color } bannerImage startDate { year month day } endDate { year month day } season seasonYear description type format status(version: 2) episodes nextAiringEpisode { episode } duration countryOfOrigin source averageScore genres trailer { id site } studios(isMain: true) { edges { node { name } } } externalLinks { site url }
    characters(sort: ROLE, perPage: 8) { edges { role node { id name { full } image { large } } voiceActors(language: JAPANESE) { id name { full } image { large } } } }
    relations { edges { relationType node { id title { romaji english } coverImage { large } format seasonYear } } }
    recommendations(page: 1, perPage: 10, sort: RATING_DESC) { nodes { mediaRecommendation { id title { romaji english } coverImage { large } format season seasonYear } } }
  }
}
`;

export const BROWSE_QUERY = `
query ($page: Int, $search: String, $sort: [MediaSort], $genre: String, $tag: String, $format: MediaFormat, $seasonYear: Int, $season: MediaSeason, $status: MediaStatus, $source: MediaSource, $countryOfOrigin: CountryCode) {
  Page(page: $page, perPage: 30) {
    pageInfo { hasNextPage }
    media(type: ANIME, isAdult: false, search: $search, sort: $sort, genre: $genre, tag: $tag, format: $format, seasonYear: $seasonYear, season: $season, status: $status, source: $source, countryOfOrigin: $countryOfOrigin) {
      id title { romaji english } coverImage { extraLarge } format seasonYear status
    }
  }
}
`;
