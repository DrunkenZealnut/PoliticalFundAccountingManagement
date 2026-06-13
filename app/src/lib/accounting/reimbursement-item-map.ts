/* ------------------------------------------------------------------ */
/*  지출유형(expense-types) → 선거비용 보전 항목(공직선거법 조항) 매핑    */
/*                                                                    */
/*  「선거비용 보전 첨부서류목록」의 7개 보전 항목 분류 SSOT.            */
/*  acc_book.exp_group1_cd(=ELECTION_EXP_TYPES level1 label)·          */
/*  exp_group2_cd(=level2 label) 의 (level1, level2) 조합을 보전 항목   */
/*  key 로 매핑한다(명시 allowlist).                                   */
/*                                                                    */
/*  왜 detectItemCategory 가 아닌가:                                   */
/*   "선거사무소"·"유지비용" 은 ELECTION·NON_ELECTION 양쪽에 존재해     */
/*   detectItemCategory 가 null(판별불가) 을 반환한다. 따라서 보전 항목  */
/*   판별을 detectItemCategory 에 의존하지 않고 (level1,level2) 명시    */
/*   allowlist 로 한다. 이 맵에 든 조합은 정의상 선거비용 보전 항목.    */
/*  (메모리 election-item-classification-ssot 준수, React/IO 비의존.)   */
/* ------------------------------------------------------------------ */

export interface ReimbItem {
  key: string;
  name: string;
  law: string;
}

/** 7개 보전 항목 (출력/그룹 순서 = 배열 순서). 샘플 문서 7개 고정. */
export const REIMB_ITEMS: readonly ReimbItem[] = [
  { key: "signboard", name: "선거사무소 등 간판·현판·현수막", law: "법 제61조" },
  { key: "street_banner", name: "거리게시용 현수막", law: "법 제67조" },
  { key: "props", name: "어깨띠 등 소품", law: "법 제68조" },
  { key: "speech_vehicle", name: "공개장소 연설·대담차량", law: "법 제79조" },
  { key: "sms", name: "문자메시지", law: "법 제82조의5" },
  { key: "namecard", name: "명함", law: "법 제93조" },
  { key: "poster_bulletin", name: "선거벽보·선거공보", law: "법 제64조·제65조" },
] as const;

/** 미분류(7개 항목 외 보전 체크 지출)를 표기할 그룹. */
export const REIMB_ETC: ReimbItem = { key: "etc", name: "기타/미분류", law: "" };

/**
 * (exp_group1 label, exp_group2 label) → 보전 항목 key 명시 allowlist.
 * level2 값이 "*" 인 항목은 level1 전체가 해당(단일 level2 항목).
 */
const MAP: Record<string, Record<string, string>> = {
  // §61 간판·현판·현수막 (사무소 "유지비용" 은 운영비라 제외 — 양쪽 존재로 모호)
  선거사무소: { 간판: "signboard", 현판: "signboard", 현수막: "signboard", 옥상구조물: "signboard" },
  // §67 거리게시용 현수막 (level1 전체)
  거리게시용현수막: { "*": "street_banner" },
  // §68 어깨띠 등 소품
  소품: { 어깨띠: "props", 윗옷: "props", 모자: "props", 소품: "props" },
  // §79 공개장소 연설·대담차량 (level1 전체)
  공개장소연설대담: { "*": "speech_vehicle" },
  // §82의5 문자메시지 (전화/전자우편은 조항이 달라 제외 — 샘플 7항목 정합)
  "전화/전자우편/문자메시지": { 문자메시지: "sms" },
  // §93 명함 / §64·65 선거벽보·선거공보·선거공약서 (둘 다 인쇄물 level1)
  인쇄물: {
    명함: "namecard",
    선거벽보: "poster_bulletin",
    선거공보: "poster_bulletin",
    선거공약서: "poster_bulletin",
  },
};

/**
 * 지출유형 (level1, level2) → 보전 항목 key. 미매핑 시 null.
 * @param expGroup1 acc_book.exp_group1_cd (level1 label)
 * @param expGroup2 acc_book.exp_group2_cd (level2 label)
 */
export function mapReimbItemKey(expGroup1: string | null, expGroup2: string | null): string | null {
  const g1 = MAP[expGroup1 ?? ""];
  if (!g1) return null;
  return g1["*"] ?? g1[expGroup2 ?? ""] ?? null;
}
