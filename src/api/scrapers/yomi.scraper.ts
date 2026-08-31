import { VideoServer, VideoSource, WatchData } from './watch.scraper';
import { extractMegaplay, extractStreamUrl } from '../extractors';

const STREAMING_SERVERS = [
  {
    id: '1',
    name: 'MegaPlay',
    baseUrl: 'https://megaplay.buzz',
    supportsMal: true,
    supportsDub: true,
    types: ['sub', 'dub'],
  },
  {
    id: '2',
    name: 'MegaFlix',
    baseUrl: 'https://www.megaflix.buzz',
    supportsMal: true,
    supportsDub: true,
    types: ['sub', 'dub'],
  },
  {
    id: '3',
    name: 'TryEmbed',
    baseUrl: 'https://tryembed.us.cc',
    supportsMal: false,
    supportsDub: true,
    types: ['sub', 'dub'],
  },
  {
    id: '4',
    name: 'CinexStream',
    baseUrl: 'https://cinextream.cc',
    supportsMal: false,
    supportsDub: true,
    types: ['sub', 'dub'],
  },
  {
    id: '5',
    name: 'NontonGo',
    baseUrl: 'https://nontongo.win',
    supportsMal: false,
    supportsDub: false,
    types: ['sub'],
  },
];

function buildStreamUrl(animeId: string, malId: string | null | undefined, episode: string, serverId: number, dub: boolean): string {
  const lang = dub ? 'dub' : 'sub';

  switch (serverId) {
    case 1:
      if (malId) return `${STREAMING_SERVERS[0].baseUrl}/stream/mal/${malId}/${episode}/${lang}`;
      return `${STREAMING_SERVERS[0].baseUrl}/stream/ani/${animeId}/${episode}/${lang}`;
    case 2:
      if (malId) return `${STREAMING_SERVERS[1].baseUrl}/stream/mal/${malId}/${episode}/${lang}`;
      return `${STREAMING_SERVERS[1].baseUrl}/stream/ani/${animeId}/${episode}/${lang}`;
    case 3:
      return `${STREAMING_SERVERS[2].baseUrl}/embed/anime/${animeId}/${episode}/${lang}`;
    case 4:
      return `${STREAMING_SERVERS[3].baseUrl}/api/embed/anime/${lang}/${animeId}/${episode}?color=7c6ee0`;
    case 5:
      return `${STREAMING_SERVERS[4].baseUrl}/anime/${animeId}/${episode}/play`;
    default:
      return '';
  }
}

/** Cap individual server fetch+extraction so a single slow server can't block everything. */
const SERVER_TIMEOUT_MS = 15000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${ms}ms (${label})`)), ms)
    ),
  ]);
}

export async function scrapeYomiWatch(
  animeId: string,
  epNum: string,
  onPartial?: (data: WatchData) => void,
  idMal?: number
): Promise<WatchData> {
  const sources: VideoSource[] = [];
  const servers: VideoServer[] = [];

  // Yomi doesn't need to fetch episode metadata like Anikoto, 
  // we just need an episode object for WatchData compatibility.
  const ep = {
    number: epNum,
    title: `Episode ${epNum}`,
    dataMal: idMal ? String(idMal) : undefined,
    dataIds: '', // Not needed for Yomi
  };

  const firePartial = () => {
    if (onPartial) {
      onPartial({ episode: ep, servers: [...servers], sources: [...sources] });
    }
  };

  for (const s of STREAMING_SERVERS) {
    servers.push({
      id: s.id,
      name: s.name,
      type: 'sub',
    });
    if (s.supportsDub) {
      servers.push({
        id: `${s.id}_dub`,
        name: s.name,
        type: 'dub',
      });
    }
  }

  // Push all sub and dub sources with their embed URLs initially
  for (const s of STREAMING_SERVERS) {
    const subUrl = buildStreamUrl(animeId, idMal ? String(idMal) : null, epNum, parseInt(s.id), false);
    if (subUrl) {
      sources.push({
        server: s.name,
        type: 'sub',
        url: subUrl,
        m3u8: null,
        referer: subUrl,
      });
    }

    if (s.supportsDub) {
      const dubUrl = buildStreamUrl(animeId, idMal ? String(idMal) : null, epNum, parseInt(s.id), true);
      if (dubUrl) {
        sources.push({
          server: s.name,
          type: 'dub',
          url: dubUrl,
          m3u8: null,
          referer: dubUrl,
        });
      }
    }
  }

  // Fire initial partial so UI can show servers immediately
  firePartial();

  // Eagerly extract m3u8 for MegaPlay and MegaFlix to speed up playback start
  const eagerTasks = sources
    .filter(source => source.server === 'MegaPlay' || source.server === 'MegaFlix')
    .map(async (sourceEntry) => {
      try {
        const extracted = await withTimeout(
          extractMegaplay(sourceEntry.url),
          SERVER_TIMEOUT_MS,
          `${sourceEntry.server} (${sourceEntry.type}) extract`
        ).catch(() => null);

        if (extracted) {
          sourceEntry.m3u8 = extracted.m3u8;
          if (extracted.referer) sourceEntry.referer = extracted.referer;
          if (extracted.tracks?.length) sourceEntry.tracks = extracted.tracks;
          if (extracted.intro) sourceEntry.intro = extracted.intro;
          if (extracted.outro) sourceEntry.outro = extracted.outro;
          if (extracted.allSources?.length) sourceEntry.allSources = extracted.allSources;
          firePartial();
        }
      } catch (err) {
        console.error(`[yomi.scraper] Eager extract failed for ${sourceEntry.server}:`, err instanceof Error ? err.message : err);
      }
    });

  // Also eager extract TryEmbed, CinexStream, NontonGo using extractStreamUrl
  const fallbackEagerTasks = sources
    .filter(source => !['MegaPlay', 'MegaFlix'].includes(source.server))
    .map(async (sourceEntry) => {
      try {
        const extracted = await withTimeout(
          extractStreamUrl(sourceEntry.url),
          SERVER_TIMEOUT_MS,
          `${sourceEntry.server} (${sourceEntry.type}) extract fallback`
        ).catch(() => null);

        if (extracted) {
          sourceEntry.m3u8 = extracted.m3u8;
          if (extracted.referer) sourceEntry.referer = extracted.referer;
          if (extracted.tracks?.length) sourceEntry.tracks = extracted.tracks;
          if (extracted.intro) sourceEntry.intro = extracted.intro;
          if (extracted.outro) sourceEntry.outro = extracted.outro;
          if (extracted.allSources?.length) sourceEntry.allSources = extracted.allSources;
          firePartial();
        }
      } catch (err) {
        // ignore
      }
    });

  // We await all eager extractions before returning final WatchData.
  // The UI will still get the streams immediately via onPartial and can play them if user clicks
  await Promise.all([...eagerTasks, ...fallbackEagerTasks]);

  return {
    episode: ep,
    servers,
    sources,
  };
}
