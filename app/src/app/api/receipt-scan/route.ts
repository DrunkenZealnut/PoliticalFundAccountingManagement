import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

function getGenAI() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY 환경변수가 설정되지 않았습니다.");
  return new GoogleGenerativeAI(key);
}

export const maxDuration = 60;

const EXTRACT_PROMPT = `이 이미지는 영수증 또는 주문계약서입니다.
이미지에서 아래 정보를 추출하여 JSON으로 반환하세요.

반드시 아래 JSON 형식만 반환하세요. 설명이나 마크다운 없이 순수 JSON만 출력하세요.

{
  "date": "YYYYMMDD 형식의 거래일자",
  "amount": 총금액(숫자만),
  "content": "거래 내역/품목 요약 (50자 이내)",
  "provider": "거래처/상호명",
  "regNum": "사업자번호 (없으면 빈 문자열)",
  "items": [
    { "name": "품목명", "quantity": 수량, "unitPrice": 단가, "amount": 금액 }
  ]
}

규칙:
- date: 영수증에 있는 날짜를 YYYYMMDD 형식으로 변환
- amount: 합계/총액을 숫자만 (콤마, 원 제거)
- content: 주요 품목들을 간략히 나열
- provider: 상호명, 가맹점명, 매장명 등
- regNum: 사업자등록번호 (10자리 숫자, 없으면 "")
- items: 개별 품목 리스트 (없으면 빈 배열)
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
