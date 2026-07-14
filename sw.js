const CACHE_NAME = 'sellerhub-v13';
const CORE_ASSETS = ['./index.html', './orders.html', './inventory.html', './profile.html', './insights.html', './print.html', './style.css', './common.js', './manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// 데이터 요청(구글 스크립트)은 캐싱하지 않음
// 화면 파일(HTML/CSS/JS)은 "네트워크 우선" 전략: 항상 최신 버전을 먼저 시도하고,
// 오프라인일 때만 저장된 캐시로 대체 (예전 버전이 계속 뜨는 문제 방지)
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('script.google.com')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
