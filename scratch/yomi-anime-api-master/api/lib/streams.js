/**
 * Streaming source builder
 * Constructs embed URLs for each streaming server used by yomi.to.
 */

const STREAMING_SERVERS = [
  {
    id: 1,
    name: "MegaPlay",
    baseUrl: "https://megaplay.buzz",
    supportsMal: true,
    supportsDub: true,
    types: ["sub", "dub"],
  },
  {
    id: 2,
    name: "MegaFlix",
    baseUrl: "https://www.megaflix.buzz",
    supportsMal: true,
    supportsDub: true,
    types: ["sub", "dub"],
  },
  {
    id: 3,
    name: "TryEmbed",
    baseUrl: "https://tryembed.us.cc",
    supportsMal: false,
    supportsDub: true,
    types: ["sub", "dub"],
  },
  {
    id: 4,
    name: "CinexStream",
    baseUrl: "https://cinextream.cc",
    supportsMal: false,
    supportsDub: true,
    types: ["sub", "dub"],
  },
  {
    id: 5,
    name: "NontonGo",
    baseUrl: "https://nontongo.win",
    supportsMal: false,
    supportsDub: false,
    types: ["sub"],
  },
];

/**
 * Build the streaming embed URL for a given anime, episode, server, and language.
 */
function buildStreamUrl({ animeId, malId, episode, server = 1, dub = false, startTime = 0 }) {
  const lang = dub ? "dub" : "sub";
  const t = startTime > 0 ? `?t=${Math.floor(startTime)}` : "";

  switch (server) {
    case 1:
      if (malId) return `${STREAMING_SERVERS[0].baseUrl}/stream/mal/${malId}/${episode}/${lang}${t}`;
      return `${STREAMING_SERVERS[0].baseUrl}/stream/ani/${animeId}/${episode}/${lang}${t}`;
    case 2:
      if (malId) return `${STREAMING_SERVERS[1].baseUrl}/stream/mal/${malId}/${episode}/${lang}`;
      return `${STREAMING_SERVERS[1].baseUrl}/stream/ani/${animeId}/${episode}/${lang}`;
    case 3:
      return `${STREAMING_SERVERS[2].baseUrl}/embed/anime/${animeId}/${episode}/${lang}${t}`;
    case 4:
      return `${STREAMING_SERVERS[3].baseUrl}/api/embed/anime/${lang}/${animeId}/${episode}?color=7c6ee0`;
    case 5:
      return `${STREAMING_SERVERS[4].baseUrl}/anime/${animeId}/${episode}/play`;
    default:
      return null;
  }
}

/**
 * Get all available streaming sources for an anime episode.
 */
function getAllSources({ animeId, malId, episode, startTime = 0 }) {
  const sources = [];

  for (const server of STREAMING_SERVERS) {
    const subUrl = buildStreamUrl({
      animeId,
      malId,
      episode,
      server: server.id,
      dub: false,
      startTime,
    });

    sources.push({
      server: server.id,
      serverName: server.name,
      url: subUrl,
      type: "sub",
      embedUrl: subUrl,
    });

    if (server.supportsDub) {
      const dubUrl = buildStreamUrl({
        animeId,
        malId,
        episode,
        server: server.id,
        dub: true,
        startTime,
      });

      sources.push({
        server: server.id,
        serverName: server.name,
        url: dubUrl,
        type: "dub",
        embedUrl: dubUrl,
      });
    }
  }

  return sources;
}

/**
 * Get all available servers info (without building URLs).
 */
function getServerList() {
  return STREAMING_SERVERS.map((s) => ({
    id: s.id,
    name: s.name,
    supportsMal: s.supportsMal,
    supportsDub: s.supportsDub,
    types: s.types,
  }));
}

module.exports = {
  buildStreamUrl,
  getAllSources,
  getServerList,
  STREAMING_SERVERS,
};
