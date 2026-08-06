import { scrapeWatch } from './src/api/scrapers/watch.scraper';
import { fetchPage } from './src/api/fetcher';

async function main() {
  try {
    const data = await scrapeWatch("attack-on-titan-112", "3136");
    console.log(JSON.stringify(data.sources, null, 2));
  } catch (err) {
    console.error(err);
  }
}
main();
