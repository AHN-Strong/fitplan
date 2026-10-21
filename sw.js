/* 오프라인 사용을 위한 서비스 워커.
 * 앱 파일은 미리 저장하고, 사진·해부도는 처음 볼 때 저장한다. 업데이트하면 VERSION을 올린다. */
const VERSION = "fitplan-v7";
const CORE = [
  "./", "index.html", "styles.css", "manifest.webmanifest",
  "js/calc.js", "js/exercises.js", "js/generator.js", "js/progress.js", "js/store.js",
  "js/bodymap.js", "js/eximages.js", "js/app.js", "js/workout.js", "js/stats.js", "js/energy.js", "js/foods.js", "js/diet.js", "js/activity.js", "js/bodycomp.js", "js/vault.js",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png",
  "assets/wger/muscular_system_front.svg", "assets/wger/muscular_system_back.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  const isPage = req.mode === "navigate" || req.destination === "document";
  if (isPage) {
    // 페이지는 네트워크 우선, 실패하면 저장본
    e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); return r; })
      .catch(() => caches.match(req).then((r) => r || caches.match("index.html"))));
    return;
  }
  // 나머지는 저장본 우선, 뒤에서 갱신
  e.respondWith(caches.match(req).then((hit) => {
    const net = fetch(req).then((r) => { if (r && r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return r; }).catch(() => hit);
    return hit || net;
  }));
});
