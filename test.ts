import { scrapeYomiWatch } from './src/api/scrapers/yomi.scraper';

async function test() {
  console.log('Testing scrapeYomiWatch...');
  // 1 is One Piece, 1 is Episode 1
  const data = await scrapeYomiWatch('one-piece', '1', (partial) => {
    console.log('Partial received:', partial.sources.filter(s => s.m3u8));
  }, 21);
  console.log('Final data:', JSON.stringify(data.sources.filter(s => s.m3u8), null, 2));
}

test();
