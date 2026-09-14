// ============================================
// 여기에 5단계에서 받은 웹앱 URL을 넣으세요 (모든 화면 공통)
// ============================================
const WEBAPP_URL = "https://script.google.com/macros/s/AKfycbwRZji-smstP6UoksLjgJHoeLt0pLPG6KW3rQIQSV9R6P-mEOc6x63NxP53hw1vnNOsIQ/exec";

// ============================================
// ⚠️ 필수 설정: Google OAuth 클라이언트 ID
// Google Cloud Console > API 및 서비스 > 사용자 인증 정보 에서
// "OAuth 2.0 클라이언트 ID" (웹 애플리케이션)를 만들어 여기 넣으세요.
// 승인된 자바스크립트 원본에 https://enochsofficial2.github.io 를 등록해야 합니다.
// 이 값을 채우기 전까지는 로그인이 동작하지 않습니다.
// ============================================
const GOOGLE_CLIENT_ID = "REPLACE_ME.apps.googleusercontent.com";

const AUTH_STORAGE_KEY = 'sellerhub_id_token';
const AUTH_EMAIL_KEY = 'sellerhub_email';

let _idToken = null;
let _authReadyResolve = null;
const _authReadyPromise = new Promise((resolve) => { _authReadyResolve = resolve; });

// ============================================
// 이스케이핑 / 안전 파싱 헬퍼 (모든 화면 공통)
// XSS 방지: 서버에서 온 값(구매자명·주소·상품명 등)을 HTML에 넣기 전엔 반드시 esc()를 거칠 것
// ============================================
function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// href 등 URL 자리에 넣을 때: http/https만 허용 (javascript: 등 차단)
function safeUrl(v) {
  const s = String(v || '').trim();
  return /^https?:\/\//i.test(s) ? esc(s) : '';
}

// 채널 정산표처럼 "1,234,567" / "₩1,234,567" / "(1,234)" 형태가 섞여 들어오는 셀을 숫자로 변환
// Number(v) || 0 은 이런 값들을 조용히 0으로 만들어버리므로 쓰지 말 것
function toNum(v) {
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  let s = String(v == null ? '' : v).trim().replace(/[₩,\s]/g, '');
  if (!s) return 0;
  const neg = /^\(.*\)$/.test(s);
  if (neg) s = s.slice(1, -1);
  const n = Number(s);
  return isNaN(n) ? 0 : (neg ? -n : n);
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

// ============================================
// API 호출 — JSONP를 완전히 대체하는 단일 경로 (인증 + 타임아웃 포함)
// 기존 callApi(action, params) / postApi(action, payload) 를 이 함수 하나로 대체
// ============================================
function api(action, params, opts) {
  opts = opts || {};
  const timeoutMs = opts.timeoutMs || 20000;

  return _authReadyPromise.then(function () {
    if (!_idToken) {
      // 로그인 안 된 상태 — 로그인 화면을 띄우고 에러로 종료
      showLoginRequired();
      return Promise.reject(new Error('로그인이 필요해요'));
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);

    return fetch(WEBAPP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action: action, idToken: _idToken }, params || {})),
      signal: ctrl.signal
    })
      .then(function (res) {
        if (!res.ok) throw new Error('서버 오류 (' + res.status + ')');
        return res.text();
      })
      .then(function (text) {
        let data;
        try { data = JSON.parse(text); }
        catch (e) { throw new Error('서버가 올바르지 않은 응답을 보냈어요'); }

        if (data && data.error === 'AUTH_INVALID') {
          // 토큰 만료/무효 — 세션 지우고 재로그인 요구
          clearAuth();
          showLoginRequired();
          throw new Error('로그인이 만료됐어요. 다시 로그인해주세요');
        }
        if (data && data.error) throw new Error(data.error);
        return data;
      })
      .catch(function (e) {
        if (e.name === 'AbortError') throw new Error('응답이 너무 오래 걸려요. 다시 시도해주세요');
        throw e;
      })
      .finally(function () {
        clearTimeout(timer);
      });
  });
}

// ============================================
// 인증 — Google Identity Services
// ============================================
function clearAuth() {
  _idToken = null;
  try {
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
    sessionStorage.removeItem(AUTH_EMAIL_KEY);
  } catch (e) {}
}

function showLoginRequired() {
  const overlay = document.getElementById('authOverlay');
  if (overlay) overlay.classList.add('show');
  document.body.classList.add('auth-locked');
}

function hideLoginRequired() {
  const overlay = document.getElementById('authOverlay');
  if (overlay) overlay.classList.remove('show');
  document.body.classList.remove('auth-locked');
}

function onGoogleCredential(response) {
  _idToken = response.credential;
  try {
    sessionStorage.setItem(AUTH_STORAGE_KEY, _idToken);
    // 이메일은 화면 표시용으로만 디코딩 (검증은 서버가 함 — 클라이언트 디코딩은 신뢰하지 않음)
    const payload = JSON.parse(atob(_idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    sessionStorage.setItem(AUTH_EMAIL_KEY, payload.email || '');
  } catch (e) {}
  hideLoginRequired();
  if (_authReadyResolve) { _authReadyResolve(); _authReadyResolve = null; }
  // 로그인 전에 실행됐던 데이터 로드가 이미 "로그인이 필요해요"로 실패했을 것이므로,
  // 페이지를 새로고침해서 정상적으로 다시 불러오게 합니다.
  location.reload();
}

function initAuth() {
  // 세션에 저장된 토큰으로 우선 시도 (재검증은 실제 API 호출 시 서버가 함)
  let cached = null;
  try { cached = sessionStorage.getItem(AUTH_STORAGE_KEY); } catch (e) {}

  if (cached) {
    // 캐시된 토큰이 있으면 그걸로 즉시 진행. GSI SDK 로딩을 기다릴 필요 없음
    // (실제 유효성은 첫 api() 호출에서 서버가 검증하고, 만료됐으면 그때 재로그인 요구)
    _idToken = cached;
    if (_authReadyResolve) { _authReadyResolve(); _authReadyResolve = null; }
    return;
  }

  if (typeof google === 'undefined' || !google.accounts) {
    // 로그인이 안 된 상태인데 GSI 스크립트가 아직 로드 전 — 잠시 후 재시도
    setTimeout(initAuth, 200);
    return;
  }

  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: onGoogleCredential,
    auto_select: true
  });

  const btnEl = document.getElementById('googleSignInBtn');
  if (btnEl) {
    google.accounts.id.renderButton(btnEl, {
      theme: 'outline', size: 'large', shape: 'pill', text: 'signin_with', locale: 'ko'
    });
  }

  showLoginRequired();
  google.accounts.id.prompt();
  if (_authReadyResolve) { _authReadyResolve(); _authReadyResolve = null; }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initAuth);
} else {
  initAuth();
}

// PWA 서비스워커 등록 (모든 화면 공통)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// ============================================
// 다크모드 (모든 화면 공통 - localStorage로 기기별 저장)
// 실제 적용은 각 페이지 <head> 인라인 스크립트에서 먼저 하고,
// 여기서는 토글 버튼만 주입합니다 (깜빡임 방지를 위해 역할을 분리함).
// ============================================
(function () {
  function applyTheme(theme) {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  function iconFor(theme) {
    return theme === 'dark'
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  }

  function currentTheme() {
    let saved = null;
    try { saved = localStorage.getItem('sellerhub_theme'); } catch (e) {}
    if (saved) return saved;
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }

  function injectToggleButton() {
    const btn = document.createElement('button');
    btn.className = 'theme-toggle-btn';
    btn.setAttribute('aria-label', '다크모드 전환');
    const current = currentTheme();
    btn.innerHTML = iconFor(current);

    btn.addEventListener('click', () => {
      const now = currentTheme();
      const next = now === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('sellerhub_theme', next); } catch (e) {}
      applyTheme(next);
      btn.innerHTML = iconFor(next);
    });

    document.body.appendChild(btn);
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', injectToggleButton);
  } else {
    injectToggleButton();
  }
})();
