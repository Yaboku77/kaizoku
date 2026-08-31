/**
 * Local dev server that mimics Vercel serverless function invocation.
 * Uses the same catch-all route as production: api/[...slug].js
 *
 * Run with: node dev.js
 */

const http = require("http");
const path = require("path");
const url = require("url");

const PORT = 3000;
const CATCH_ALL_PATH = path.join(__dirname, "api", "[...slug].js");
const INDEX_PATH = path.join(__dirname, "api", "index.js");

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(200, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    return res.end();
  }

  // Only route /api/* through the handler
  if (!pathname.startsWith("/api")) {
    res.writeHead(404, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: true, message: `Not found: ${pathname}` }));
  }

  try {
    // Clear require cache so changes are picked up on reload
    Object.keys(require.cache).forEach((key) => {
      if (key.includes("/api/")) delete require.cache[key];
    });

    // Route /api exactly to index.js, everything else to catch-all
    const handlerPath = pathname === "/api" ? INDEX_PATH : CATCH_ALL_PATH;
    const handler = require(handlerPath);

    const mockReq = {
      method: req.method,
      url: req.url,
      headers: req.headers,
    };

    const body = [];
    req.on("data", (chunk) => body.push(chunk));
    req.on("end", async () => {
      if (body.length) mockReq.body = JSON.parse(Buffer.concat(body).toString());

      const chunks = [];
      const mockRes = {
        _status: 200,
        _headers: {},
        status(s) {
          this._status = s;
          return this;
        },
        setHeader(k, v) {
          this._headers[k] = v;
          return this;
        },
        json(data) {
          res.writeHead(this._status, {
            ...this._headers,
            "Content-Type": "application/json",
          });
          res.end(JSON.stringify(data, null, 2));
        },
        send(data) {
          const ct = this._headers["Content-Type"] || "text/html";
          res.writeHead(this._status, { ...this._headers, "Content-Type": ct });
          res.end(data);
        },
        end(data) {
          res.writeHead(this._status, this._headers);
          res.end(data);
        },
      };

      try {
        await handler(mockReq, mockRes);
      } catch (err) {
        console.error(`[ERROR] ${pathname}:`, err.message);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: true, message: err.message }));
      }
    });
  } catch (err) {
    console.error(`[IMPORT ERROR] ${pathname}:`, err.message);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: true, message: `Failed to load handler: ${err.message}` }));
  }
});

server.listen(PORT, () => {
  console.log(`\n🧠 Yomi Anime API — Local Dev Server`);
  console.log(`   http://localhost:${PORT}/api`);
  console.log(`\n   Endpoints:`);
  console.log(`   http://localhost:${PORT}/api`);
  console.log(`   http://localhost:${PORT}/api/detail?id=21`);
  console.log(`   http://localhost:${PORT}/api/search?q=naruto`);
  console.log(`   http://localhost:${PORT}/api/list`);
  console.log(`   http://localhost:${PORT}/api/trending`);
  console.log(`   http://localhost:${PORT}/api/top`);
  console.log(`   http://localhost:${PORT}/api/seasonal`);
  console.log(`   http://localhost:${PORT}/api/schedule`);
  console.log(`   http://localhost:${PORT}/api/watch?animeId=21&ep=1`);
  console.log(`   http://localhost:${PORT}/api/random`);
  console.log(`\n   Press Ctrl+C to stop\n`);
});
