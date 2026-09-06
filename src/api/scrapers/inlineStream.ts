/**
 * inlineStream.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Lightweight single-stream fetcher for home-screen inline video previews.
 *
 * Goal  : fetch ONE m3u8 as fast as possible with MINIMUM network calls.
 *
 * Strategy:
 *   Concurrently race all 5 Yomi servers (MegaFlix, MegaPlay, TryEmbed, etc).
 *   Promise.any() resolves the moment the first one succeeds.
 *   This ensures we get the fastest stream without waiting for all to finish,
 *   while maintaining fallbacks if a primary server is down (e.g. 410 error).
 */
import { extractMegaplay, extractStreamUrl } from '../extractors';

const INLINE_TIMEOUT_MS = 12000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export async function fetchInlineStream(
  animeId: string | number,
  epNum: string | number
): Promise<string> {
  const id = String(animeId);
  const ep = String(epNum);

  // VidStreaming 2 = MegaFlix (preferred)
  const megaflixUrl = `https://www.megaflix.buzz/stream/ani/${id}/${ep}/sub`;
  const megaplayUrl = `https://megaplay.buzz/stream/ani/${id}/${ep}/sub`;
  const tryembedUrl = `https://tryembed.us.cc/embed/anime/${id}/${ep}/sub`;
  const cinexUrl = `https://cinextream.cc/api/embed/anime/sub/${id}/${ep}?color=7c6ee0`;
  const nontongoUrl = `https://nontongo.win/anime/${id}/${ep}/play`;

  const tryMega = async (url: string): Promise<string> => {
    const result = await withTimeout(extractMegaplay(url), INLINE_TIMEOUT_MS);
    if (result?.m3u8) return result.m3u8;
    throw new Error(`No m3u8 returned from ${url}`);
  };

  const tryOther = async (url: string): Promise<string> => {
    const result = await withTimeout(extractStreamUrl(url), INLINE_TIMEOUT_MS);
    if (result?.m3u8) return result.m3u8;
    throw new Error(`No m3u8 returned from ${url}`);
  };

  // Promise.any: resolves on FIRST success, rejects only if ALL fail.
  return new Promise<string>((resolve, reject) => {
    let rejectedCount = 0;
    const errors: unknown[] = [];

    const tasks = [
      tryMega(megaflixUrl),
      tryMega(megaplayUrl),
      tryOther(tryembedUrl),
      tryOther(cinexUrl),
      tryOther(nontongoUrl)
    ];

    tasks.forEach((task, i) => {
      task.then(resolve).catch(err => {
        errors[i] = err;
        rejectedCount++;
        if (rejectedCount === tasks.length) {
          reject(new AggregateError(errors, 'All inline stream servers failed'));
        }
      });
    });
  });
}
