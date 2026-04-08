import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

function getGenAI() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY 환경변수가 설정되지 않았습니다.");
  return new GoogleGenerativeAI(key);
}

export const maxDuration = 60;

const EXTRACT_PROMPT = `이 이미지는 한국 정치자금 회계에 사용되는 영수증, 거래내역서, 또는 주문계약서입니다.
이미지에서 아래 정보를 추출하여 JSON으로 반환하세요.

반드시 아래 JSON 형식만 반환하세요. 설명이나 마크다운 없이 순수 JSON만 출력하세요.

{
  "date": "YYYYMMDD 형식의 거래일자",
  "amount": 총금액(숫자만),
  "content": "거래 내역/품목 요약 (50자 이내)",
  "provider": "거래처/상호명",
  "regNum": "사업자번호 (없으면 빈 문자열)",
  "addr": "거래처 주소 (없으면 빈 문자열)",
  "items": [
    { "name": "품목명", "quantity": 수량, "unitPrice": 단가, "amount": 금액 }
  ],
  "expenseCategory": "선거비용 또는 선거비용외",
  "expenseType1": "지출유형 대분류",
  "expenseType2": "지출유형 중분류",
  "payMethod": "결제수단"
}

규칙:
- date: 영수증에 있는 날짜를 YYYYMMDD 형식으로 변환
- amount: 합계/총액/공급가액합계를 숫자만 (콤마, 원 제거)
- content: 주요 품목들을 간략히 나열
- provider: 상호명, 가맹점명, 매장명 등
- regNum: 사업자등록번호 (하이픈 포함 가능, 없으면 "")
- addr: 거래처 주소
- items: 개별 품목 리스트 (없으면 빈 배열)
- payMethod: "계좌입금", "카드", "현금", "체크카드", "신용카드" 중 하나 (알 수 없으면 "계좌입금")
- expenseCategory: 아래 기준으로 판단
  - "선거비용": 선거운동 직접 관련 (인쇄물, 광고, 현수막, 소품, 연설장비, 선거사무원수당 등)
  - "선거비용외": 선거사무소 운영비, 납부금, 숙박비, 차량유지비, 사무용품 등
- expenseType1: 선거비용이면 [인쇄물, 광고, 방송연설, 소품, 거리게시용현수막, 공개장소연설대담, 전화/전자우편/문자메시지, 선거사무관계자, 그밖의선거운동, 선거사무소, 기타] 중 하나
  선거비용외이면 [선거사무소, 납부금, 예비후보자공약집, 기타차량, 후보자등숙박비, 선거운동준비비용, 기타] 중 하나
- expenseType2: expenseType1의 하위 분류 (모르면 빈 문자열)
- 읽을 수 없는 필드는 빈 문자열 또는 0으로`;

export async function POST(request: NextRequest) {
  try {
    const { image, mimeType } = await request.json();

    if (!image || !mimeType) {
      return NextResponse.json(
        { error: "image와 mimeType이 필요합니다." },
        { status: 400 }
      );
    }

    const genAI = getGenAI();
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const result = await model.generateContent([
      EXTRACT_PROMPT,
      {
        inlineData: {
          data: image,
          mimeType,
        },
      },
    ]);

    const text = result.response.text();

    // JSON 추출 (마크다운 코드블록 감싸져 있을 수 있음)
    let jsonStr = text;
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr);

    return NextResponse.json(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
