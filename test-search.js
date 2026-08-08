const { scrapeSearch } = require('./src/api/scrapers/search.scraper');

async function test() {
  const data = await scrapeSearch('Jujutsu Kaisen');
  console.log(JSON.stringify(data.results.map(r => ({ title: r.title, titleJp: r.titleJp, slug: r.slug })), null, 2));
}

test().catch(console.error);
