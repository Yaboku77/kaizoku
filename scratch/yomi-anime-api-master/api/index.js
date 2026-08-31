/**
 * GET /api — API documentation landing page.
 * Separate file because [...slug] doesn't match /api (no slug segments).
 */

const { json, error, getQueryParams } = require("./lib/utils");

const DOCS = {
  name: "Yomi Anime API",
  version: "1.0.0",
  description: "Complete anime streaming API powered by yomi.to",
  baseUrl: "/api",
  endpoints: {
    "GET /api": "This documentation page",
    "GET /api/detail?id=21": "Full anime detail with characters, staff, relations, streaming info",
    "GET /api/search?q=naruto": "Search anime by title",
    "GET /api/list?genre=Action&sort=SCORE_DESC": "Browse anime with filters",
    "GET /api/trending": "Currently trending anime",
    "GET /api/top": "Top-rated anime",
    "GET /api/seasonal?season=SPRING&year=2025": "Seasonal anime",
    "GET /api/schedule?date=2025-04-15": "Airing schedule",
    "GET /api/watch?animeId=21&ep=1": "Streaming sources for episode",
    "GET /api/random": "Random anime",
  },
  streamingServers: [
    { id: 1, name: "MegaPlay", supportsDub: true },
    { id: 2, name: "MegaFlix", supportsDub: true },
    { id: 3, name: "TryEmbed", supportsDub: true },
    { id: 4, name: "CinexStream", supportsDub: true },
    { id: 5, name: "NontonGo", supportsDub: false },
  ],
};

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(200).json({ ok: true });
  }

  const accept = req.headers.accept || "";
  if (accept.includes("text/html")) {
    res.setHeader("Content-Type", "text/html");
    return res.status(200).send(HTML_DOCS);
  }

  return json(res, DOCS);
};

const HTML_DOCS = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Yomi Anime API</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0f; color: #e0e0e0; line-height: 1.6; }
    .container { max-width: 900px; margin: 0 auto; padding: 2rem; }
    h1 { color: #00b4d8; font-size: 2rem; margin-bottom: 0.5rem; }
    h2 { color: #00b4d8; font-size: 1.3rem; margin-top: 2rem; margin-bottom: 0.8rem; border-bottom: 1px solid #222; padding-bottom: 0.5rem; }
    .subtitle { color: #888; margin-bottom: 2rem; }
    .endpoint { background: #12121a; border: 1px solid #222; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; }
    .method { color: #4ade80; font-weight: bold; font-family: monospace; }
    .path { color: #fff; font-family: monospace; font-size: 0.95rem; }
    .desc { color: #aaa; font-size: 0.9rem; margin-top: 0.3rem; }
    a { color: #00b4d8; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .example { background: #1a1a2e; border-left: 3px solid #00b4d8; padding: 0.5rem 1rem; margin-top: 0.5rem; font-family: monospace; font-size: 0.85rem; }
    .badge { display: inline-block; background: #00b4d8; color: #000; padding: 0.1rem 0.5rem; border-radius: 12px; font-size: 0.7rem; font-weight: bold; margin-right: 0.5rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>\u{1F441}\uFE0F Yomi Anime API</h1>
    <p class="subtitle">Complete anime streaming API powered by <a href="https://yomi.to">yomi.to</a></p>
    <h2>Endpoints</h2>
    <div class="endpoint">
      <span class="method">GET</span> <span class="path"><a href="/api/detail?id=21">/api/detail?id={id}</a></span>
      <p class="desc">Full anime detail \u2014 characters, staff, relations, streaming info, recommendations</p>
    </div>
    <div class="endpoint">
      <span class="method">GET</span> <span class="path"><a href="/api/search?q=naruto">/api/search?q={query}</a></span>
      <p class="desc">Search anime by title (AniList + Jikan fallback)</p>
    </div>
    <div class="endpoint">
      <span class="method">GET</span> <span class="path"><a href="/api/list?genre=Action&sort=SCORE_DESC">/api/list</a></span>
      <p class="desc">Browse anime with filters \u2014 genre, format, status, sort, season</p>
    </div>
    <div class="endpoint">
      <span class="method">GET</span> <span class="path"><a href="/api/trending">/api/trending</a></span>
      <p class="desc">Currently trending anime</p>
    </div>
    <div class="endpoint">
      <span class="method">GET</span> <span class="path"><a href="/api/top">/api/top</a></span>
      <p class="desc">Top-rated anime</p>
    </div>
    <div class="endpoint">
      <span class="method">GET</span> <span class="path"><a href="/api/seasonal?season=SPRING&year=2025">/api/seasonal</a></span>
      <p class="desc">Seasonal anime by season and year</p>
    </div>
    <div class="endpoint">
      <span class="method">GET</span> <span class="path"><a href="/api/schedule">/api/schedule</a></span>
      <p class="desc">Airing schedule for a specific date</p>
    </div>
    <div class="endpoint">
      <span class="method">GET</span> <span class="path"><a href="/api/watch?animeId=21&ep=1">/api/watch?animeId={id}&ep={ep}</a></span>
      <p class="desc"><span class="badge">CORE</span>Streaming sources for a specific episode \u2014 all servers + embed URLs</p>
    </div>
    <div class="endpoint">
      <span class="method">GET</span> <span class="path"><a href="/api/random">/api/random</a></span>
      <p class="desc">Get a random anime</p>
    </div>
    <p style="margin-top:2rem; color:#666; font-size:0.8rem;">
      Powered by <a href="https://anilist.co">AniList</a> + <a href="https://yomi.to">Yomi.to</a> | No CORS restrictions | 5-min cache
    </p>
  </div>
</body>
</html>`;
