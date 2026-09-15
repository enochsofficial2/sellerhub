// 캐시 버전을 올려서, 이번에 바뀐 파일들(로그인 게이트/XSS 이스케이핑 등)을
// 오프라인 캐시에 남아있던 예전 버전이 아니라 새 버전으로 다시 받아가게 합니다.
const CACHE_NAME = 'sellerhub-v28';
const CORE_ASSETS = ['./index.html', './orders.html', './inventory.html', './profile.html', './insights.html', './print.html', './settlement.html', './returns.html', './style.css', './common.js', './manifest.json'];

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
