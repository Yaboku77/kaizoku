/**
 * Single catch-all API route for Vercel.
 * Handles ALL /api/* requests — counts as 1 serverless function.
 *
 * Routes (flattened to work with Vercel's [...slug]):
 *   GET /api                          → API docs (served by api/index.js)
 *   GET /api/detail?id=21             → Anime detail
 *   GET /api/search?q=...             → Search
 *   GET /api/list?...                 → Browse
 *   GET /api/trending                 → Trending
 *   GET /api/top                      → Top rated
 *   GET /api/seasonal                 → Seasonal
 *   GET /api/schedule                 → Schedule
 *   GET /api/watch?animeId=21&ep=1    → Streaming sources
 *   GET /api/random                   → Random anime
 */

const { searchAnime, getAnimeDetail, getTrending, browseAnime, getSeasonal, getSchedule } = require("./lib/anilist");
const { searchMAL } = require("./lib/jikan");
const { getAllSources, buildStreamUrl, getServerList } = require("./lib/streams");
const { json, error, formatAnime, stripHtml, paginate, getQueryParams, GENRES, FORMATS, SORT_OPTIONS, STATUSES, SEASONS } = require("./lib/utils");

// ─── Route mapping (flattened) ─────────────────────────────────────────────

const ROUTES = {
  "detail":   handleDetail,
  "search":   handleSearch,
  "list":     handleList,
  "trending": handleTrending,
  "top":      handleTop,
  "seasonal": handleSeasonal,
  "schedule": handleSchedule,
  "watch":    handleWatch,
  "random":   handleRandom,
  // Legacy nested paths → same handlers
  "anime":            handleDetail,
  "anime/search":     handleSearch,
  "anime/list":       handleList,
  "anime/trending":   handleTrending,
  "anime/top":        handleTop,
  "anime/seasonal":   handleSeasonal,
  "anime/schedule":   handleSchedule,
};

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(200).json({ ok: true });
  }

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const rawPath = url.pathname
    .replace(/^\/api\/?/, "")
    .replace(/\/+$/, "");

  const routeKey = rawPath || "";
  const handlerFn = ROUTES[routeKey];

  if (!handlerFn) {
    return error(res, `Unknown route: /api/${routeKey || ""}`, 404);
  }

  return handlerFn(req, res);
};

// ─── Handler: /api/detail?id= ──────────────────────────────────────────────

async function handleDetail(req, res) {
  const params = getQueryParams(req);

  if (!params.id) return error(res, "Missing required parameter: id");

  const id = parseInt(params.id);
  if (isNaN(id) || id <= 0) return error(res, "Invalid anime id — must be a positive integer");

  try {
    const media = await getAnimeDetail(id);
    if (!media) return error(res, "Anime not found", 404);

    const anime = formatAnime(media);

    const response = {
      ...anime,
      description: stripHtml(media.description),
      streamingEpisodes: (media.streamingEpisodes || []).map((ep) => ({
        title: ep.title,
        thumbnail: ep.thumbnail,
        url: ep.url,
        site: ep.site,
      })),
      relations: (media.relations?.edges || []).map((edge) => ({
        type: edge.relationType,
        anime: formatAnime(edge.node),
      })),
      characters: (media.characters?.edge || []).map((edge) => ({
        role: edge.role,
        character: {
          id: edge.node.id,
          name: edge.node.name?.full,
          image: edge.node.image?.large,
        },
        voiceActors: (edge.voiceActors || []).map((va) => ({
          id: va.id,
          name: va.name?.full,
          image: va.image?.large,
          language: va.languageV2,
        })),
      })),
      staff: (media.staff?.edge || []).map((edge) => ({
        role: edge.role,
        staff: {
          id: edge.node.id,
          name: edge.node.name?.full,
          image: edge.node.image?.large,
        },
      })),
      recommendations: (media.recommendations?.nodes || [])
        .map((node) => formatAnime(node.mediaRecommendation))
        .filter(Boolean),
      streaming: {
        servers: getServerList(),
        sources: getAllSources({
          animeId: media.id,
          malId: media.idMal,
          episode: 1,
        }),
      },
    };

    return json(res, response);
  } catch (err) {
    console.error("[api/detail]", err.message);
    return error(res, `Failed to fetch anime: ${err.message}`, 502);
  }
}

// ─── Handler: /api/search?q= ───────────────────────────────────────────────

async function handleSearch(req, res) {
  const params = getQueryParams(req);

  if (!params.q && !params.query && !params.search) {
    return error(res, "Missing required parameter: q (search query)");
  }

  const query = params.q || params.query || params.search;
  const { page, perPage } = paginate(params);

  try {
    let results;
    try {
      const data = await searchAnime(query, page, perPage);
      results = {
        source: "anilist",
        pagination: data.pageInfo,
        results: data.media.map(formatAnime).filter(Boolean),
      };
    } catch (anilistErr) {
      console.warn("[search] AniList failed, falling back to Jikan:", anilistErr.message);
      const jikanData = await searchMAL(query, page, perPage);
      results = {
        source: "jikan",
        pagination: { currentPage: page, hasNextPage: jikanData.length >= perPage },
        results: jikanData.map((item) => ({
          id: item.mal_id,
          idMal: item.mal_id,
          title: {
            romaji: item.title,
            english: item.title_english,
            native: item.title_japanese,
          },
          coverImage: {
            large: item.images?.jpg?.large_image_url || item.images?.webp?.large_image_url,
            medium: item.images?.jpg?.image_url || item.images?.webp?.image_url,
          },
          bannerImage: null,
          format: item.type || null,
          status: item.status || null,
          episodes: item.episodes || null,
          duration: item.duration || null,
          meanScore: item.score || null,
          averageScore: item.score || null,
          popularity: item.popularity || null,
          trending: null,
          genres: (item.genres || []).map((g) => g.name),
          description: item.synopsis || null,
          season: item.season || null,
          seasonYear: item.year || null,
          nextAiringEpisode: null,
          url: item.url,
          score: item.score,
          scoredBy: item.scored_by,
          rank: item.rank,
          year: item.year,
          source: item.source,
          rating: item.rating,
        })),
      };
    }

    return json(res, { query, page, limit: perPage, ...results });
  } catch (err) {
    console.error("[api/search]", err.message);
    return error(res, `Search failed: ${err.message}`, 502);
  }
}

// ─── Handler: /api/list ────────────────────────────────────────────────────

async function handleList(req, res) {
  const params = getQueryParams(req);
  const { page, perPage } = paginate(params);

  try {
    const sort = params.sort || "TRENDING_DESC";
    const genre = params.genre || undefined;
    const format = params.format || undefined;
    const status = params.status || undefined;
    const season = params.season || undefined;
    const seasonYear = params.seasonYear || undefined;

    const data = await browseAnime({ sort, genre, format, status, season, seasonYear, page, perPage });

    return json(res, {
      page,
      limit: perPage,
      pagination: data.pageInfo,
      filters: {
        sort,
        genre: genre || null,
        format: format || null,
        status: status || null,
        season: season || null,
        seasonYear: seasonYear ? Number(seasonYear) : null,
      },
      availableFilters: {
        genres: GENRES,
        formats: FORMATS,
        sortOptions: SORT_OPTIONS,
        statuses: STATUSES,
        seasons: SEASONS,
      },
      results: data.media.map(formatAnime).filter(Boolean),
    });
  } catch (err) {
    console.error("[api/list]", err.message);
    return error(res, `Failed to fetch anime list: ${err.message}`, 502);
  }
}

// ─── Handler: /api/trending ────────────────────────────────────────────────

async function handleTrending(req, res) {
  const params = getQueryParams(req);
  const { page, perPage } = paginate(params);

  try {
    const data = await getTrending(page, perPage);

    return json(res, {
      page,
      limit: perPage,
      pagination: data.pageInfo,
      results: data.media.map(formatAnime).filter(Boolean),
    });
  } catch (err) {
    console.error("[api/trending]", err.message);
    return error(res, `Failed to fetch trending: ${err.message}`, 502);
  }
}

// ─── Handler: /api/top ─────────────────────────────────────────────────────

async function handleTop(req, res) {
  const params = getQueryParams(req);
  const { page, perPage } = paginate(params);

  const filterMap = {
    popularity: "POPULARITY_DESC",
    score: "SCORE_DESC",
    trending: "TRENDING_DESC",
  };
  const sort = filterMap[params.filter] || "SCORE_DESC";

  try {
    const data = await browseAnime({
      sort,
      status: params.status || undefined,
      page,
      perPage,
    });

    return json(res, {
      page,
      limit: perPage,
      sort,
      pagination: data.pageInfo,
      results: data.media.map(formatAnime).filter(Boolean),
    });
  } catch (err) {
    console.error("[api/top]", err.message);
    return error(res, `Failed to fetch top anime: ${err.message}`, 502);
  }
}

// ─── Handler: /api/seasonal ────────────────────────────────────────────────

function getCurrentSeason() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  if (month <= 3) return { season: "WINTER", year };
  if (month <= 6) return { season: "SPRING", year };
  if (month <= 9) return { season: "SUMMER", year };
  return { season: "FALL", year };
}

async function handleSeasonal(req, res) {
  const params = getQueryParams(req);
  const { page, perPage } = paginate(params);

  const current = getCurrentSeason();
  const season = (params.season || current.season).toUpperCase();
  const year = parseInt(params.year) || current.year;

  if (!SEASONS.includes(season)) {
    return error(res, `Invalid season: ${season}. Must be one of: ${SEASONS.join(", ")}`);
  }

  try {
    const data = await getSeasonal(season, year, page, perPage);

    return json(res, {
      season,
      year,
      isCurrentSeason: season === current.season && year === current.year,
      page,
      limit: perPage,
      pagination: data.pageInfo,
      results: data.media.map(formatAnime).filter(Boolean),
    });
  } catch (err) {
    console.error("[api/seasonal]", err.message);
    return error(res, `Failed to fetch seasonal anime: ${err.message}`, 502);
  }
}

// ─── Handler: /api/schedule ────────────────────────────────────────────────

async function handleSchedule(req, res) {
  const params = getQueryParams(req);
  const { page, perPage } = paginate(params);

  const dateStr = params.date || new Date().toISOString().split("T")[0];
  const date = new Date(dateStr + "T00:00:00Z");
  const startUnix = Math.floor(date.getTime() / 1000);
  const endUnix = startUnix + 86400;

  try {
    const data = await getSchedule(startUnix, endUnix, page, perPage);

    return json(res, {
      date: dateStr,
      page,
      limit: perPage,
      pagination: data.pageInfo,
      results: data.airingSchedules.map((schedule) => ({
        id: schedule.id,
        airingAt: schedule.airingAt,
        episode: schedule.episode,
        anime: {
          id: schedule.media.id,
          idMal: schedule.media.idMal,
          title: {
            romaji: schedule.media.title?.romaji,
            english: schedule.media.title?.english,
            native: schedule.media.title?.native,
          },
          coverImage: {
            large: schedule.media.coverImage?.large,
            color: schedule.media.coverImage?.color,
          },
          bannerImage: schedule.media.bannerImage,
          format: schedule.media.format,
          status: schedule.media.status,
        },
        watchUrl: `/api/watch?animeId=${schedule.media.id}&ep=${schedule.episode}`,
      })),
    });
  } catch (err) {
    console.error("[api/schedule]", err.message);
    return error(res, `Failed to fetch schedule: ${err.message}`, 502);
  }
}

// ─── Handler: /api/watch ───────────────────────────────────────────────────

async function handleWatch(req, res) {
  const params = getQueryParams(req);

  if (!params.animeId && !params.id) {
    return error(res, "Missing required parameter: animeId (AniList ID)");
  }

  const animeId = parseInt(params.animeId || params.id);
  const episode = parseInt(params.ep || params.episode || "1");
  const serverId = params.server ? parseInt(params.server) : null;
  const dub = params.dub === "true";

  if (isNaN(animeId) || animeId <= 0) return error(res, "Invalid animeId — must be a positive integer");
  if (isNaN(episode) || episode <= 0) return error(res, "Invalid episode — must be a positive integer");

  try {
    let anime;
    try {
      anime = await getAnimeDetail(animeId);
    } catch {
      anime = null;
    }

    const malId = anime?.idMal || null;
    const totalEpisodes = anime?.episodes || null;

    if (episode > 0 && totalEpisodes && episode > totalEpisodes) {
      return error(res, `Episode ${episode} does not exist. This anime has ${totalEpisodes} episodes.`, 404);
    }

    let sources;

    if (serverId) {
      const url = buildStreamUrl({ animeId, malId, episode, server: serverId, dub });
      sources = [
        {
          server: serverId,
          serverName: getServerList().find((s) => s.id === serverId)?.name || `Server ${serverId}`,
          url,
          type: dub ? "dub" : "sub",
          embedUrl: url,
        },
      ];
    } else {
      sources = getAllSources({ animeId, malId, episode });
    }

    return json(res, {
      animeId,
      idMal: malId,
      episode,
      totalEpisodes,
      dub,
      servers: getServerList(),
      sources,
      anime: anime
        ? {
            id: anime.id,
            title: {
              romaji: anime.title?.romaji,
              english: anime.title?.english,
            },
            coverImage: anime.coverImage?.large,
            bannerImage: anime.bannerImage,
            format: anime.format,
            episodes: anime.episodes,
          }
        : null,
    });
  } catch (err) {
    console.error("[api/watch]", err.message);
    return error(res, `Failed to get streaming sources: ${err.message}`, 502);
  }
}

// ─── Handler: /api/random ──────────────────────────────────────────────────

async function handleRandom(req, res) {
  try {
    const randomPage = Math.floor(Math.random() * 20) + 1;
    const data = await browseAnime({
      sort: "POPULARITY_DESC",
      page: randomPage,
      perPage: 25,
    });

    if (!data.media || data.media.length === 0) return error(res, "No anime found", 404);

    const randomIndex = Math.floor(Math.random() * data.media.length);
    const anime = formatAnime(data.media[randomIndex]);

    return json(res, anime);
  } catch (err) {
    console.error("[api/random]", err.message);
    return error(res, `Failed to get random anime: ${err.message}`, 502);
  }
}
