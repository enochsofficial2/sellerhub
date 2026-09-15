/**
 * 데이터 정합성 패치 — Apps Script 프로젝트에 새 파일로 추가하거나,
 * 기존 재고 조정 함수를 아래 내용으로 교체하세요.
 *
 * 실제 시트 접근 코드(SpreadsheetApp.openById 등)는 프로젝트마다 다르므로,
 * 아래는 "이 구조로 감싸라"는 패턴입니다. 시트 이름/컬럼 위치는 실제 프로젝트에
 * 맞게 바꿔야 합니다.
 */

const SHEET_ID = 'YOUR_SHEET_ID'; // 이미 프로젝트에 상수가 있다면 그걸 쓰고 이 줄은 지우세요

/**
 * 재고를 안전하게 조정합니다. LockService로 감싸서, 동시에 여러 요청이 들어와도
 * "재고이력의 마지막 변동후재고"와 "상품마스터의 현재재고"가 어긋나지 않게 합니다.
 *
 * @param productId  상품ID
 * @param delta      증감량 (출고면 음수, 재입고면 양수)
 * @param reason     변동유형 문자열 (예: '출고', '반품입고', '수동조정')
 * @param orderId    연결주문ID (없으면 빈 문자열)
 * @param userEmail  담당자 이메일 (verifyUser가 반환한 값을 그대로 전달)
 */
function adjustStock(productId, delta, reason, orderId, userEmail) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    throw new Error('다른 작업이 재고를 처리 중이에요. 잠시 후 다시 시도해주세요.');
  }

  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const productSheet = ss.getSheetByName('상품마스터');
    const historySheet = ss.getSheetByName('재고이력');

    const data = productSheet.getDataRange().getValues();
    const header = data[0];
    const idCol = header.indexOf('상품ID');
    const stockCol = header.indexOf('현재재고');

    let rowIndex = -1;
    let currentStock = 0;
    for (let i = 1; i < data.length; i++) {
      if (data[i][idCol] === productId) {
        rowIndex = i;
        currentStock = Number(data[i][stockCol]) || 0;
        break;
      }
    }
    if (rowIndex === -1) throw new Error('상품을 찾을 수 없어요: ' + productId);

    const newStock = currentStock + delta;
    if (newStock < 0) {
      throw new Error('재고가 부족해요 (현재 ' + currentStock + '개, 요청 ' + delta + ')');
    }

    // 1) 마스터 갱신
    productSheet.getRange(rowIndex + 1, stockCol + 1).setValue(newStock);

    // 2) 이력 기록 — 마스터 갱신과 반드시 같은 락 안에서
    historySheet.appendRow([
      'INV' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd') + '-' + Math.floor(Math.random() * 10000),
      nowIso(),
      productId,
      reason || '조정',
      delta,
      newStock,
      userEmail || '',
      orderId || '',
      ''
    ]);

    return { newStock: newStock };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 재고 마스터와 이력이 어긋난 상품을 찾아 리포트합니다.
 * 트리거로 주 1회 돌리거나, 관리자 화면에서 수동 호출하세요.
 */
function reconcileStock() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const productSheet = ss.getSheetByName('상품마스터');
  const historySheet = ss.getSheetByName('재고이력');

  const products = productSheet.getDataRange().getValues();
  const pHeader = products[0];
  const pIdCol = pHeader.indexOf('상품ID');
  const pStockCol = pHeader.indexOf('현재재고');

  const history = historySheet.getDataRange().getValues();
  const hHeader = history[0];
  const hIdCol = hHeader.indexOf('상품ID');
  const hStockCol = hHeader.indexOf('변동후재고');
  const hDateCol = hHeader.indexOf('일시');

  // 상품별 마지막 이력 찾기
  const lastHistory = {}; // productId -> {stock, date}
  for (let i = 1; i < history.length; i++) {
    const pid = history[i][hIdCol];
    const date = history[i][hDateCol];
    if (!lastHistory[pid] || new Date(date) > new Date(lastHistory[pid].date)) {
      lastHistory[pid] = { stock: Number(history[i][hStockCol]) || 0, date: date };
    }
  }

  const mismatches = [];
  for (let i = 1; i < products.length; i++) {
    const pid = products[i][pIdCol];
    const masterStock = Number(products[i][pStockCol]) || 0;
    const h = lastHistory[pid];
    if (h && h.stock !== masterStock) {
      mismatches.push({ productId: pid, masterStock: masterStock, historyStock: h.stock });
    }
  }

  if (mismatches.length > 0) {
    Logger.log('재고 불일치 %s건: %s', mismatches.length, JSON.stringify(mismatches));
    // 필요하면 여기서 MailApp.sendEmail(...)로 알림을 보내세요
  }
  return mismatches;
}

/**
 * 날짜를 항상 ISO 8601(UTC)로 통일해서 저장하세요.
 * "2026. 7. 8 오전 9:18:00" 같은 로케일 문자열이 JSON으로 나가면
 * 프론트의 new Date()가 브라우저마다 다르게(대부분 Invalid Date로) 해석합니다.
 */
function nowIso() {
  return new Date().toISOString();
}

/**
 * 시트에 이미 들어있는 값이 Date 객체거나, 한국어 로케일 문자열이거나,
 * 이미 ISO 문자열인 경우를 모두 ISO로 정규화합니다.
 * 기존 데이터 일괄 변환 스크립트에서 재사용하세요.
 */
function toIso(v) {
  if (v instanceof Date) return v.toISOString();
  const s = String(v || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s; // 이미 ISO

  // "2026. 7. 8 오전 9:18:00" 형태 복구
  const m = s.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\s*(오전|오후)?\s*(\d{1,2}):(\d{2}):?(\d{2})?/);
  if (m) {
    let h = Number(m[5]);
    if (m[4] === '오후' && h < 12) h += 12;
    if (m[4] === '오전' && h === 12) h = 0;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), h, Number(m[6]), Number(m[7] || 0)).toISOString();
  }
  return s; // 알 수 없는 형식은 원본 유지 (수동 확인 필요)
}

/**
 * 기존 데이터 일괄 변환 — 한 번만 수동 실행하세요.
 * ⚠️ 실행 전 반드시 시트 사본을 떠 두세요 (파일 > 사본 만들기). 되돌릴 수 없습니다.
 */
function migrateDatesToIso() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const targets = [
    { sheet: '주문', cols: ['주문일시', '수집일시'] },
    { sheet: '상품마스터', cols: ['등록일'] },
    { sheet: '재고이력', cols: ['일시'] },
    { sheet: '반품수거신청', cols: ['접수일시'] },
    { sheet: '송장', cols: ['발송일', '등록일시'] },
    { sheet: '반품취소', cols: ['접수일', '등록일시'] },
  ];

  targets.forEach(function (t) {
    const sheet = ss.getSheetByName(t.sheet);
    if (!sheet) { Logger.log('시트 없음: %s', t.sheet); return; }
    const data = sheet.getDataRange().getValues();
    const header = data[0];

    t.cols.forEach(function (colName) {
      const colIdx = header.indexOf(colName);
      if (colIdx === -1) { Logger.log('%s 시트에 %s 컬럼 없음', t.sheet, colName); return; }

      for (let i = 1; i < data.length; i++) {
        const original = data[i][colIdx];
        if (!original) continue;
        const converted = toIso(original);
        sheet.getRange(i + 1, colIdx + 1).setValue(converted);
      }
    });
  });

  Logger.log('날짜 변환 완료');
}
