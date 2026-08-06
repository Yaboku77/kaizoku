export const SCREENSHOT_FALLBACK_DATA = {
  heroItems: [
    { id: 105333, title: "Dr. STONE", image: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx105333-BB0uUu1gqLh7.jpg", type: "TV Show", status: "AIRING", year: "2026" },
    { id: 21202, title: "Re:ZERO -Starting Life in Another World-", image: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21202-QzIhnXEk1Pvi.jpg", type: "TV Show", status: "AIRING", year: "2026" },
    { id: 108465, title: "Mushoku Tensei: Jobless Reincarnation", image: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx108465-RgsKpJCX5O8Q.jpg", type: "TV Show", status: "AIRING", year: "2026" },
    { id: 146064, title: "Witch Hat Atelier", image: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx146064-yP2ZpX1a3Y0s.png", type: "TV Show", status: "UPCOMING", year: "2026" },
    { id: 154587, title: "Frieren: Beyond Journey's End", image: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx154587-n1M2oUuP5B3D.jpg", type: "TV Show", status: "FINISHED", year: "2023" }
  ],
  trending: [
    { id: 105333, title: "Dr. STONE", image: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx105333-BB0uUu1gqLh7.jpg", type: "TV Show", year: 2026, status: "AIRING" },
    { id: 108465, title: "Mushoku Tensei", image: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx108465-RgsKpJCX5O8Q.jpg", type: "TV Show", year: 2026, status: "RELEASING" },
    { id: 146064, title: "Witch Hat Atelier", image: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx146064-yP2ZpX1a3Y0s.png", type: "TV Show", year: 2026, status: "NOT_YET_RELEASED" },
  ],
  popular: [
    { id: 154587, title: "Frieren: Beyond Journey's End", image: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx154587-n1M2oUuP5B3D.jpg", type: "TV Show", year: 2023, status: "FINISHED" },
    { id: 113415, title: "Jujutsu Kaisen", image: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx113415-bbBWj4pEFseh.jpg", type: "TV Show", year: 2020, status: "FINISHED" },
  ],
  upcoming: {
    id: 132066,
    title: "Made in Abyss: Retsujitsu no Ougonkyou",
    image: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx132066-1M1f9m5y9v0l.jpg",
    ep1Airing: "Coming Soon",
    source: "MANGA",
    synopsis: "Sequel to Made in Abyss...",
    genres: ["Adventure", "Drama", "Fantasy"]
  }
};

export const FALLBACK_COMMENTS = [
  { id: 1, anime: "Attack on Titan", likes: 142, replies: 23, text: "The ending hit different. I wasn't ready for this.", user: "LordFred", time: "2h ago", avatar: "https://api.dicebear.com/7.x/avataaars/png?seed=LordFred&backgroundColor=b6e3f4" },
  { id: 2, anime: "Jujutsu Kaisen", likes: 98, replies: 11, text: "Gojo's fight was absolutely insane. Studio MAPPA cooked.", user: "AniWatcher99", time: "4h ago", avatar: "https://api.dicebear.com/7.x/avataaars/png?seed=AniWatcher99&backgroundColor=c0aede" },
  { id: 3, anime: "Frieren", likes: 204, replies: 37, text: "This anime redefined what fantasy could be. A masterpiece.", user: "SilentOtaku", time: "1d ago", avatar: "https://api.dicebear.com/7.x/avataaars/png?seed=SilentOtaku&backgroundColor=d1d4f9" },
];

export const FALLBACK_DETAILS = {
  id: 1,
  title: "Loading...",
  bannerImage: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/108465-9b2uF7E1B3i4.jpg",
  coverImage: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx108465-RgsKpJCX5O8Q.jpg",
  status: "UPCOMING",
  format: "TV",
  seasonYear: 2026,
  description: "Loading description...",
  averageScore: null,
  duration: null,
  startDate: { year: 2026, month: 7, day: 4 },
  source: "LIGHT_NOVEL",
  genres: ["Adventure", "Drama", "Fantasy"],
  characters: [],
  relations: [],
  recommendations: [],
  studios: [],
  externalLinks: [],
};
