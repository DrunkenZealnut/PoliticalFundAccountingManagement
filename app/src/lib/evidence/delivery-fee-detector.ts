/**
 * 증빙 텍스트에서 배송비(운송·발송·택배 등) 비용 항목을 감지한다.
 * 단순 "배송" 매칭은 안내문구("구매/취소/배송", "배송지")를 오탐하므로,
 * 비용을 뜻하는 접미(비/료/요금)가 붙은 경우와 "퀵서비스"만 매칭한다.
 */
const DELIVERY_FEE_PATTERN =
  /(배송|운송|발송|택배|운반|배달)\s*(비|료|요금)|퀵\s*(서비스|비|료)/;

export function detectDeliveryFee(text: string): { matched: boolean; keyword?: string } {
  if (!text) return { matched: false };
  const m = DELIVERY_FEE_PATTERN.exec(text);
  return m ? { matched: true, keyword: m[0].trim() } : { matched: false };
}

/** data URL 접두부를 제외한 base64 문자열을 Uint8Array로 변환한다. */
function base64ToUint8Array(base64: string): Uint8Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * PDF(base64)에서 텍스트 레이어를 추출한다. 클라이언트 전용.
 * pdfjs를 동적 import 하여 이 모듈을 import하는 단위 테스트(순수 함수)가
 * 브라우저 전용 코드를 로드하지 않게 한다.
 * 텍스트가 없는 스캔 PDF/암호화 PDF 등은 빈 문자열 또는 throw → 호출부에서 무시.
 */
export async function extractPdfText(base64: string): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const pdf = await pdfjs.getDocument({ data: base64ToUint8Array(base64) }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it) => ("str" in it ? it.str : "")).join(" ") + "\n";
  }
  return text;
}
