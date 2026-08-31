fetch("https://tmdb-proxy.bgtoons.workers.dev/3/movie/popular", {
  headers: {
    "X-Proxy-Secret": "kaizoku_secret_key_123"
  }
})
.then(res => res.json())
.then(console.log);
