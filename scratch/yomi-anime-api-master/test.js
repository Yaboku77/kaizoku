/**
 * Quick test script — run with `node test.js` (requires the dev server running on port 3000)
 */

const BASE = process.env.API_URL || "http://localhost:3000";

const tests = [
  { name: "Index/Docs", url: "/api", check: (d) => d.name === "Yomi Anime API" },
  { name: "Search", url: "/api/search?q=naruto&limit=3", check: (d) => d.results?.length > 0 },
  { name: "Anime Detail", url: "/api/detail?id=21", check: (d) => d.id === 21 && d.title?.romaji },
  { name: "Anime List", url: "/api/list?genre=Action&limit=3", check: (d) => d.results?.length > 0 },
  { name: "Trending", url: "/api/trending?limit=3", check: (d) => d.results?.length > 0 },
  { name: "Top", url: "/api/top?limit=3", check: (d) => d.results?.length > 0 },
  { name: "Seasonal", url: "/api/seasonal?limit=3", check: (d) => d.results?.length > 0 },
  { name: "Schedule", url: "/api/schedule", check: (d) => Array.isArray(d.results) },
  { name: "Watch", url: "/api/watch?animeId=21&ep=1", check: (d) => d.sources?.length > 0 },
  { name: "Random", url: "/api/random", check: (d) => d.id > 0 },
];

async function run() {
  console.log(`\n🧪 Testing API endpoints at ${BASE}\n`);

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      const res = await fetch(`${BASE}${test.url}`);
      const data = await res.json();

      if (res.ok && test.check(data)) {
        console.log(`  ✅ ${test.name}`);
        passed++;
      } else {
        console.log(`  ❌ ${test.name} — check failed or HTTP ${res.status}`);
        console.log(`     ${JSON.stringify(data).slice(0, 200)}`);
        failed++;
      }
    } catch (err) {
      console.log(`  ❌ ${test.name} — ${err.message}`);
      failed++;
    }

    // Rate limit courtesy
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
