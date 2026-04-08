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
  "date": "YYYYMMDD",
  "amount": 숫자,
  "content": "내역 요약 50자 이내",
  "provider": "상호명",
  "regNum": "사업자번호",
  "addr": "주소",
  "items": [{"name":"품목","quantity":수량,"unitPrice":단가,"amount":금액}],
  "expenseCategory": "선거비용 또는 선거비용외",
  "expenseType1": "대분류",
  "expenseType2": "중분류",
  "expenseType3": "소분류",
  "payMethod": "결제수단"
}

■ 기본 규칙:
- date: YYYYMMDD 형식
- amount: 합계/총액/공급가액합계 숫자만
- content: 주요 품목 간략 나열
- provider: 상호명/가맹점명
- regNum: 사업자등록번호 (하이픈 포함 가능, 없으면 "")
- addr: 거래처 주소 (없으면 "")
- payMethod: "계좌입금"|"카드"|"현금"|"체크카드"|"신용카드" (모르면 "계좌입금")

■ 지출유형 분류 (가장 중요 — 아래 트리에서 정확히 선택):

【선거비용】 expenseCategory="선거비용"
├ 인쇄물: 선거벽보(기획/도안료,인쇄비,운송비,기타), 선거공보(기획/도안료,인쇄비,운송비,기타), 선거공약서(기획/도안료,인쇄비,운송비,기타), 후보자사진(촬영비,기타), 명함(인쇄비,기타), 예비후보자홍보물(기획/도안료,인쇄비,우편요금,기타)
├ 광고: 신문광고(광고료,기획/도안료,기타), TV광고(광고료,기획/도안료,제작비,기타), 라디오방송광고(광고료,기획/도안료,제작비,기타), 인터넷광고(광고료,기획/도안료,동영상제작비,배너/팝업제작비,대행수수료,기타)
├ 방송연설: TV방송연설(시설이용료,제작비,기획/도안료,기타), 라디오방송연설(시설이용료,제작비,기획/도안료,기타)
├ 소품: 어깨띠(제작비,기타), 윗옷(구입비,기호등인쇄비,기타), 모자(구입비,기호등인쇄비,기타), 소품(구입/임차비,기타)
├ 거리게시용현수막: 거리게시용현수막(제작비,이동게시비,장비임차료,기타)
├ 공개장소연설대담: 차량(임차비,유류비,기사인부임,기타), 무대연단(설치/철거비,홍보물설치관련,기획/도안료,기타), 확성장치(차량용임차비,휴대용임차비,기타), 래핑비(설치/철거비,기타), 발전기(발전기임차비,인버터임차비,기타), 녹화기(LED전광판임차비,녹화물제작비,기타), 로고송(제작비,저작권료,인격권료,기타), 수화통역자(인건비,기타), 그밖의선거운동(녹음기,LED문자전광판/간판,기타)
├ 전화/전자우편/문자메시지: 전화/인터넷포함(설치비,통화요금,임차비,기타), 문자메시지(발송비,장비임차료,기타), 전자우편(발송비,SNS전송용동영상제작비,기타)
├ 선거사무관계자: 선거사무관계자수당(선거사무장,선거연락소장,회계책임자,선거사무원,활동보조인), 동행자식대(식대)
├ 그밖의선거운동: 그밖의선거운동(홈페이지개설운영비,인터넷홈페이지/문비발급,기타)
├ 선거사무소: 간판(제작비,장비임차,기타), 현판(제작비,기타), 현수막(제작비,장비임차,로프이용료,기타), 유지비용(수도요금,전기요금,기타), 옥상구조물(제작비,기타)
└ 기타: 위법비용(위법비용)

【선거비용외】 expenseCategory="선거비용외"
├ 선거사무소: 임차보증금, 사무집기류임차비, 소모품구입비, 내외부설치유지비, 인건비, 개소식관련(다과비,초대장발송비,기타), 기타, 유지비용(관리비)
├ 납부금: 기탁금, 세대부명단교부비, 기타
├ 예비후보자공약집: 예비후보자공약집
├ 기타차량: 선거벽보/공보/공약서부착차량(임차비,유류비,기사인건비,기타), 후보자승용자동차(임차비,유류비,기사인건비,기타)
├ 후보자등숙박비: 숙박비
├ 선거운동준비비용: 컨설팅비용, 여론조사비용, 기타
└ 기타: 기타

expenseType1=대분류(├ 앞 항목), expenseType2=중분류(괄호 앞 항목), expenseType3=소분류(괄호 안 항목)
중분류에 소분류가 없으면 expenseType3=""
영수증 맥락(품목명, 업종, 거래 성격)을 종합하여 가장 적합한 분류를 선택하세요.

■ 예시:
- 폼보드/현수막 제작 → 선거비용, 소품, 소품, 구입/임차비
- 봉투 인쇄/우편발송 → 선거비용, 인쇄물, 예비후보자홍보물, 우편요금
- 사무실 전기요금 → 선거비용외, 선거사무소, 유지비용, 관리비
- 명함 인쇄 → 선거비용, 인쇄물, 명함, 인쇄비
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
