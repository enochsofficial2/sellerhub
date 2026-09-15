/**
 * 인증 모듈 — Apps Script 프로젝트에 새 파일로 추가하세요.
 * 사용법은 이 폴더의 README.md 참고.
 */

// ⚠️ 여기에 로그인을 허용할 구글 이메일을 넣으세요. 이 목록에 없는 계정은
// 로그인 자체는 되어도 verifyUser()에서 거부됩니다.
const ALLOWED_EMAILS = [
  'your-email@gmail.com',
  // 'qtg19955@gmail.com',   // 필요하면 주석 해제
];

// common.js의 GOOGLE_CLIENT_ID와 반드시 같은 값이어야 합니다.
const OAUTH_CLIENT_ID = '460110329707-gqj3obhea11ijseip6q2d3q1efmaa398.apps.googleusercontent.com';

/**
 * 프론트에서 보낸 Google ID 토큰을 검증하고, 통과하면 이메일을 반환합니다.
 * 실패하면 예외를 던집니다 — 호출부에서 try/catch로 잡아 AUTH_INVALID로 응답하세요.
 *
 * tokeninfo 엔드포인트는 Google이 토큰의 서명·만료·발급대상(aud)을 대신 검증해줍니다.
 * 요청마다 URLFetch를 1회 소비하므로, 트래픽이 늘면 CacheService로 5분 정도 캐시하는
 * 것도 고려하세요 (아래 verifyUserCached 참고).
 */
function verifyUser(idToken) {
  if (!idToken) throw new Error('인증 정보가 없어요');

  const res = UrlFetchApp.fetch(
    'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
    { muteHttpExceptions: true }
  );

  if (res.getResponseCode() !== 200) throw new Error('인증에 실패했어요');

  const info = JSON.parse(res.getContentText());

  if (info.aud !== OAUTH_CLIENT_ID) throw new Error('인증에 실패했어요 (대상 불일치)');
  if (!info.email_verified || info.email_verified === 'false') throw new Error('이메일이 확인되지 않은 계정이에요');
  if (ALLOWED_EMAILS.indexOf(info.email) === -1) throw new Error('접근 권한이 없어요: ' + info.email);

  return info.email;
}

/**
 * verifyUser()의 캐시 버전. 같은 토큰으로 반복 호출될 때 URLFetch 호출을 줄여줍니다.
 * 트래픽이 늘어나 URLFetch 일일 한도(개인 계정 20,000회/일)가 걱정되면 이걸 쓰세요.
 * 지금 규모(하루 1~200건)에서는 verifyUser()만으로 충분합니다.
 */
function verifyUserCached(idToken) {
  if (!idToken) throw new Error('인증 정보가 없어요');

  const cache = CacheService.getScriptCache();
  const cacheKey = 'auth_' + Utilities.base64Encode(
    Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, idToken)
  );
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const email = verifyUser(idToken);
  cache.put(cacheKey, email, 300); // 5분 캐시
  return email;
}

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
