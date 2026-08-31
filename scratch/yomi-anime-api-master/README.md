# 🧠 Yomi Anime API

> Complete anime streaming API powered by [yomi.to](https://yomi.to). Get anime metadata, streaming sources, posters, episodes, and everything you need to build an anime streaming app.

## Features

- 🔍 **Search** anime by title (AniList + Jikan fallback)
- 📋 **Browse** with genre, format, status, season filters
- 🎬 **Streaming sources** from 5 servers (MegaPlay, MegaFlix, TryEmbed, CinexStream, NontonGo)
- 🖼️ **Posters & banners** for every anime
- 📅 **Airing schedule** and **seasonal** anime
- 🎭 **Characters, staff, relations, recommendations**
- 🚀 **Deploy to Vercel** in one click

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api` | API documentation (JSON or HTML) |
| `GET /api/anime?id={id}` | Full anime detail |
| `GET /api/anime/search?q={query}` | Search anime |
| `GET /api/anime/list` | Browse with filters |
| `GET /api/anime/trending` | Trending anime |
| `GET /api/anime/top` | Top-rated anime |
| `GET /api/anime/seasonal` | Seasonal anime |
| `GET /api/anime/schedule` | Airing schedule |
| `GET /api/watch?animeId={id}&ep={ep}` | **Streaming sources** |
| `GET /api/random` | Random anime |

## Quick Start

### Search for an anime

```bash
curl "https://your-domain.vercel.app/api/anime/search?q=demon+slayer"
```

Response:
```json
{
  "query": "demon slayer",
  "source": "anilist",
  "results": [
    {
      "id": 101922,
      "title": {
        "romaji": "Kimetsu no Yaiba",
        "english": "Demon Slayer: Kimetsu no Yaiba",
        "native": "鬼滅の刃"
      },
      "coverImage": {
        "large": "https://s4.anilist.co/file/..."
      },
      "genres": ["Action", "Fantasy"],
      "episodes": 26,
      "meanScore": 83,
      ...
    }
  ]
}
```

### Get anime detail

```bash
curl "https://your-domain.vercel.app/api/anime?id=101922"
```

Returns full anime info including characters, voice actors, staff, relations, recommendations, and streaming servers.

### Get streaming sources

```bash
curl "https://your-domain.vercel.app/api/watch?animeId=101922&ep=1"
```

Response:
```json
{
  "animeId": 101922,
  "episode": 1,
  "servers": [
    { "id": 1, "name": "MegaPlay", "supportsDub": true },
    { "id": 2, "name": "MegaFlix", "supportsDub": true },
    ...
  ],
  "sources": [
    {
      "server": 1,
      "serverName": "MegaPlay",
      "url": "https://megaplay.buzz/stream/ani/101922/1/sub",
      "type": "sub",
      "embedUrl": "https://megaplay.buzz/stream/ani/101922/1/sub"
    },
    ...
  ]
}
```

Use the `embedUrl` in an `<iframe>` to play the video.

## Browse / Filter

```bash
# Action anime, sorted by score
curl "/api/anime/list?genre=Action&sort=SCORE_DESC&limit=10"

# TV series only
curl "/api/anime/list?format=TV&limit=10"

# Currently airing
curl "/api/anime/list?status=RELEASING&sort=TRENDING_DESC"

# Spring 2025 season
curl "/api/anime/seasonal?season=SPRING&year=2025"
```

### Available Filters

| Filter | Values |
|--------|--------|
| `sort` | `TRENDING_DESC`, `POPULARITY_DESC`, `SCORE_DESC`, `START_DATE_DESC` |
| `genre` | `Action`, `Comedy`, `Fantasy`, `Romance`, `Sci-Fi`, `Slice of Life`, etc. |
| `format` | `TV`, `MOVIE`, `OVA`, `ONA` |
| `status` | `FINISHED`, `RELEASING`, `NOT_YET_RELEASED`, `CANCELLED`, `HIATUS` |
| `season` | `WINTER`, `SPRING`, `SUMMER`, `FALL` |

## Streaming Servers

| Server | Sub | Dub | Notes |
|--------|-----|-----|-------|
| MegaPlay (1) | ✅ | ✅ | Supports MAL IDs |
| MegaFlix (2) | ✅ | ✅ | Supports MAL IDs |
| TryEmbed (3) | ✅ | ✅ | AniList only |
| CinexStream (4) | ✅ | ✅ | AniList only |
| NontonGo (5) | ✅ | ❌ | AniList only |

### Dub support

Some servers support dub. Add `&dub=true` to get dub sources:

```bash
curl "/api/watch?animeId=101922&ep=1&dub=true"
```

### Specific server

Request a specific server:

```bash
curl "/api/watch?animeId=101922&ep=1&server=1&dub=false"
```

## Deployment to Vercel

### One-click deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/your-username/yomi-anime-api)

### Manual deploy

```bash
# Clone the repo
git clone https://github.com/your-username/yomi-anime-api
cd yomi-anime-api

# Install dependencies
npm install

# Run locally
npm run dev

# Deploy to production
npm run deploy
```

### Environment Variables

No environment variables required — the API uses public endpoints:

- **AniList GraphQL API** (public, ~90 req/min)
- **Jikan API** (public, fallback only)
- **Streaming embed URLs** (constructed from known patterns)

## Project Structure

```
├── api/
│   ├── index.js           # API docs + landing page
│   ├── anime.js           # GET /api/anime?id=...
│   ├── random.js          # GET /api/random
│   ├── watch.js           # GET /api/watch?animeId=...&ep=...
│   ├── anime/
│   │   ├── search.js      # GET /api/anime/search?q=...
│   │   ├── list.js        # GET /api/anime/list?genre=...
│   │   ├── trending.js    # GET /api/anime/trending
│   │   ├── top.js         # GET /api/anime/top
│   │   ├── seasonal.js    # GET /api/anime/seasonal
│   │   └── schedule.js    # GET /api/anime/schedule
│   └── lib/
│       ├── anilist.js     # AniList GraphQL client
│       ├── jikan.js       # Jikan (MAL) fallback client
│       ├── streams.js     # Streaming URL builder
│       └── utils.js       # Shared utilities
├── vercel.json            # Vercel deployment config
├── package.json           # Dependencies
├── test.js                # Test script
└── README.md              # This file
```

## Use in Your App

### JavaScript / React

```javascript
// Search
const res = await fetch("https://yomi-api.vercel.app/api/anime/search?q=naruto");
const { results } = await res.json();

// Get streaming for first result
const watch = await fetch(
  `https://yomi-api.vercel.app/api/watch?animeId=${results[0].id}&ep=1`
);
const { sources } = await watch.json();

// Play in iframe
const player = document.getElementById("player");
player.src = sources[0].embedUrl;
```

### Python

```python
import requests

# Search
r = requests.get("https://yomi-api.vercel.app/api/anime/search?q=naruto")
anime = r.json()["results"][0]

# Get streaming sources
r = requests.get(f"https://yomi-api.vercel.app/api/watch?animeId={anime['id']}&ep=1")
sources = r.json()["sources"]
print(sources[0]["embedUrl"])
```

## License

MIT
