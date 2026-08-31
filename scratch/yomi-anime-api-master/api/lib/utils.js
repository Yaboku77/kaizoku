/**
 * Shared utilities for API routes
 */

const GENRES = [
  "Action", "Adventure", "Comedy", "Drama", "Fantasy",
  "Horror", "Mystery", "Romance", "Sci-Fi", "Slice of Life",
  "Sports", "Supernatural", "Thriller", "Psychological",
  "Mecha", "Historical", "Ecchi", "Isekai",
];

const FORMATS = ["TV", "MOVIE", "OVA", "ONA", "SPECIAL", "MUSIC"];
const SORT_OPTIONS = [
  "TRENDING_DESC", "POPULARITY_DESC", "SCORE_DESC",
  "START_DATE_DESC", "END_DATE_DESC", "EPISODES_DESC",
  "FAVOURITES_DESC",
];
const STATUSES = ["FINISHED", "RELEASING", "NOT_YET_RELEASED", "CANCELLED", "HIATUS"];
const SEASONS = ["WINTER", "SPRING", "SUMMER", "FALL"];

function json(res, data, status = 200) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(status).json(data);
}

function error(res, message, status = 400) {
  return json(res, { error: true, message }, status);
}

function paginate(params) {
  const page = Math.max(1, parseInt(params.page) || 1);
  const perPage = Math.min(50, Math.max(1, parseInt(params.perPage || params.limit) || 20));
  return { page, perPage };
}

function getQueryParam(req, name, defaultVal) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  return url.searchParams.get(name) || defaultVal;
}

function getQueryParams(req) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const params = {};
  for (const [key, value] of url.searchParams.entries()) {
    params[key] = value;
  }
  return params;
}

/**
 * Format an AniList media object into a clean API response
 */
function formatAnime(media) {
  if (!media) return null;
  return {
    id: media.id,
    idMal: media.idMal || null,
    title: {
      romaji: media.title?.romaji || null,
      english: media.title?.english || null,
      native: media.title?.native || null,
    },
    coverImage: {
      large: media.coverImage?.large || null,
      medium: media.coverImage?.medium || null,
      color: media.coverImage?.color || null,
    },
    bannerImage: media.bannerImage || null,
    format: media.format || null,
    status: media.status || null,
    episodes: media.episodes || null,
    duration: media.duration || null,
    meanScore: media.meanScore || null,
    averageScore: media.averageScore || null,
    popularity: media.popularity || null,
    trending: media.trending || null,
    genres: media.genres || [],
    description: media.description || null,
    season: media.season || null,
    seasonYear: media.seasonYear || null,
    nextAiringEpisode: media.nextAiringEpisode
      ? {
          episode: media.nextAiringEpisode.episode,
          airingAt: media.nextAiringEpisode.airingAt,
          timeUntilAiring: media.nextAiringEpisode.airingAt
            ? media.nextAiringEpisode.airingAt - Math.floor(Date.now() / 1000)
            : null,
        }
      : null,
  };
}

/**
 * Strip HTML tags from AniList descriptions
 */
function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
}

module.exports = {
  GENRES,
  FORMATS,
  SORT_OPTIONS,
  STATUSES,
  SEASONS,
  json,
  error,
  paginate,
  getQueryParam,
  getQueryParams,
  formatAnime,
  stripHtml,
};
