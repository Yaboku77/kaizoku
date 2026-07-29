import * as cheerio from 'cheerio-without-node-native';
import { fetchJson } from '../fetcher';
import { scrapeAnimeEpisodes } from './anime.scraper';
import { Episode } from '../types';
import { extractStreamUrl, extractKiwiMapper, extractVidstream, SubtitleTrack } from '../extractors';
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

export async function scrapeWatch(slug: string, epNum: string): Promise<WatchData> {
  const { episodes } = await scrapeAnimeEpisodes(slug);
  const ep = episodes.find((e) => e.number === epNum);

  if (!ep || !ep.dataIds) {
    throw new Error(`Episode ${epNum} not found or has no data-ids for slug ${slug}`);
  }

  // 1. Fetch server list
  const listData = await fetchJson<{ status: boolean; result: string }>(
    `/ajax/server/list?servers=${ep.dataIds}`
  );

  if (!listData.status || !listData.result) {
    throw new Error('Failed to fetch server list from AJAX');
  }

  const $ = cheerio.load(listData.result);
  const servers: VideoServer[] = [];

  $('.server, li').each((_, el) => {
    const $el = $(el);
    const linkId = $el.attr('data-link-id');
    if (!linkId) return;

    const $typeContainer = $el.closest('.type');
    const typeLabel = $typeContainer.find('label, .name').text().trim().toLowerCase();
    const serverName = $el.text().trim();
    const svId = $el.attr('data-sv-id') || '';

    servers.push({
      id: linkId,
      name: serverName,
      type: typeLabel || 'sub',
      svId,
    });
  });

  // 2. Fetch embed URL + extract m3u8 for all servers in parallel.
  //    Each server is individually capped at SERVER_TIMEOUT_MS so a single
  //    slow/unreachable server cannot stall the entire response.
  //    Since scraping runs locally on-device, we use the direct m3u8 URL —
  //    no proxy server is needed.
  const sources: VideoSource[] = [];

  // ── Kiwi Mapper source (independent, runs alongside regular servers) ───────
  const kiwiTask = (async () => {
    if (!ep.dataMal || !ep.dataTimestamp) return;
    for (const type of ['sub', 'dub'] as const) {
      try {
        const extracted = await withTimeout(
          extractKiwiMapper(ep.dataMal, ep.number, ep.dataTimestamp, type, BASE_URL),
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
          });
        }
      } catch (err) {
        console.error(`Skipping Kiwi Mapper (${type}):`, err instanceof Error ? err.message : err);
      }
    }
  })();

  await Promise.all([
    kiwiTask,
    ...servers.map(async (server) => {
      try {
        await withTimeout(
          (async () => {
            // Build AJAX URL — include sv (server type ID) when available, as some
            // servers (e.g. VidPlay) require it to avoid a 400 response.
            const svParam = server.svId ? `&sv=${server.svId}` : '';
            const epReferer = `${BASE_URL}/watch/${slug}/ep-${epNum}`;
            const sourceData = await fetchJson<{ status: boolean; result: { url: string } }>(
              `/ajax/server?get=${server.id}${svParam}`,
              { Referer: epReferer }
            );
            if (sourceData.status && sourceData.result?.url) {
              const embedUrl = sourceData.result.url;
              const epRefererFull = `${BASE_URL}/watch/${slug}/ep-${epNum}`;

              // ── VidStream path: try save_data.php first ──────────────────
              // Detects servers that use domain2_url + save_data.php pattern.
              // Falls back to the standard extractStreamUrl if this fails.
              const serverNameLower = server.name.toLowerCase();
              const isVidstreamLike =
                serverNameLower.includes('vidstream') ||
                serverNameLower.includes('vidplay') ||
                serverNameLower.includes('vid-');

              let extracted = isVidstreamLike
                ? await extractVidstream(embedUrl, epRefererFull).catch(() => null)
                : null;

              // Fall back to standard extraction if VidStream path didn't work
              if (!extracted) {
                extracted = await extractStreamUrl(embedUrl);
              }

              sources.push({
                server: server.name,
                type: server.type,
                url: embedUrl,
                m3u8: extracted?.m3u8 ?? null,
                referer: extracted?.referer,
                proxyUrl: null, // not used locally
                tracks: extracted?.tracks?.map(t => ({ ...t })) || [],
              });
            }
          })(),
          SERVER_TIMEOUT_MS,
          server.name
        );
      } catch (err) {
        console.error(`Skipping server ${server.name} (${server.id}):`, err instanceof Error ? err.message : err);
      }
    })
  ]);

  return {
    episode: ep,
    servers,
    sources,
  };
}
