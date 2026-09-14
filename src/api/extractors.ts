import axios from 'axios';
import { Buffer } from 'buffer';
import CryptoJS from 'crypto-js';

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
};



function decryptMegaplayEnc(enc: string): string | null {
  try {
    const E = 'i?LMTAx0Q6,:}50U' + '\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0';
    const C = "W0;27ToaUpl_P%'c";

    let b64 = enc.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';

    const key = CryptoJS.enc.Utf8.parse(E);
    const iv = CryptoJS.enc.Utf8.parse(C);

    const decrypted = CryptoJS.AES.decrypt(b64, key, {
      iv: iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    });

    const decryptedStr = decrypted.toString(CryptoJS.enc.Utf8);
    const parsed = JSON.parse(decryptedStr);
    return parsed.file || parsed[0]?.file || null;
  } catch (err) {
    console.warn('[Megaplay] Decryption failed:', err);
    return null;
  }
}

const KIWI_MAPPER_URLS = [
  'https://mapper.nekostream.site/api/mal',
  'https://mapper.mewcdn.online/api/mal',
];

async function parseM3u8Subtitles(
  m3u8Url: string,
  referer: string
): Promise<{ file: string; label?: string; kind?: string; default?: boolean }[]> {
  try {
    const { data } = await axios.get<string>(m3u8Url, {
      headers: { ...DEFAULT_HEADERS, Referer: referer },
      timeout: 15000,
    });
    const tracks: { file: string; label?: string; kind?: string; default?: boolean }[] = [];
    for (const line of data.split('\n')) {
      if (!line.startsWith('#EXT-X-MEDIA') || !line.includes('TYPE=SUBTITLES')) continue;
      const uri = line.match(/URI="([^"]+)"/)?.[1];
      if (!uri) continue;
      const label = line.match(/NAME="([^"]+)"/)?.[1];
      const isDefault = /DEFAULT=YES/i.test(line);
      const fullUri = uri.startsWith('http') ? uri : new URL(uri, m3u8Url).toString();
      tracks.push({ file: fullUri, label: label || 'Unknown', kind: 'subtitles', default: isDefault });
    }
    return tracks;
  } catch {
    return [];
  }
}

export interface SubtitleTrack {
  file: string;
  label?: string;
  kind?: string;
  default?: boolean;
}

export interface SkipTime {
  start: number;
  end: number;
}

export interface QualitySource {
  file: string;
  label?: string;
}

export interface ExtractedStream {
  m3u8: string;
  referer: string;
  tracks: SubtitleTrack[];
  intro?: SkipTime;
  outro?: SkipTime;
  allSources?: QualitySource[];
}

let _keysCache: Record<string, string> | null = null;
let _keysCacheAt = 0;
const KEYS_CACHE_MS = 15 * 60 * 1000;

async function getMegacloudKeys(): Promise<Record<string, string>> {
  const now = Date.now();
  if (_keysCache && now - _keysCacheAt < KEYS_CACHE_MS) return _keysCache;
  const { data } = await axios.get<Record<string, string>>(
    'https://raw.githubusercontent.com/yogesh-hacker/MegacloudKeys/refs/heads/main/keys.json',
    { timeout: 5000 }
  );
  _keysCache = data;
  _keysCacheAt = now;
  return data;
}

async function _doMegaplay(
  host: string,
  html: string,
  referer: string,
  sParam?: string | null,
  embedUrl?: string,
  mediaType?: string
): Promise<ExtractedStream | null> {
  const match = html.match(/<title>File ([0-9]+)/);
  if (!match) return null;

  const id = match[1];
  const sQs = sParam ? `&s=${encodeURIComponent(sParam)}` : '';

  const htmlTypeMatch = html.match(/type:\s*['"]([a-zA-Z0-9_-]+)['"]/i) ||
                        html.match(/data-type=['"]([a-zA-Z0-9_-]+)['"]/i);
  const urlTypeMatch = (embedUrl || '').match(/\/(sub|dub|hsub|raw)(?:[?#]|$)/i);
  const resolvedType = htmlTypeMatch?.[1] || mediaType || urlTypeMatch?.[1];
  const typeQs = resolvedType ? `&type=${encodeURIComponent(resolvedType)}` : '';

  const reqReferer = embedUrl || referer;
  const { data } = await axios.get(`https://${host}/stream/getSources?id=${id}${sQs}${typeQs}`, {
    headers: { ...DEFAULT_HEADERS, 'X-Requested-With': 'XMLHttpRequest', Referer: reqReferer },
    timeout: 5000,
  });

  const rawSources: any[] = Array.isArray(data?.sources) ? data.sources : (data?.sources?.file ? [{ file: data.sources.file }] : []);
  const allSources: QualitySource[] = rawSources.map(s => ({
    file: s.file || s.url || '',
    label: s.label || s.quality || '',
  })).filter(s => s.file);

  let m3u8: string | undefined = data?.sources?.file;
  if (!m3u8 && data?.enc) {
    m3u8 = decryptMegaplayEnc(data.enc) || undefined;
  }
  if (!m3u8) {
    const autoSource = allSources.find(s => s.label?.toLowerCase() === 'auto' || s.label?.toLowerCase() === 'default');
    m3u8 = autoSource?.file || allSources[0]?.file;
  }
  const tracks: SubtitleTrack[] = data?.tracks || [];
  const intro = data?.intro;
  const outro = data?.outro;

  if (!m3u8) return null;

  if (m3u8.includes('//cdn.imgnex.top')) {
    m3u8 = m3u8.replace('//cdn.imgnex.top', '//ncdn.imgnex.top');
    } else if (m3u8.includes('mewstream.buzz')) {
      let replacementHost = '1oe.lostproject.club';
      const firstTrack = tracks.find(t => t.file && !t.file.includes('mewstream.buzz'));
      if (firstTrack) {
        try {
          replacementHost = new URL(firstTrack.file).host;
        } catch (_) { }
      }
      try {
        const parsedM3u8 = new URL(m3u8);
        parsedM3u8.host = replacementHost;
        m3u8 = parsedM3u8.toString();
      } catch (_) { }

      if (allSources) {
        allSources.forEach(source => {
          if (source.file && source.file.includes('mewstream.buzz')) {
            try {
              const parsedSource = new URL(source.file);
              parsedSource.host = replacementHost;
              source.file = parsedSource.toString();
            } catch (_) { }
          }
        });
      }
    }

  return m3u8 ? { m3u8, referer, tracks, intro, outro, allSources } : null;
}

async function _doMegacloud(
  embedUrl: string,
  html: string,
  referer: string
): Promise<ExtractedStream | null> {
  const origin = new URL(embedUrl).origin;

  const match1 = html.match(/\b[a-zA-Z0-9]{48}\b/);
  const match2 = html.match(/\b([a-zA-Z0-9]{16})\b.*?\b([a-zA-Z0-9]{16})\b.*?\b([a-zA-Z0-9]{16})\b/);
  const nonce = match1?.[0] || (match2 ? match2[1] + match2[2] + match2[3] : null);

  if (!nonce) return null;

  const sId =
    embedUrl.split('/e-1/')[1]?.split('?')[0] ??
    embedUrl.split('/').pop()?.split('?')[0];
  const sourcesUrl = `${origin}/embed-2/v3/e-1/getSources?id=${sId}&_k=${nonce}`;

  const { data } = await axios.get(sourcesUrl, {
    headers: {
      ...DEFAULT_HEADERS,
      Accept: '*/*',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: referer,
    },
    timeout: 15000,
  });

  const tracks: SubtitleTrack[] = data?.tracks || [];
  const intro = data?.intro;
  const outro = data?.outro;

  const rawSources: any[] = Array.isArray(data?.sources) ? data.sources : (data?.sources?.[0]?.file ? [data.sources[0]] : []);
  const allSources: QualitySource[] = rawSources.map(s => ({
    file: s.file || s.url || '',
    label: s.label || s.quality || '',
  })).filter(s => s.file);

  if (!data.encrypted || data.sources?.[0]?.file.includes('.m3u8')) {
    return data.sources?.[0]?.file ? { m3u8: data.sources[0].file, referer, tracks, intro, outro, allSources } : null;
  }

  const keys = await getMegacloudKeys();
  const secret = keys['mega'];

  const decryptUrl =
    `https://megacloud-api-nine.vercel.app/` +
    `?encrypted_data=${encodeURIComponent(data.sources[0].file)}` +
    `&nonce=${encodeURIComponent(nonce)}` +
    `&secret=${encodeURIComponent(secret)}`;

  const { data: decrypted } = await axios.get(decryptUrl, { timeout: 5000 });

  const m3u8 = (typeof decrypted === 'string' ? decrypted : JSON.stringify(decrypted)).match(
    /"file":"(.*?)"/
  )?.[1];
  return m3u8 ? { m3u8, referer, tracks, intro, outro, allSources } : null;
}

export async function extractKiwiMapper(
  malId: string,
  epNum: string | number,
  timestamp: string,
  type: 'sub' | 'dub',
  baseUrl: string
): Promise<ExtractedStream | null> {
  for (const mapperBase of KIWI_MAPPER_URLS) {
    try {
      const mapperUrl = `${mapperBase}/${encodeURIComponent(malId)}/${encodeURIComponent(epNum)}/${encodeURIComponent(timestamp)}`;
      const { data } = await axios.get(mapperUrl, {
        headers: {
          ...DEFAULT_HEADERS,
          Referer: baseUrl + '/',
          Origin: baseUrl,
        },
        timeout: 8000,
      });

      if (!data || typeof data !== 'object') continue;

      let serverCode: string | null = null;
      for (const key of Object.keys(data)) {
        if (key === 'status') continue;
        const entry = data[key]?.[type];
        if (entry?.url && typeof entry.url === 'string') {
          serverCode = entry.url;
          break;
        }
      }

      if (!serverCode) continue;

      const { data: serverData } = await axios.get(`${baseUrl}/ajax/server?get=${serverCode}`, {
        headers: { ...DEFAULT_HEADERS, 'X-Requested-With': 'XMLHttpRequest' },
        timeout: 15000,
      });

      let embedUrl: string | null = serverData?.result?.url ?? null;
      if (!embedUrl) continue;

      if (embedUrl.includes('#')) {
        try {
          const encoded = embedUrl.split('#')[1];
          embedUrl = Buffer.from(encoded, 'base64').toString('utf-8');
        } catch (_) { }
      }

      const referer = 'https://kwik.cx2.mewcdn.online/';
      const tracks = await parseM3u8Subtitles(embedUrl, referer);
      return { m3u8: embedUrl, referer, tracks };
    } catch (err) {
      console.error(`[extractKiwiMapper] ${mapperBase} failed:`, err instanceof Error ? err.message : err);
    }
  }

  return null;
}

export async function extractVidstream(
  embedUrl: string,
  referer: string,
  mediaType?: string
): Promise<ExtractedStream | null> {
  try {
    let parentOrigin = referer;
    try {
      parentOrigin = new URL(referer).origin + '/';
    } catch (_) {}

    const { data: html } = await axios.get<string>(embedUrl, {
      headers: { ...DEFAULT_HEADERS, Referer: parentOrigin },
      timeout: 8000,
    });

    const epIdMatch = html.match(/id:\s*'([^']+)'/);
    const typeMatch = html.match(/type:\s*'(\w+)'/);
    const domain2Match = html.match(/domain2_url:\s*'([^']+)'/);

    if (!epIdMatch || (!typeMatch && !mediaType) || !domain2Match) return null;

    const epId = epIdMatch[1];
    const epType = mediaType || typeMatch?.[1];
    const domain2 = domain2Match[1].trim();

    const saveDataUrl = `${domain2}/save_data.php?id=${epId}-${epType}`;
    const { data } = await axios.get(saveDataUrl, {
      headers: { ...DEFAULT_HEADERS, Referer: embedUrl },
      timeout: 8000,
    });

    const rawSources: any[] = data?.data?.sources ?? [];
    const tracks: SubtitleTrack[] = data?.data?.tracks ?? [];
    const allSources: QualitySource[] = rawSources.map((s: any) => ({
      file: s.url || s.file || '',
      label: s.label || s.quality || s.type || '',
    })).filter((s: QualitySource) => s.file);

    const m3u8 = allSources[0]?.file ?? null;
    if (!m3u8) return null;

    return { m3u8, referer: domain2 + '/', tracks, allSources };
  } catch (err) {
    console.error('[extractVidstream] Failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

export async function extractMegaplay(
  embedUrl: string,
  mediaType?: string
): Promise<ExtractedStream | null> {
  try {
    const parsed = new URL(embedUrl);
    const host = parsed.host;
    const sParam = parsed.searchParams.get('s');
    const referer = 'https://' + host + '/';
    const { data: html } = await axios.get<string>(embedUrl, {
      headers: { ...DEFAULT_HEADERS, Referer: referer },
      timeout: 5000,
    });
    return await _doMegaplay(host, html, referer, sParam, embedUrl, mediaType);
  } catch (err) {
    console.error('Megaplay extraction failed:', err);
    return null;
  }
}

export async function extractMegacloud(
  embedUrl: string,
  parentReferer?: string
): Promise<ExtractedStream | null> {
  try {
    const origin = new URL(embedUrl).origin;
    let referer = origin + '/';
    if (parentReferer) {
      try {
        referer = new URL(parentReferer).origin + '/';
      } catch (_) {}
    }
    const { data: html } = await axios.get<string>(embedUrl, {
      headers: { ...DEFAULT_HEADERS, Referer: referer },
      timeout: 5000,
    });
    return await _doMegacloud(embedUrl, html, embedUrl);
  } catch (err) {
    console.error('Megacloud extraction failed:', err);
    return null;
  }
}

export async function extractStreamUrl(
  embedUrl: string,
  parentReferer?: string,
  mediaType?: string
): Promise<ExtractedStream | null> {
  const hostname = new URL(embedUrl).hostname;

  if (
    hostname.includes('megaplay.buzz') ||
    hostname.includes('vidwish.live') ||
    hostname.includes('megacloud.bloggy.click')
  ) {
    const megaplayUrl = embedUrl
      .replace('vidwish.live', 'megaplay.buzz')
      .replace('megacloud.bloggy.click', 'megaplay.buzz');
    return extractMegaplay(megaplayUrl, mediaType);
  }

  if (hostname.includes('megacloud.blog')) {
    return extractMegacloud(embedUrl, parentReferer);
  }

  if (hostname.includes('vidtube.site')) {
    return extractMegaplay(embedUrl, mediaType);
  }

  let currentUrl = embedUrl;
  let html = '';

  for (let i = 0; i < 3; i++) {
    try {
      let host = new URL(currentUrl).host;
      let referer = 'https://' + host + '/';
      if (parentReferer) {
        try {
          referer = new URL(parentReferer).origin + '/';
        } catch (_) {}
      }
      let response;

      try {
        response = await axios.get<string>(currentUrl, {
          headers: { ...DEFAULT_HEADERS, Referer: referer },
          timeout: 5000,
        });
      } catch {
        if (currentUrl.includes('vidwish.live') || currentUrl.includes('megacloud.bloggy.click')) {
          const fallbackUrl = currentUrl
            .replace('vidwish.live', 'megaplay.buzz')
            .replace('megacloud.bloggy.click', 'megaplay.buzz');
          host = new URL(fallbackUrl).host;
          referer = 'https://' + host + '/';
          if (parentReferer) {
            try {
              referer = new URL(parentReferer).origin + '/';
            } catch (_) {}
          }
          response = await axios.get<string>(fallbackUrl, {
            headers: { ...DEFAULT_HEADERS, Referer: referer },
            timeout: 15000,
          });
          currentUrl = fallbackUrl;
        } else {
          throw new Error('Initial fetch failed and no fallback available');
        }
      }

      html = response.data;

      const isErrorPage =
        html.includes('Error -') ||
        html.includes('error-container') ||
        html.includes("doesn't exist");
      if (
        isErrorPage &&
        (currentUrl.includes('vidwish.live') || currentUrl.includes('megacloud.bloggy.click'))
      ) {
        const fallbackUrl = currentUrl
          .replace('vidwish.live', 'megaplay.buzz')
          .replace('megacloud.bloggy.click', 'megaplay.buzz');
        host = new URL(fallbackUrl).host;
        referer = 'https://' + host + '/';
        response = await axios.get<string>(fallbackUrl, {
          headers: { ...DEFAULT_HEADERS, Referer: referer },
          timeout: 15000,
        });
        currentUrl = fallbackUrl;
        html = response.data;
      }

      const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
      if (iframeMatch) {
        const resolved = new URL(iframeMatch[1], currentUrl).toString();
        if (resolved !== currentUrl) {
          currentUrl = resolved;
          continue;
        }
      }

      const finalHost = new URL(currentUrl).hostname;
      const finalReferer = 'https://' + new URL(currentUrl).host + '/';

      if (
        finalHost.includes('megaplay.buzz') ||
        finalHost.includes('vidwish.live') ||
        finalHost.includes('vidtube.site')
      ) {
        const sParam = new URL(currentUrl).searchParams.get('s');
        return await _doMegaplay(new URL(currentUrl).host, html, finalReferer, sParam, currentUrl, mediaType);
      }
      if (finalHost.includes('megacloud.blog')) {
        return await _doMegacloud(currentUrl, html, currentUrl);
      }

      return null;
    } catch (err) {
      console.error(`[extractStreamUrl] Failed for ${currentUrl}:`, err);
      return null;
    }
  }

  return null;
}
