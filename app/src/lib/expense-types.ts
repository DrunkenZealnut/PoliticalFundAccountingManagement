/* ------------------------------------------------------------------ */
/*  3-level expense type data (지출유형 3단계)                          */
/* ------------------------------------------------------------------ */

export interface ExpType2 {
  label: string;
  level3: string[];
}

export interface ExpType1 {
  label: string;
  level2: ExpType2[];
}

// 선거비용 지출유형 (원본 프로그램 반영)
export const ELECTION_EXP_TYPES: ExpType1[] = [
  {
    label: "인쇄물",
    level2: [
      { label: "선거벽보", level3: ["기획/도안료", "인쇄비", "운송비", "기타"] },
      { label: "선거공보", level3: ["기획/도안료", "인쇄비", "운송비", "기타"] },
      { label: "선거공약서", level3: ["기획/도안료", "인쇄비", "운송비", "기타"] },
      { label: "후보자사진", level3: ["촬영비", "기타"] },
      { label: "명함", level3: ["인쇄비", "기타"] },
      { label: "예비후보자홍보물", level3: ["기획/도안료", "인쇄비", "우편요금", "기타"] },
    ],
  },
  {
    label: "광고",
    level2: [
      { label: "신문광고", level3: ["광고료", "기획/도안료", "기타"] },
      { label: "TV광고", level3: ["광고료", "기획/도안료", "제작비", "기타"] },
      { label: "라디오방송광고", level3: ["광고료", "기획/도안료", "제작비", "기타"] },
      { label: "인터넷광고", level3: ["광고료", "기획/도안료", "동영상제작비", "배너/팝업제작비", "대행수수료", "기타"] },
    ],
  },
  {
    label: "방송연설",
    level2: [
      { label: "TV방송연설", level3: ["시설이용료", "제작비", "기획/도안료", "기타"] },
      { label: "라디오방송연설", level3: ["시설이용료", "제작비", "기획/도안료", "기타"] },
    ],
  },
  {
    label: "소품",
    level2: [
      { label: "어깨띠", level3: ["제작비", "기타"] },
      { label: "윗옷", level3: ["구입비", "기호등인쇄비", "기타"] },
      { label: "모자", level3: ["구입비", "기호등인쇄비", "기타"] },
      { label: "소품", level3: ["구입/임차비", "기타"] },
    ],
  },
  {
    label: "거리게시용현수막",
    level2: [
      { label: "거리게시용현수막", level3: ["제작비", "이동게시비", "장비임차료", "기타"] },
    ],
  },
  {
    label: "공개장소연설대담",
    level2: [
      { label: "차량", level3: ["임차비", "유류비", "기사인부임", "임차비(유류비/기사인부임포함)", "기타"] },
      { label: "무대연단", level3: ["설치/철거비", "홍보물설치관련", "기획/도안료", "기타"] },
      { label: "확성장치", level3: ["차량용임차비", "휴대용임차비", "기타"] },
      { label: "래핑비", level3: ["설치/철거비", "기타"] },
      { label: "발전기", level3: ["발전기임차비", "인버터임차비", "기타"] },
      { label: "녹화기", level3: ["LED전광판임차비", "녹화물제작비", "녹화물기획도안료", "기타"] },
      { label: "로고송", level3: ["제작비", "저작권료", "인격권료", "기타"] },
      { label: "수화통역자", level3: ["인건비", "기타"] },
      { label: "그밖의선거운동", level3: ["녹음기", "LED문자전광판/간판", "기타"] },
    ],
  },
  {
    label: "전화/전자우편/문자메시지",
    level2: [
      { label: "전화/인터넷포함", level3: ["설치비", "통화요금", "임차비", "기타"] },
      { label: "문자메시지", level3: ["발송비", "장비임차료", "기타"] },
      { label: "전자우편", level3: ["발송비", "SNS전송용동영상제작비", "기타"] },
    ],
  },
  {
    label: "선거사무관계자",
    level2: [
      { label: "선거사무관계자수당", level3: ["선거사무장", "선거연락소장", "회계책임자", "선거사무원", "활동보조인"] },
      { label: "동행자식대", level3: ["식대"] },
    ],
  },
  {
    label: "그밖의선거운동",
    level2: [
      { label: "그밖의선거운동", level3: ["홈페이지개설운영비", "인터넷홈페이지/문비발급", "기타"] },
    ],
  },
  {
    label: "선거사무소",
    level2: [
      { label: "간판", level3: ["제작비", "장비임차", "기타"] },
      { label: "현판", level3: ["제작비", "기타"] },
      { label: "현수막", level3: ["제작비", "장비임차", "로프이용료", "기타"] },
      { label: "유지비용", level3: ["수도요금", "전기요금", "기타"] },
      { label: "옥상구조물", level3: ["제작비", "기타"] },
    ],
  },
  {
    label: "기타",
    level2: [
      { label: "위법비용", level3: ["위법비용"] },
    ],
  },
];

// 선거비용외 지출유형 (원본 프로그램 반영)
export const NON_ELECTION_EXP_TYPES: ExpType1[] = [
  {
    label: "선거사무소",
    level2: [
      { label: "임차보증금", level3: [] },
      { label: "사무집기류임차비", level3: [] },
      { label: "소모품구입비", level3: [] },
      { label: "내외부설치유지비", level3: [] },
      { label: "인건비", level3: [] },
      { label: "개소식관련", level3: ["다과비", "초대장발송비", "기타"] },
      { label: "기타", level3: [] },
      { label: "유지비용", level3: ["관리비"] },
    ],
  },
  {
    label: "납부금",
    level2: [
      { label: "기탁금", level3: [] },
      { label: "세대부명단교부비", level3: [] },
      { label: "기타", level3: [] },
    ],
  },
  {
    label: "예비후보자공약집",
    level2: [
      { label: "예비후보자공약집", level3: [] },
    ],
  },
  {
    label: "기타차량",
    level2: [
      { label: "선거벽보/공보/공약서부착차량", level3: ["임차비", "유류비", "기사인건비", "기타"] },
      { label: "후보자승용자동차", level3: ["임차비", "유류비", "기사인건비", "기타"] },
    ],
  },
  {
    label: "후보자등숙박비",
    level2: [
      { label: "숙박비", level3: [] },
    ],
  },
  {
    label: "선거운동준비비용",
    level2: [
      { label: "컨설팅비용", level3: [] },
      { label: "여론조사비용", level3: [] },
      { label: "기타", level3: [] },
    ],
  },
  {
    label: "기타",
    level2: [
      { label: "기타", level3: [] },
    ],
  },
];

/** 과목명으로 지출유형 데이터 반환 */
export function getExpTypeData(itemName: string): ExpType1[] {
  if (itemName.includes("선거비용외")) return NON_ELECTION_EXP_TYPES;
  if (itemName.includes("선거비용")) return ELECTION_EXP_TYPES;
  return [];
}

/**
 * 지출유형 대분류(expGroup1)로 과목 카테고리 판별
 * "선거비용" | "선거비용외" | null (양쪽 모두 존재하거나 없는 경우)
 */
export function detectItemCategory(expGroup1: string): "선거비용" | "선거비용외" | null {
  if (!expGroup1) return null;
  const inElection = ELECTION_EXP_TYPES.some((t) => t.label === expGroup1);
  const inNonElection = NON_ELECTION_EXP_TYPES.some((t) => t.label === expGroup1);
  // 양쪽 모두에 있으면 판별 불가 (선거사무소, 기타)
  if (inElection && inNonElection) return null;
  if (inElection) return "선거비용";
  if (inNonElection) return "선거비용외";
  return null;
}

export const PAY_METHODS = [
  { value: "118", label: "계좌입금" },
  { value: "119", label: "카드" },
  { value: "120", label: "현금" },
  { value: "583", label: "수표" },
  { value: "584", label: "신용카드" },
  { value: "585", label: "체크카드" },
  { value: "121", label: "미지급" },
  { value: "122", label: "기타" },
];
