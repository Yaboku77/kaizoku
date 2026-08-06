const { scrapeSearch } = require('./src/api/scrapers/search.scraper');

async function test() {
  const data = await scrapeSearch("Attack on Titan");
  console.log(JSON.stringify(data, null, 2));
}

test();
