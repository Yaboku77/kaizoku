import * as cheerio from 'cheerio-without-node-native';
import { fetchJson } from '../fetcher';
import { scrapeAnimeEpisodes } from './anime.scraper';
import { Episode } from '../types';
import { extractStreamUrl, extractKiwiMapper, extractVidstream, extractMegaplay, extractMegacloud, SubtitleTrack } from '../extractors';
import { BASE_URL } from '../constants';

export interface VideoServer {
  id: string;    // linkId
  name: string;  // server name (e.g. Vidstreaming, MegaCloud)
  type: string;  // "sub" | "dub" | "softsub"
  svId?: string; // data-sv-id (server type identifier used by anikoto AJAX)
}

export interface VideoTrack extends SubtitleTrack {
  proxyUrl?: string;
}

export interface VideoSource {
  server: string;
  type: string; // "sub" | "dub" | "softsub"
  url: string; // The iframe/embed URL
  m3u8?: string | null; // Extracted m3u8 direct link
  referer?: string; // Required referer for the m3u8 stream
  proxyUrl?: string | null; // Not used locally — kept for type compatibility
  tracks?: VideoTrack[];
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
  allSources?: { file: string; label?: string }[];
}

export interface WatchData {
  episode: Episode;
  servers: VideoServer[];
  sources: VideoSource[];
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

export async function scrapeWatch(
  slug: string,
  epNum: string,
  onPartial?: (data: WatchData) => void,
  idMal?: number
): Promise<WatchData> {
  let ep: Episode | undefined;
  
  if (slug) {
    try {
      const { episodes } = await scrapeAnimeEpisodes(slug);
      ep = episodes.find((e) => e.number === epNum);
      if (!ep && !isNaN(Number(epNum)) && episodes.length >= Number(epNum)) {
        ep = episodes[Number(epNum) - 1];
      }
    } catch (e) {
      console.warn('Failed to scrape episodes from Anikoto:', e);
    }
  }

  if (!ep) {
    ep = {
      number: epNum,
      title: `Episode ${epNum}`,
      ...(idMal ? { dataMal: String(idMal) } : {}),
    };
  } else if (!ep.dataMal && idMal) {
    ep.dataMal = String(idMal);
  }

  if (!ep.dataIds && !ep.dataMal) {
    throw new Error(`Episode ${epNum} not found or has no data-ids/idMal for slug ${slug}`);
  }

  const sources: VideoSource[] = [];
  const servers: VideoServer[] = [];

  const firePartial = () => {
    if (onPartial) {
      onPartial({ episode: ep, servers: [...servers], sources: [...sources] });
    }
  };

  // ── Kiwi Mapper source (independent, runs alongside regular servers) ───────
  const kiwiTask = (async () => {
    if (!ep.dataMal || !ep.dataTimestamp) return;
    await Promise.all((['sub', 'dub'] as const).map(async (type) => {
      try {
        const extracted = await withTimeout(
          extractKiwiMapper(ep.dataMal!, ep.number, ep.dataTimestamp!, type, BASE_URL),
          SERVER_TIMEOUT_MS,
          `Kiwi Mapper (${type})`
        );
        if (extracted) {
          sources.push({
            server: 'Kiwi Stream',
            type,
            url: extracted.m3u8,
            m3u8: extracted.m3u8,
            referer: extracted.referer,
            proxyUrl: null, // not used locally
            tracks: extracted.tracks?.map(t => ({ ...t })) || [],
            intro: extracted.intro,
            outro: extracted.outro,
          });
          firePartial();
        }
      } catch (err) {
        console.error(`Skipping Kiwi Mapper (${type}):`, err instanceof Error ? err.message : err);
      }
    }));
  })();

  // START fetch the full server list via AJAX (slower)
  const backupTasks = (async () => {
    if (!ep!.dataIds) return;
    try {
      const listData = await fetchJson<{ status: boolean; result: string }>(
        `/ajax/server/list?servers=${ep!.dataIds}`
      );

      if (!listData?.status || !listData?.result) {
        console.error('Failed to fetch server list from AJAX');
        return;
      }

      const $ = cheerio.load(listData.result);

      $('.server, li').each((_, el) => {
        const $el = $(el);
        const linkId = $el.attr('data-link-id');
        if (!linkId) return;

        const $typeContainer = $el.closest('.type');
        const typeLabel = $typeContainer.find('label, .name').text().trim().toLowerCase();
        let serverName = $el.text().trim();
        if (serverName.toLowerCase().includes('megacloud')) {
          serverName = 'MegaPlay'; // User requested this exact name
        }
        const svId = $el.attr('data-sv-id') || '';

        servers.push({
          id: linkId,
          name: serverName,
          type: typeLabel || 'sub',
          svId,
        });
      });

      await Promise.all(
        servers.map(async (server) => {
          try {
            await withTimeout(
              (async () => {
                // Build AJAX URL — include sv (server type ID) when available
                const svParam = server.svId ? `&sv=${server.svId}` : '';
                const epReferer = `${BASE_URL}/watch/${slug}/ep-${epNum}`;
                const sourceData = await fetchJson<{ status: boolean; result: { url: string } }>(
                  `/ajax/server?get=${server.id}${svParam}`,
                  { Referer: epReferer }
                );
                if (sourceData.status && sourceData.result?.url) {
                  const embedUrl = sourceData.result.url;
                  const epRefererFull = `${BASE_URL}/watch/${slug}/ep-${epNum}`;
                  const serverNameLower = server.name.toLowerCase();

                  const isMegacloudEmbed = embedUrl.includes('megacloud');
                  const isMegaplayEmbed = embedUrl.includes('megaplay') || embedUrl.includes('vidwish') || embedUrl.includes('vidtube');
                  const isVidstream = serverNameLower.includes('vidstream') || serverNameLower.includes('vidplay') || serverNameLower.includes('vid-') || embedUrl.includes('vidstream') || embedUrl.includes('vidplay');

                  let uiServerName = server.name;

                  // Push with null m3u8 first so UI can show server list immediately
                  const sourceEntry: VideoSource = {
                    server: uiServerName,
                    type: server.type,
                    url: embedUrl,
                    m3u8: null,
                    referer: epRefererFull,
                    proxyUrl: null,
                    tracks: [],
                    intro: undefined,
                    outro: undefined,
                  };
                  sources.push(sourceEntry);
                  firePartial();

                  if (isMegaplayEmbed || isMegacloudEmbed || isVidstream) {
                    (async () => {
                      try {
                        let extracted = null;
                        if (isVidstream) {
                          extracted = await withTimeout(
                            extractVidstream(embedUrl, epRefererFull),
                            SERVER_TIMEOUT_MS,
                            `${server.name} vidstream extract`
                          ).catch(() => null);
                        } else if (isMegacloudEmbed) {
                          extracted = await withTimeout(
                            extractMegacloud(embedUrl),
                            SERVER_TIMEOUT_MS,
                            `${server.name} megacloud extract`
                          ).catch(() => null);
                        } else if (isMegaplayEmbed) {
                          extracted = await withTimeout(
                            extractMegaplay(embedUrl),
                            SERVER_TIMEOUT_MS,
                            `${server.name} megaplay extract`
                          ).catch(() => null);
                        }
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
                        console.error(`[watch.scraper] Eager extract failed for ${server.name}:`, err instanceof Error ? err.message : err);
                      }
                    })();
                  }
                }
              })(),
              SERVER_TIMEOUT_MS,
              server.name
            );
          } catch (err) {
            console.error(`Skipping server ${server.name} (${server.id}):`, err instanceof Error ? err.message : err);
          }
        })
      );
    } catch (err) {
      console.error('AJAX Backup tasks failed:', err instanceof Error ? err.message : err);
    }
  })();

  await Promise.all([kiwiTask, backupTasks]);

  return {
    episode: ep,
    servers,
    sources,
  };
}
