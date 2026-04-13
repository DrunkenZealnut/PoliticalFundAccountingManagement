/* ------------------------------------------------------------------ */
/*  텍스트 기반 지출 정보 파서                                          */
/*  "명함 인쇄 50만원 양지디자인 4월10일 카드" → 구조화된 데이터         */
/* ------------------------------------------------------------------ */

import { EXPENSE_WIZARD_TYPES, type WizardType } from "./wizard-mappings";

export interface ParsedExpenseText {
  amount: number | null;
  date: string | null;         // YYYY-MM-DD
  payMethod: string | null;    // PAY_METHODS value ("118", "584" 등)
  customerName: string | null;
  content: string;             // 정리된 내역 (금액/날짜/결제수단 제거 후)
  keywords: string[];          // 지출유형 매칭용 키워드
}

/* ---- 금액 패턴 ---- */

function extractAmount(text: string): { amount: number | null; consumed: string[] } {
  const consumed: string[] = [];

  // 3만5천원
  const m1 = text.match(/(\d+)만\s*(\d+)천\s*원?/);
  if (m1) {
    consumed.push(m1[0]);
    return { amount: Number(m1[1]) * 10000 + Number(m1[2]) * 1000, consumed };
  }

  // 50만원, 50만
  const m2 = text.match(/(\d+)만\s*원?/);
  if (m2) {
    consumed.push(m2[0]);
    return { amount: Number(m2[1]) * 10000, consumed };
  }

  // 500,000원
  const m3 = text.match(/(\d{1,3}(?:,\d{3})+)\s*원?/);
  if (m3) {
    consumed.push(m3[0]);
    return { amount: Number(m3[1].replace(/,/g, "")), consumed };
  }

  // 500000 (5자리 이상 연속 숫자)
  const m4 = text.match(/(\d{5,})\s*원?/);
  if (m4) {
    consumed.push(m4[0]);
    return { amount: Number(m4[1]), consumed };
  }

  return { amount: null, consumed };
}

/* ---- 날짜 패턴 ---- */

function extractDate(text: string): { date: string | null; consumed: string[] } {
  const consumed: string[] = [];
  const now = new Date();
  const year = now.getFullYear();

  // 상대 날짜
  const relativeMap: Record<string, number> = {
    "오늘": 0, "어제": -1, "그제": -2, "그저께": -2,
  };
  for (const [keyword, offset] of Object.entries(relativeMap)) {
    if (text.includes(keyword)) {
      consumed.push(keyword);
      const d = new Date(now);
      d.setDate(d.getDate() + offset);
      return {
        date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
        consumed,
      };
    }
  }

  // 2026-04-10, 2026.04.10, 2026년4월10일
  const m1 = text.match(/(\d{4})[-/.년]\s*(\d{1,2})[-/.월]\s*(\d{1,2})일?/);
  if (m1) {
    consumed.push(m1[0]);
    return { date: `${m1[1]}-${m1[2].padStart(2, "0")}-${m1[3].padStart(2, "0")}`, consumed };
  }

  // 4월10일, 4/10, 4.10
  const m2 = text.match(/(\d{1,2})[-/.월]\s*(\d{1,2})일?/);
  if (m2) {
    consumed.push(m2[0]);
    return { date: `${year}-${m2[1].padStart(2, "0")}-${m2[2].padStart(2, "0")}`, consumed };
  }

  return { date: null, consumed };
}

/* ---- 결제수단 패턴 ---- */

const PAY_KEYWORDS: [string, string][] = [
  ["신용카드", "584"],
  ["체크카드", "585"],
  ["카드", "584"],
  ["현금", "120"],
  ["계좌이체", "118"],
  ["계좌", "118"],
  ["이체", "118"],
  ["입금", "118"],
  ["송금", "118"],
  ["수표", "583"],
];

function extractPayMethod(text: string): { payMethod: string | null; consumed: string[] } {
  const lower = text.toLowerCase();
  for (const [keyword, code] of PAY_KEYWORDS) {
    if (lower.includes(keyword)) {
      return { payMethod: code, consumed: [keyword] };
    }
  }
  return { payMethod: null, consumed: [] };
}

/* ---- 키워드 추출 (wizard-mappings 기반) ---- */

function extractKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  const matched: string[] = [];

  for (const type of EXPENSE_WIZARD_TYPES) {
    for (const kw of type.keywords) {
      if (lower.includes(kw.toLowerCase()) && !matched.includes(kw)) {
        matched.push(kw);
      }
    }
  }

  return matched;
}

/* ---- 메인 파서 ---- */

/* ---- OCR 교차검증 ---- */

export interface OcrComparison {
  amount: { ocr: number; text: number | null; match: boolean };
  date: { ocr: string; text: string | null; match: boolean };
  customer: { ocr: string; text: string | null; match: boolean };
}

/** 텍스트 파싱 결과와 OCR 결과를 비교하여 일치 여부를 반환 */
export function compareWithOcr(
  parsed: ParsedExpenseText,
  ocr: { amount: number; date: string; provider: string },
): OcrComparison {
  // OCR 날짜: YYYYMMDD → YYYY-MM-DD
  const ocrDate = ocr.date.length === 8
    ? `${ocr.date.slice(0, 4)}-${ocr.date.slice(4, 6)}-${ocr.date.slice(6, 8)}`
    : ocr.date;

  return {
    amount: {
      ocr: ocr.amount,
      text: parsed.amount,
      match: parsed.amount !== null && parsed.amount === ocr.amount,
    },
    date: {
      ocr: ocrDate,
      text: parsed.date,
      match: parsed.date !== null && parsed.date === ocrDate,
    },
    customer: {
      ocr: ocr.provider,
      text: parsed.customerName,
      match: parsed.customerName !== null &&
        (parsed.customerName.includes(ocr.provider) || ocr.provider.includes(parsed.customerName)),
    },
  };
}

/* ---- 메인 파서 ---- */

export function parseExpenseText(text: string): ParsedExpenseText {
  const trimmed = text.trim();
  if (!trimmed) {
    return { amount: null, date: null, payMethod: null, customerName: null, content: "", keywords: [] };
  }

  const { amount, consumed: amountTokens } = extractAmount(trimmed);
  const { date, consumed: dateTokens } = extractDate(trimmed);
  const { payMethod, consumed: payTokens } = extractPayMethod(trimmed);
  const keywords = extractKeywords(trimmed);

  // 소비된 토큰들 제거하여 거래처명/내역 추출
  let remaining = trimmed;
  for (const token of [...amountTokens, ...dateTokens, ...payTokens]) {
    remaining = remaining.replace(token, "");
  }
  remaining = remaining.replace(/\s+/g, " ").trim();

  // 남은 텍스트에서 키워드를 분리하여 거래처명 추정
  let contentParts: string[] = [];
  let customerParts: string[] = [];

  const words = remaining.split(/\s+/);
  for (const word of words) {
    if (!word) continue;
    // 숫자만인 토큰은 스킵 (금액 잔여)
    if (/^\d+$/.test(word)) continue;
    // 키워드와 정확히 일치하거나 키워드 자체인 경우만 content로 분류
    // "간판점"처럼 키워드("간판")를 포함하지만 더 긴 단어는 거래처명 후보
    const isExactKeyword = keywords.some(kw => {
      const wl = word.toLowerCase();
      const kwl = kw.toLowerCase();
      return wl === kwl || (wl.includes(kwl) && wl.length <= kwl.length + 1);
    });
    if (isExactKeyword) {
      contentParts.push(word);
    } else {
      customerParts.push(word);
    }
  }

  // 키워드가 없으면 전체를 content로
  if (contentParts.length === 0) {
    contentParts = customerParts;
    customerParts = [];
  }

  return {
    amount,
    date,
    payMethod,
    customerName: customerParts.join(" ") || null,
    content: contentParts.join(" ") || remaining,
    keywords,
  };
}
