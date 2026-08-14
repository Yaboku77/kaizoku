import AsyncStorage from '@react-native-async-storage/async-storage';

export const TMDB_API_KEY = "3c78a3f1c589f36e1820360888354e47";

export const GENRES = ["Action", "Adventure", "Comedy", "Drama", "Ecchi", "Fantasy", "Horror", "Mahou Shoujo", "Mecha", "Music", "Mystery", "Psychological", "Romance", "Sci-Fi", "Slice of Life", "Sports", "Supernatural", "Thriller"];
export const FORMATS = [{ label: "TV Show", val: "TV" }, { label: "Movie", val: "MOVIE" }, { label: "OVA", val: "OVA" }, { label: "ONA", val: "ONA" }, { label: "Special", val: "SPECIAL" }];
export const SORTS = [{ label: "Popularity", val: "POPULARITY_DESC" }, { label: "Trending", val: "TRENDING_DESC" }, { label: "Score", val: "SCORE_DESC" }, { label: "Newest", val: "START_DATE_DESC" }];
export const SEASONS = [{ label: "Winter", val: "WINTER" }, { label: "Spring", val: "SPRING" }, { label: "Summer", val: "SUMMER" }, { label: "Fall", val: "FALL" }];
export const STATUSES = [{ label: "Airing", val: "RELEASING" }, { label: "Finished", val: "FINISHED" }, { label: "Upcoming", val: "NOT_YET_RELEASED" }];
export const SOURCES = [{ label: "Original", val: "ORIGINAL" }, { label: "Manga", val: "MANGA" }, { label: "Light Novel", val: "LIGHT_NOVEL" }];
export const COUNTRIES = [{ label: "Japan", val: "JP" }, { label: "South Korea", val: "KR" }, { label: "China", val: "CN" }];
export const YEARS = Array.from({ length: 40 }, (_, i) => new Date().getFullYear() + 1 - i);
export const TAGS = ["Action", "Adventure", "Comedy", "Drama", "Ecchi", "Fantasy", "Horror", "Mahou Shoujo", "Mecha", "Music", "Mystery", "Psychological", "Romance", "Sci-Fi", "Slice of Life", "Sports", "Supernatural", "Thriller", "Isekai", "Magic", "School", "Demons", "Military", "Super Power", "Aliens", "Vampire", "Time Travel", "Martial Arts", "Cyberpunk", "Space", "Idol", "Boys' Love", "Girls' Love", "Gore", "Survival", "Reincarnation"];

export const COLORS = {
  bg: '#050505',
  card: '#111111',
  border: '#1a1a1a',
  text: '#ffffff',
  textSecondary: '#9ca3af',
  textMuted: '#6b7280',
  accent: '#d4c356',
};

// ── Watch History & Player Prefs (AsyncStorage) ───────────────────────────────
const HISTORY_KEY = '@kaizoku_watch_history';
const PREFS_KEY = '@kaizoku_player_prefs';
const MAX_HISTORY = 50;

export async function saveToHistory({ animeId, animeTitle, coverImage, episodeIndex, episodeTitle, totalEpisodes }) {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    let h = raw ? JSON.parse(raw) : [];
    const existingIdx = h.findIndex(x => String(x.animeId) === String(animeId) && String(x.episodeIndex) === String(episodeIndex));
    let oldProgress = 0;
    let oldDuration = 0;
    if (existingIdx >= 0) {
      oldProgress = h[existingIdx].progress || 0;
      oldDuration = h[existingIdx].duration || 0;
      h.splice(existingIdx, 1);
    }
    h.unshift({ animeId, animeTitle, coverImage, episodeIndex, episodeTitle, totalEpisodes, savedAt: Date.now(), progress: oldProgress, duration: oldDuration });
    if (h.length > MAX_HISTORY) h = h.slice(0, MAX_HISTORY);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(h));
  } catch (e) { }
}

export async function updateProgress({ animeId, episodeIndex, progress, duration }) {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    let h = raw ? JSON.parse(raw) : [];
    const idx = h.findIndex(x => String(x.animeId) === String(animeId) && String(x.episodeIndex) === String(episodeIndex));
    if (idx >= 0) {
      h[idx].progress = progress;
      if (duration) h[idx].duration = duration;
      h[idx].savedAt = Date.now();
    } else {
      h.unshift({
        animeId,
        episodeIndex: Number(episodeIndex) || 0,
        progress,
        duration: duration || 0,
        savedAt: Date.now(),
      });
      if (h.length > MAX_HISTORY) h = h.slice(0, MAX_HISTORY);
    }
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(h));
  } catch (e) { }
}

export async function getHistory() {
  try { const raw = await AsyncStorage.getItem(HISTORY_KEY); return raw ? JSON.parse(raw) : []; } catch (e) { return []; }
}

export async function clearHistory() {
  try { await AsyncStorage.removeItem(HISTORY_KEY); } catch (e) { }
}

export async function savePlayerPrefs(prefs) {
  try { const e = await getPlayerPrefs(); await AsyncStorage.setItem(PREFS_KEY, JSON.stringify({ ...e, ...prefs })); } catch (e) { }
}

export async function getPlayerPrefs() {
  try { const raw = await AsyncStorage.getItem(PREFS_KEY); return raw ? JSON.parse(raw) : { speed: 1, quality: 'auto', subtitles: true }; } catch (e) { return { speed: 1, quality: 'auto', subtitles: true }; }
}

// ── My List (AsyncStorage) ───────────────────────────────────────────────────
const LIST_KEY = '@kaizoku_my_list';

export async function getList() {
  try {
    const raw = await AsyncStorage.getItem(LIST_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

export async function saveToList({ animeId, animeTitle, coverImage, status, format, year, score }) {
  try {
    const raw = await AsyncStorage.getItem(LIST_KEY);
    let list = raw ? JSON.parse(raw) : [];

    // Find existing
    const existing = list.find(x => String(x.animeId) === String(animeId));
    const addedAt = existing && existing.addedAt ? existing.addedAt : Date.now();

    // Remove if already exists
    list = list.filter(x => String(x.animeId) !== String(animeId));

    // Add to the front of the list
    list.unshift({ animeId, animeTitle, coverImage, status, format, year, score, savedAt: Date.now(), addedAt });

    await AsyncStorage.setItem(LIST_KEY, JSON.stringify(list));
  } catch (e) { }
}

export async function removeFromList(animeId) {
  try {
    const raw = await AsyncStorage.getItem(LIST_KEY);
    if (!raw) return;
    let list = JSON.parse(raw);
    list = list.filter(x => String(x.animeId) !== String(animeId));
    await AsyncStorage.setItem(LIST_KEY, JSON.stringify(list));
  } catch (e) { }
}

