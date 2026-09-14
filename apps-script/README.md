# Apps Script 백엔드 패치 안내

이 폴더는 **참고 코드**입니다. 실제 백엔드(Apps Script 프로젝트)는 이 저장소에 없고
`script.google.com`에만 존재하므로, 아래 파일 내용을 Apps Script 편집기에 직접 복사해
기존 코드에 병합해야 합니다. 제가 여기서 직접 배포할 수 없습니다.

## 적용 순서

1. `Auth.gs` 전체를 Apps Script 프로젝트에 새 파일로 추가
2. **본인 이메일을 `ALLOWED_EMAILS`에 넣기** (`Auth.gs` 12번째 줄)
3. 기존 `doGet(e)` 함수를 찾아서 — 지금 JSONP 조회들이 여기로 들어오고 있을 것입니다 —
   `doPost(e)`로 통합. 아래 "기존 코드 병합 방법" 참고
4. 스크립트 속성(프로젝트 설정 > 스크립트 속성)에 아무것도 추가할 필요 없음 —
   `tokeninfo` 방식은 별도 키가 필요 없습니다
5. **새 배포**를 만들어 새 URL을 받고 (기존 배포는 보관 취소), 그 URL을 `common.js`의
   `WEBAPP_URL`에 반영
6. Google Cloud Console에서 OAuth 클라이언트 ID를 만들어 `common.js`의
   `GOOGLE_CLIENT_ID`에 반영 (아래 "OAuth 클라이언트 ID 만들기" 참고)

## 기존 코드 병합 방법

지금 구조를 모르는 상태에서 쓰는 것이라 정확한 병합 지점은 실제 코드를 봐야 확정되지만,
전형적인 구조는 이렇습니다.

**지금 (추정)**
```javascript
function doGet(e) {
  const action = e.parameter.action;
  const callback = e.parameter.callback;
  let result;
  if (action === 'listOrders') result = listOrders(e.parameter);
  else if (action === 'cancelOrder') result = cancelOrder(e.parameter);
  // ... 등등
  return ContentService.createTextOutput(callback + '(' + JSON.stringify(result) + ')')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function doPost(e) {
  // 정산 업로드만 여기 있었을 것
  const body = JSON.parse(e.postData.contents);
  if (body.action === 'saveSettlementUpload') { ... }
}
```

**바꾼 뒤**
```javascript
function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const action = body.action;

  // 1) 인증 먼저 — 실패하면 여기서 바로 끝남
  let userEmail;
  try {
    userEmail = verifyUser(body.idToken);
  } catch (authErr) {
    return jsonOutput({ error: 'AUTH_INVALID', detail: authErr.message });
  }

  // 2) 기존 액션 라우팅 그대로 재사용 (e.parameter 대신 body 사용)
  let result;
  try {
    if (action === 'listOrders') result = listOrders(body);
    else if (action === 'cancelOrder') result = cancelOrder(body, userEmail);
    else if (action === 'issueInvoice') result = issueInvoice(body, userEmail);
    // ... 기존에 있던 모든 action 분기를 그대로 옮기되,
    //     쓰기 작업 함수에는 userEmail을 넘겨서 담당자ID를 채우세요
    else result = { error: '알 수 없는 요청이에요' };
  } catch (e2) {
    result = { error: e2.message };
  }

  return jsonOutput(result);
}

// doGet은 완전히 제거하거나, 남겨두더라도 아무 데이터도 반환하지 않게 비워두세요.
// JSONP(<script src="...?action=...">)로는 인증 토큰을 안전하게 실어 보낼 수 없어서
// 조회 API까지 포함해 전부 POST로 통합하는 것이 CSRF 방어의 핵심입니다.
function doGet(e) {
  return jsonOutput({ error: '이 방식은 더 이상 지원하지 않아요' });
}

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
```

기존 함수(`listOrders`, `cancelOrder` 등)의 시그니처가 `e.parameter`를 직접 참조하고
있다면, `body`도 같은 모양의 객체(키-값)이므로 대부분 그대로 동작합니다. 다만
`e.parameter`의 값은 항상 문자열이었던 반면 `body`는 JSON 타입(숫자·불리언)을 그대로
가질 수 있으니, 숫자 비교를 하는 곳이 있다면 한 번 확인하세요.

## Apps Script 배포 설정

새 배포를 만들 때:
- **실행 계정**: 나 (본인 계정)
- **액세스 권한**: **전체 허용** (Anyone) — 이것 자체는 그대로 둬도 됩니다.
  누구나 URL로 요청은 보낼 수 있지만, `verifyUser()`가 이메일을 검사하기 때문에
  허용 목록에 없는 사람은 데이터를 받지 못합니다. 즉 "URL 공개"가 아니라
  "이메일 화이트리스트"가 실질적인 보안 경계가 됩니다.

## OAuth 클라이언트 ID 만들기

1. https://console.cloud.google.com 접속
2. 새 프로젝트 생성 (또는 기존 것 사용)
3. "API 및 서비스" > "OAuth 동의 화면" — User Type: 외부, 테스트 사용자에 본인 이메일 추가
4. "API 및 서비스" > "사용자 인증 정보" > "사용자 인증 정보 만들기" > "OAuth 클라이언트 ID"
5. 애플리케이션 유형: **웹 애플리케이션**
6. 승인된 자바스크립트 원본에 추가:
   - `https://enochsofficial2.github.io`
7. 생성된 클라이언트 ID(`....apps.googleusercontent.com` 형태)를
   `common.js`의 `GOOGLE_CLIENT_ID`에 붙여넣기

## 확인 방법

배포 후 시크릿 창에서:
```
<새 웹앱 URL>?action=listOrders
```
를 열었을 때 **아무 데이터도 나오지 않아야** 합니다 (GET 자체를 안 받으므로 에러 또는
빈 응답). 그리고 사이트에 로그인하지 않은 상태로 접속하면 로그인 화면이 떠야 하고,
허용되지 않은 구글 계정으로 로그인하면 "접근 권한이 없어요" 에러가 떠야 합니다.
