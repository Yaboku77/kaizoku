# 🏴‍☠️ Kaizoku - The Ultimate Anime Experience

Forget clunky, slow, and ad-ridden anime apps. **Kaizoku** is built differently. We set out to create the absolute best anime streaming experience on mobile—and we delivered. 

Kaizoku isn't just an app; it's a buttery-smooth, lightning-fast portal to your favorite anime, designed to put every other streaming app to shame.

## ⚡ Why Kaizoku is Built Better

### 🚀 Blazing Fast Performance
Waiting for videos to load? Not here. Kaizoku uses optimized scrapers and direct video delivery to ensure streams start instantly. Whether you're jumping into a new series or scrubbing through an episode, the app responds the millisecond you touch it.

### ✨ Buttery Smooth UI & Animations
We didn't just build an interface; we crafted an experience. 
- **Fluid Gestures:** Swipe up to enter fullscreen, swipe down to minimize to a beautiful mini-player.
- **Micro-Animations:** From the moment the splash screen fades, every transition, button press, and list scroll is powered by 60fps animations.
- **Premium Design:** Glassmorphism, dynamic gradients, and edge-to-edge artwork make discovering anime visually stunning.

### 👑 The Best, Period.
Most anime apps feel like web wrappers. Kaizoku is a true native powerhouse. 
- **Picture-in-Picture (PiP):** Text your friends or browse the web without ever pausing your anime. 
- **Pro Player Controls:** Double-tap to skip, hold for 2x speed, and easily skip intros/outros.
- **Zero Compromise:** It tracks your progress seamlessly to the cloud, organizes your watchlist perfectly, and never drops a frame.

### ⚙️ How It Works
Under the hood, Kaizoku dynamically fetches the highest quality links from top-tier servers (VidPlay, HD-1, VidCloud) in real-time. There is no middle-man server slowing you down. It talks directly to the source, giving you unthrottled streaming speeds in a gorgeous React Native shell.

---

## 🛠️ Technical Setup

### Prerequisites
- Node.js (installed ✅)
- Android Studio / Xcode (installed ✅)
- Java JDK (installed ✅)

### Local Development
```bash
cd "c:\anime\kaizoku stream\app"
npm install
npx expo start
```

### Build APK
```bash
# First, install EAS CLI
npm install -g eas-cli
eas login

# Build APK (local build with Android Studio)
npx expo run:android

# OR build in the cloud (Expo EAS)
eas build --platform android --profile preview
```

## 📱 Screens Built
- ✅ Splash Screen (Animated K logo + progress bar)
- ✅ Home Screen (Hero slider, Trending, Popular, Upcoming, Recent Releases)
- ✅ Details Screen (Tabs: Overview, Episodes, Characters, Related)
- ✅ Player Screen (Advanced video player, Episode list, Comments, Controls)
- ✅ Browse Screen (Search + Filters + Grid View)
- ✅ Schedule Screen (Daily airing schedule)
- ✅ My List Screen (Watchlist with intuitive tabs)
- ✅ You Screen (Profile + Menu)
- ✅ Settings Screen (App preferences and toggles)

## 📌 Upcoming Fixes & Features (TODOs)
1. Add external player support (like the Kaizoku React web app).
2. Fix Search and Notification UI/UX and match the web app's look and feel.
3. Fix Home Screen slider missing TMDB logos.
4. Fix sizing of status buttons (Planning, Watching, On hold) on the My List page.
