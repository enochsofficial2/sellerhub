// ============================================
// 여기에 5단계에서 받은 웹앱 URL을 넣으세요 (모든 화면 공통)
// ============================================
const WEBAPP_URL = "https://script.google.com/macros/s/AKfycbwRZji-smstP6UoksLjgJHoeLt0pLPG6KW3rQIQSV9R6P-mEOc6x63NxP53hw1vnNOsIQ/exec";

let _shJsonpCounter = 0;

function callApi(action, params) {
  return new Promise((resolve, reject) => {
    const cbName = 'shCallback_' + (_shJsonpCounter++);
    const script = document.createElement('script');
    let url = WEBAPP_URL + '?action=' + encodeURIComponent(action) + '&callback=' + cbName;
    for (const key in (params || {})) {
      url += '&' + key + '=' + encodeURIComponent(params[key]);
    }
    window[cbName] = function (data) {
      resolve(data);
      delete window[cbName];
      script.remove();
    };
    script.onerror = function () {
      reject(new Error('네트워크 오류'));
      delete window[cbName];
      script.remove();
    };
    script.src = url;
    document.body.appendChild(script);
  });
}

/**
 * ✅ 2026-07-21 정산표 업로드용 POST 헬퍼 추가
 * Apps Script 웹앱은 doGet만 JSONP로 쓰고 있었는데, 정산표 업로드는 데이터가 커서
 * URL 파라미터로 보내기 어려워 POST로 보냄. CORS 프리플라이트(OPTIONS)를 피하려고
 * Content-Type을 application/json이 아니라 text/plain으로 보냄 (Apps Script가 내용은 그대로 JSON.parse함).
 */
function postApi(action, payload) {
  return fetch(WEBAPP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(Object.assign({ action: action }, payload || {}))
  }).then(function (res) { return res.json(); });
}

function formatWon(n) {
  return Number(n || 0).toLocaleString('ko-KR');
}

function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2200);
}

function channelBadgeClass(channel) {
  if (channel === '쿠팡') return 'badge coupang';
  if (channel === '네이버') return 'badge naver';
  return 'badge';
}

function statusBadgeClass(status) {
  if (status === '신규') return 'badge status-new';
  if (status === '보류') return 'badge status-return';
  if (status === '송장출력완료') return 'badge status-new';
  if (status === '발송완료' || status === '배송중' || status === '배송완료') return 'badge status-shipped';
  if (status === '반품접수') return 'badge status-return';
  if (status === '반품완료') return 'badge status-cancel';
  if (status === '취소') return 'badge status-cancel';
  return 'badge';
}

// PWA 서비스워커 등록 (모든 화면 공통)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// ============================================
// 다크모드 (모든 화면 공통 - localStorage로 기기별 저장)
// ============================================
(function () {
  function applyTheme(theme) {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  const saved = localStorage.getItem('sellerhub_theme') || 'light';
  applyTheme(saved);

  function iconFor(theme) {
    return theme === 'dark'
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  }

  function injectToggleButton() {
    const btn = document.createElement('button');
    btn.className = 'theme-toggle-btn';
    btn.setAttribute('aria-label', '다크모드 전환');
    const current = localStorage.getItem('sellerhub_theme') || 'light';
    btn.innerHTML = iconFor(current);

    btn.addEventListener('click', () => {
      const now = localStorage.getItem('sellerhub_theme') || 'light';
      const next = now === 'dark' ? 'light' : 'dark';
      localStorage.setItem('sellerhub_theme', next);
      applyTheme(next);
      btn.innerHTML = iconFor(next);
    });

    document.body.appendChild(btn);
  }

  // common.js는 보통 body 맨 아래에서 불러와지기 때문에, 이 시점엔 이미
  // DOMContentLoaded가 지나가버린 경우가 많음 -> 그 경우 바로 실행, 아니면 이벤트로 대기
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', injectToggleButton);
  } else {
    injectToggleButton();
  }
})();
