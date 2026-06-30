/**
 * acc-book POST 클라이언트 래퍼.
 *
 * 서버가 거래일↔회계기간 검증(year-data-separation)으로 `OUT_OF_PERIOD`(400)를 반환하면,
 * 사용자에게 confirm 한 번 띄우고 override 플래그로 재요청한다.
 *   - insert/update: data._allowOutOfPeriod = true
 *   - batch_insert : allowOutOfPeriod = true
 * 그 외 응답은 그대로 반환 → 호출부의 기존 res.ok / res.json() 처리 유지.
 */
type AccBookBody = Record<string, unknown>;

async function send(body: AccBookBody): Promise<Response> {
  return fetch("/api/acc-book", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function postAccBook(body: AccBookBody): Promise<Response> {
  const res = await send(body);
  if (res.status !== 400) return res;

  const err = await res.clone().json().catch(() => null);
  if (err?.error?.code !== "OUT_OF_PERIOD") return res;

  const msg = String(err.error.message ?? "거래일이 회계기간 밖입니다.");
  if (typeof window === "undefined" || !window.confirm(`${msg}\n\n그래도 저장하시겠습니까?`)) {
    return res; // 사용자 취소 → 원본 400 반환(호출부가 에러 표시)
  }
  const retry: AccBookBody =
    body.action === "batch_insert"
      ? { ...body, allowOutOfPeriod: true }
      : { ...body, data: { ...((body.data as object) ?? {}), _allowOutOfPeriod: true } };
  return send(retry);
}
