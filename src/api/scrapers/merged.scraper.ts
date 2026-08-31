import { scrapeWatch, WatchData } from './watch.scraper';
import { scrapeYomiWatch } from './yomi.scraper';

export async function scrapeMergedWatch(
  animeId: string,
  slug: string,
  epNum: string,
  onPartial?: (data: WatchData) => void,
  idMal?: number
): Promise<WatchData> {
  const cumulativeData: WatchData = { episode: undefined as any, servers: [], sources: [] };

  const handlePartial = (data: WatchData) => {
    if (!data) return;

    if (data.episode && !cumulativeData.episode) cumulativeData.episode = data.episode;

    if (data.servers) {
      data.servers.forEach(s => {
        if (!cumulativeData.servers.find(cs => cs.id === s.id && cs.name === s.name)) {
          cumulativeData.servers.push(s);
        }
      });
    }

    if (data.sources) {
      data.sources.forEach(s => {
        const existing = cumulativeData.sources.find(cs => cs.server === s.server && cs.type === s.type);
        if (existing) {
          if (s.m3u8 && !existing.m3u8) {
            existing.m3u8 = s.m3u8;
            existing.referer = s.referer;
            existing.tracks = s.tracks;
            existing.intro = s.intro;
            existing.outro = s.outro;
            existing.allSources = s.allSources;
          }
        } else {
          cumulativeData.sources.push(s);
        }
      });
    }

    if (onPartial) {
      // Create a fresh copy to trigger React re-renders
      onPartial({
        episode: cumulativeData.episode,
        servers: [...cumulativeData.servers],
        sources: [...cumulativeData.sources],
      });
    }
  };

  // Run both scrapers concurrently.
  // Yomi API is fast and will populate MegaPlay/MegaFlix etc quickly (making it default).
  // Anikoto (scrapeWatch) will run as a fallback/additional source.
  const yomiPromise = scrapeYomiWatch(animeId, epNum, handlePartial, idMal).catch(e => {
    console.error('Yomi scraper failed:', e);
    return null;
  });
  
  const anikotoPromise = scrapeWatch(slug, epNum, handlePartial, idMal).catch(e => {
    console.error('Anikoto scraper failed:', e);
    return null;
  });

  await Promise.all([yomiPromise, anikotoPromise]);

  return cumulativeData;
}
