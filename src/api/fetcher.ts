import axios from 'axios';
import * as cheerio from 'cheerio-without-node-native';
import { BASE_URL, DEFAULT_HEADERS } from './constants';

/**
 * Fetch an HTML page from anikototv.to and return a Cheerio instance.
 */
export async function fetchPage(path: string): Promise<cheerio.CheerioAPI> {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
  console.log(`[fetcher] Fetching URL: ${url}`);
  try {
    const { data } = await axios.get(url, {
      headers: {
        ...DEFAULT_HEADERS,
      },
      timeout: 15000, // 15 seconds
    });
    console.log(`[fetcher] Success! Data length: ${data?.length}. Starts with: ${data?.substring(0, 50)}`);
    return cheerio.load(data);
  } catch (err: any) {
    console.log(`[fetcher] Error fetching ${url}:`, err.message);
    throw err;
  }
}

/**
 * Fetch JSON from the site's internal AJAX endpoints.
 * @param extraHeaders - Optional additional headers to merge (e.g. a per-request Referer).
 */
export async function fetchJson<T = unknown>(path: string, extraHeaders?: Record<string, string>): Promise<T> {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
  const { data } = await axios.get<T>(url, {
    headers: {
      ...DEFAULT_HEADERS,
      Accept: 'application/json, text/javascript, */*',
      'X-Requested-With': 'XMLHttpRequest',
      ...extraHeaders,
    },
    timeout: 15_000,
  });
  return data;
}
