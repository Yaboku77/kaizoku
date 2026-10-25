# Changelog

All notable changes to the **Kaizoku** app will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [v1.0.2] - 2026-10-25

### 🐛 Bug Fixes
- **Multi-Season & Split-Cour Episode Mapping (`ani.zip` Integration)**:
  - Fixed an issue where sequels and multi-season anime (e.g. *Jujutsu Kaisen Season 2*, *My Hero Academia*) incorrectly mapped to Season 1 episodes or showed empty episode lists due to inaccurate TMDB heuristics.
  - Integrated the authoritative `ani.zip` mapping API directly linking AniList media IDs to accurate season episode counts, absolute episode numbers, and TVDB metadata.
  - Added fallback TVDB episode thumbnail support (`_tvdbImage`) so episodes without TMDB images still show proper stills.
  - Fixed unreleased future episodes incorrectly appearing in episode lists by enforcing strict air date checks and `nextAiringEpisode` filters.
- **Cheerio HTML Scraping Freeze & Lag**:
  - Resolved severe UI freezes (10–30s lockups) previously caused by concurrent Cheerio HTML scraping on the mobile JavaScript thread during card loading.
  - Streamlined sub/dub badge handling to avoid blocking the JS event loop, keeping scrolling fluid.
- **Double-Tap Navigation & Duplicate Screen Pushes**:
  - Implemented centralized throttled navigation (`safeNavigate` and `safeReplace` in `navigationHelper.js`) to prevent duplicate screen pushes and stuck transitions when users tap rapidly.
  - Added debounced navigation guards in `RootNavigation.js`.
- **Clock Re-render Lag in Schedule Screen**:
  - Isolated the live clock timer into a dedicated `ClockHeader` component, preventing the entire schedule list and cards from re-rendering every second.
- **Broken Watch History & "Dive Back In" Thumbnails**:
  - Ensured episode stills from both TVDB and TMDB are properly recorded in local and cloud history objects.

### ⚡ Performance Improvements
- **Instant Home Screen Rendering**:
  - Home screen now displays immediately without blocking on secondary network requests (such as Anilist forum comments and TMDB logos), which now load smoothly in the background.
- **In-Memory Caching Across Screens**:
  - Added fast in-memory caching for `ScheduleScreen`, `BrowseScreen`, `YouScreen`, `HistoryScreen`, and `MyListScreen`, eliminating screen flicker and redundant re-fetches when switching tabs.
- **Grid & List Rendering Optimization**:
  - Memoized `BrowseCard` and applied virtualized FlatList windowing parameters (`initialNumToRender`, `maxToRenderPerBatch`, `windowSize`, `removeClippedSubviews`) for smooth 60 FPS scrolling.
- **Bottom Tab Responsiveness**:
  - Removed heavy animated tab wrapper overhead and preserved screen state across tab switches (`detachInactiveScreens: false`).
- **Instant Details Transition**:
  - Forwarded pre-fetched metadata (title, poster, format, year, status) into `DetailsScreen` navigation params so the screen immediately displays media context without showing empty skeletons.

---

## [v1.0.1] - 2026-09-22

### ✨ Features
- Added in-app update checker popup with GitHub Releases API integration and markdown release notes.
- Added global push and in-app announcement notification popups.
- Enhanced video player controls with Picture-in-Picture (PiP) support and orientation locking.

### 🐛 Bug Fixes
- Fixed video scraper stream URL resolution for multi-server playback.
- Resolved Firebase authentication and cloud sync persistence issues.

---

## [v1.0.0] - 2026-09-15

### 🎉 Initial Release
- Initial release of Kaizoku anime streaming app.
- Anime browsing, search, AniList sync, and watchlist management.
