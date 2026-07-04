/**
 * acc-book POST 클라이언트 래퍼.
 *
 * 서버가 확인 필요 경고(400 + error.code)를 반환하면 사용자에게 confirm 후 override 재요청한다.
 *   - OUT_OF_PERIOD (거래일↔회계기간, year-data-separation) → _allowOutOfPeriod / batch: allowOutOfPeriod
 *   - SETTLED_PERIOD (결산확정 기간 수정, BX7)                → _allowSettled (단건 전용)
 * 두 경고가 순차로 나올 수 있어 최대 2회 confirm 재시도한다. 그 외 응답은 그대로 반환 →
 * 호출부의 기존 res.ok / res.json() 처리 유지.
 */
type AccBookBody = Record<string, unknown>;

/** error.code → 재요청에 실을 override 키(단건 data 내부용). */
const OVERRIDE_KEY_BY_CODE: Record<string, string> = {
  OUT_OF_PERIOD: "_allowOutOfPeriod",
  SETTLED_PERIOD: "_allowSettled",
};

async function send(body: AccBookBody): Promise<Response> {
  return fetch("/api/acc-book", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function postAccBook(body: AccBookBody): Promise<Response> {
  let current: AccBookBody = body;
  // OUT_OF_PERIOD → SETTLED_PERIOD 가 순차로 나올 수 있어 최대 2회 confirm 재시도.
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await send(current);
    if (res.status !== 400) return res;

    const err = await res.clone().json().catch(() => null);
    const code = err?.error?.code as string | undefined;
    const overrideKey = code ? OVERRIDE_KEY_BY_CODE[code] : undefined;
    if (!overrideKey) return res;

    const msg = String(err.error.message ?? "저장할 수 없습니다.");
    if (typeof window === "undefined" || !window.confirm(`${msg}\n\n그래도 저장하시겠습니까?`)) {
      return res; // 사용자 취소 → 원본 400 반환(호출부가 에러 표시)
    }
    // batch_insert 의 기간 override 는 최상위 키(allowOutOfPeriod); 단건은 data 내부에 override 키.
    // (SETTLED_PERIOD 는 단건 전용이라 batch 경로엔 나오지 않는다.)
    current =
      current.action === "batch_insert"
        ? { ...current, allowOutOfPeriod: true }
        : { ...current, data: { ...((current.data as object) ?? {}), [overrideKey]: true } };
  }
  return send(current);
}
