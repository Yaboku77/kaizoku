/**
 * Jikan API client (MyAnimeList unofficial API)
 * Used as a fallback when AniList is unavailable, and for MAL-specific data.
 */

const JIKAN_BASE = "https://api.jikan.moe/v4";

let lastRequest = 0;
const RATE_LIMIT_MS = 400; // Jikan rate limit: ~3 req/sec

async function jikanFetch(path) {
  // Simple rate limiter
  const now = Date.now();
  const wait = RATE_LIMIT_MS - (now - lastRequest);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();

  const res = await fetch(`${JIKAN_BASE}${path}`);
  if (!res.ok) {
    throw new Error(`Jikan API error: ${res.status}`);
  }
  const json = await res.json();
  return json.data;
}

// ─── Public API ─────────────────────────────────────────────────────────────

async function searchMAL(query, page = 1, limit = 20) {
  return jikanFetch(
    `/anime?q=${encodeURIComponent(query)}&page=${page}&limit=${Math.min(limit, 25)}&sfw=true`
  );
}

async function getMALAnime(id) {
  return jikanFetch(`/anime/${id}/full`);
}

async function getTopAnime(page = 1, limit = 20, filter = "bypopularity") {
  return jikanFetch(`/top/anime?page=${page}&limit=${Math.min(limit, 25)}&filter=${filter}`);
}

async function getSeasonNow(page = 1, limit = 20) {
  return jikanFetch(`/seasons/now?page=${page}&limit=${Math.min(limit, 25)}`);
}

async function getSeason(year, season, page = 1, limit = 20) {
  return jikanFetch(`/seasons/${year}/${season}?page=${page}&limit=${Math.min(limit, 25)}`);
}

async function getSchedule(day) {
  const path = day ? `/schedules?filter=${day}` : "/schedules";
  return jikanFetch(path);
}

module.exports = {
  searchMAL,
  getMALAnime,
  getTopAnime,
  getSeasonNow,
  getSeason,
  getSchedule,
};
