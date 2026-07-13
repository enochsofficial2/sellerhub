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
