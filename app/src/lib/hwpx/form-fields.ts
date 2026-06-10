/**
 * HWPX 제출서류 — 서식별 입력 필드/토큰/prefill 소스 정의 (Phase 1, 6종).
 *
 * - 토큰은 `app/public/hwpx-templates/form-{id}.hwpx` 의 `{{토큰}}` 과 1:1 일치해야 한다
 *   (정합성은 `form-fields.test.ts` 가 빌드타임에 검증).
 * - prefill source: organ DB 컬럼 / auth store / 고정값 / 수동입력.
 */

export type FieldType = "text" | "date" | "tel" | "regnum" | "account" | "textarea";

export type PrefillSource =
  | { from: "organ"; column: "org_name" | "rep_name" | "acct_name" | "addr" | "tel" | "reg_num" }
  | { from: "auth"; key: "orgName" | "acctName" }
  | { from: "const"; value: string }
  | { from: "manual" };

export interface HwpxFormField {
  token: string;
  label: string;
  type: FieldType;
  source: PrefillSource;
  /** prefill 후 사용자 수정 허용 (기본 true) */
  editable?: boolean;
  /** 필수 입력 여부 */
  required?: boolean;
}

export type OrgScope = "all" | "candidate" | "supporter";

export interface HwpxFormDef {
  id: string;
  label: string;
  category:
    | "인계인수"
    | "회계책임자"
    | "예금계좌"
    | "후원회"
    | "회계장부"
    | "지급명세서"
    | "증빙정리"
    | "회계보고서"
    | "정치자금영수증"
    | "보전·청구";
  template: string;
  orgScope: OrgScope;
  fields: readonly HwpxFormField[];
  /**
   * 데이터 채움 서식: 일반 토큰 입력 대신 DB 데이터로 표/행을 동적 생성한다.
   * 지정 시 `fields` 는 비고(반복 토큰은 표 내부에서 별도 처리) — 토큰 정합성 검사 제외.
   *  - "income-ledger": 수입내역 → 수입계정별 회계장부 (POST /api/hwpx/income-ledger)
   *  - "accounting-report": 수입·지출·재산 → 회계보고서 22-1/22-3/22-4 (POST /api/hwpx/accounting-report)
   *  - "reimbursement": 보전 체크 선거비용 → 선거비용 보전청구서 서식 43 (POST /api/hwpx/reimbursement-claim).
   *    표(자금원 청구액)는 자동 집계, 일부 텍스트(선거구명·수령계좌 등)는 `fields` 수동 입력(하이브리드).
   */
  dataFill?: "income-ledger" | "accounting-report" | "reimbursement";
}

/* ------------------------------------------------------------------ */
/*  토큰 메타 레지스트리 (중복 정의 방지)                              */
/* ------------------------------------------------------------------ */
type FieldMeta = Omit<HwpxFormField, "token">;

const REG: Record<string, FieldMeta> = {
  선거명: { label: "선거명", type: "text", source: { from: "const", value: "제9회 전국동시지방선거" } },
  선거일: { label: "선거일", type: "date", source: { from: "const", value: "2026-06-03" } },
  선관위명: { label: "관할 선거관리위원회", type: "text", source: { from: "manual" }, required: true },
  후보자명: { label: "(예비)후보자 성명", type: "text", source: { from: "organ", column: "rep_name" }, required: true },
  후보자_주소: { label: "후보자 주소", type: "text", source: { from: "organ", column: "addr" } },
  후보자_전화: { label: "후보자 전화", type: "tel", source: { from: "organ", column: "tel" } },
  선거사무장명: { label: "선거사무장 성명", type: "text", source: { from: "manual" } },
  회계책임자명: { label: "회계책임자 성명", type: "text", source: { from: "organ", column: "acct_name" }, required: true },
  회계책임자명_한자: { label: "회계책임자 성명(한자)", type: "text", source: { from: "manual" } },
  회계책임자_주소: { label: "회계책임자 주소", type: "text", source: { from: "organ", column: "addr" } },
  회계책임자_전화: { label: "회계책임자 전화", type: "tel", source: { from: "organ", column: "tel" } },
  후원회명: { label: "후원회 명칭", type: "text", source: { from: "organ", column: "org_name" }, required: true },
  후원회_약칭: { label: "후원회 약칭", type: "text", source: { from: "organ", column: "org_name" } },
  대표자명: { label: "대표자 성명", type: "text", source: { from: "organ", column: "rep_name" }, required: true },
  대표자_주소: { label: "대표자 주소", type: "text", source: { from: "organ", column: "addr" } },
  대표자_전화: { label: "대표자 전화", type: "tel", source: { from: "organ", column: "tel" } },
  대표자_자택전화: { label: "대표자 자택전화", type: "tel", source: { from: "manual" } },
  대표자_휴대폰: { label: "대표자 휴대폰", type: "tel", source: { from: "manual" } },
  사무소_소재지: { label: "사무소 소재지", type: "text", source: { from: "organ", column: "addr" } },
  사무소_전화: { label: "사무소 전화", type: "tel", source: { from: "organ", column: "tel" } },
  수입계좌_예금주: { label: "수입계좌 예금주", type: "text", source: { from: "manual" } },
  수입계좌_금융기관: { label: "수입계좌 금융기관", type: "text", source: { from: "manual" } },
  수입계좌_번호: { label: "수입계좌 번호", type: "account", source: { from: "manual" } },
  지출계좌_예금주: { label: "지출계좌 예금주", type: "text", source: { from: "manual" } },
  지출계좌_금융기관: { label: "지출계좌 금융기관", type: "text", source: { from: "manual" } },
  지출계좌_번호: { label: "지출계좌 번호", type: "account", source: { from: "manual" } },
  // 선거비용 보전청구서(서식 43) 전용 텍스트 항목
  선거구명: { label: "선거구명", type: "text", source: { from: "manual" }, required: true },
  수령_금융기관: { label: "수령계좌 금융기관", type: "text", source: { from: "manual" } },
  수령_예금주: { label: "수령계좌 예금주", type: "text", source: { from: "manual" } },
  수령_계좌번호: { label: "수령계좌 번호", type: "account", source: { from: "manual" } },
};

function fields(...tokens: string[]): HwpxFormField[] {
  return tokens.map((token) => {
    const meta = REG[token];
    if (!meta) throw new Error(`알 수 없는 토큰: ${token}`);
    return { token, ...meta };
  });
}

/* ------------------------------------------------------------------ */
/*  서식 정의 (Phase 1)                                                */
/* ------------------------------------------------------------------ */
export const HWPX_FORM_DEFS: readonly HwpxFormDef[] = [
  {
    id: "1-1",
    label: "정치자금 수입과 지출 인계·인수서",
    category: "인계인수",
    template: "form-1-1.hwpx",
    orgScope: "candidate",
    fields: fields(
      "선거명", "선거일",
      "후보자명", "후보자_주소", "후보자_전화",
      "회계책임자명", "회계책임자_주소", "회계책임자_전화",
      "선거사무장명",
    ),
  },
  {
    id: "2-1",
    label: "회계책임자 선임신고서",
    category: "회계책임자",
    template: "form-2-1.hwpx",
    orgScope: "all",
    fields: fields(
      "회계책임자명", "회계책임자명_한자", "회계책임자_주소", "회계책임자_전화",
      "수입계좌_예금주", "수입계좌_금융기관", "수입계좌_번호",
      "지출계좌_예금주", "지출계좌_금융기관", "지출계좌_번호",
      "선거명", "후보자명", "선관위명",
    ),
  },
  {
    id: "2-2",
    label: "취임동의서(회계책임자)",
    category: "회계책임자",
    template: "form-2-2.hwpx",
    orgScope: "all",
    fields: fields(
      "회계책임자명", "회계책임자명_한자", "회계책임자_주소", "회계책임자_전화",
      "후보자명",
    ),
  },
  {
    id: "4",
    label: "예금계좌 신고서",
    category: "예금계좌",
    template: "form-4.hwpx",
    orgScope: "all",
    fields: fields(
      "수입계좌_예금주", "수입계좌_금융기관", "수입계좌_번호",
      "지출계좌_예금주", "지출계좌_금융기관", "지출계좌_번호",
      "선거명", "후보자명", "선관위명",
    ),
  },
  {
    id: "27",
    label: "후원회 등록신청서",
    category: "후원회",
    template: "form-27.hwpx",
    orgScope: "supporter",
    fields: fields(
      "후원회명", "후원회_약칭", "선거명",
      "사무소_소재지", "사무소_전화",
      "대표자명", "대표자_주소", "대표자_전화",
      "선관위명",
    ),
  },
  {
    id: "29",
    label: "취임동의서(후원회 대표자)",
    category: "후원회",
    template: "form-29.hwpx",
    orgScope: "supporter",
    fields: fields(
      "대표자명", "대표자_주소", "대표자_자택전화", "대표자_휴대폰",
      "후원회명",
    ),
  },

  /* ----------------------------------------------------------------- */
  /*  회계실무 작성예시 추출 서식 (다운로드용 공식 양식, 토큰 없음)    */
  /*  한글에서 직접 작성하는 회계장부·보고서·명세서·청구서 계열       */
  /* ----------------------------------------------------------------- */
  { id: "7", label: "(예비)후보자 정치자금 수입계정별 회계장부", category: "회계장부", template: "form-7-fill.hwpx", orgScope: "candidate", fields: [], dataFill: "income-ledger" },
  { id: "8", label: "후원회 정치자금 수입계정별 회계장부", category: "회계장부", template: "form-8.hwpx", orgScope: "supporter", fields: [] },
  { id: "20", label: "정치자금 수입·지출부(회계장부 마감)", category: "회계장부", template: "form-20.hwpx", orgScope: "all", fields: [] },
  { id: "14", label: "선거사무관계자 수당·실비 지급명세서", category: "지급명세서", template: "form-14.hwpx", orgScope: "candidate", fields: [] },
  { id: "17", label: "영수증 등 증빙서류 첩부 및 정리", category: "증빙정리", template: "form-17.hwpx", orgScope: "all", fields: [] },
  { id: "22-1", label: "(예비)후보자 회계보고서(수입·지출보고서)", category: "회계보고서", template: "form-22-1-fill.hwpx", orgScope: "candidate", fields: [], dataFill: "accounting-report" },
  { id: "22-2", label: "(예비)후보자 회계보고서(선거비용 지출내역 집계표)", category: "회계보고서", template: "form-22-2-fill.hwpx", orgScope: "candidate", fields: [], dataFill: "accounting-report" },
  { id: "22-3", label: "(예비)후보자 회계보고서(재산명세서)", category: "회계보고서", template: "form-22-3-fill.hwpx", orgScope: "candidate", fields: [], dataFill: "accounting-report" },
  { id: "22-4", label: "(예비)후보자 회계보고서(수입·지출부)", category: "회계보고서", template: "form-22-4-fill.hwpx", orgScope: "candidate", fields: [], dataFill: "accounting-report" },
  { id: "23-1", label: "후원회 회계보고서(제출문서)", category: "회계보고서", template: "form-23-1.hwpx", orgScope: "supporter", fields: [] },
  { id: "23-2", label: "후원회 회계보고서(재산명세서)", category: "회계보고서", template: "form-23-2.hwpx", orgScope: "supporter", fields: [] },
  { id: "23-3", label: "후원회 회계보고서(수입·지출총괄표)", category: "회계보고서", template: "form-23-3.hwpx", orgScope: "supporter", fields: [] },
  { id: "23-4", label: "후원회 회계보고서(수입명세서)", category: "회계보고서", template: "form-23-4.hwpx", orgScope: "supporter", fields: [] },
  { id: "23-5", label: "후원회 회계보고서(지출명세서)", category: "회계보고서", template: "form-23-5.hwpx", orgScope: "supporter", fields: [] },
  { id: "23-6", label: "후원회 회계보고서(영수증)", category: "회계보고서", template: "form-23-6.hwpx", orgScope: "supporter", fields: [] },
  { id: "23-7", label: "후원회 회계보고서(후원금 기부자 명단)", category: "회계보고서", template: "form-23-7.hwpx", orgScope: "supporter", fields: [] },
  { id: "23-8", label: "후원회 회계보고서(고액기부자 명단)", category: "회계보고서", template: "form-23-8.hwpx", orgScope: "supporter", fields: [] },
  { id: "23-9", label: "후원회 회계보고서(감사의견서)", category: "회계보고서", template: "form-23-9.hwpx", orgScope: "supporter", fields: [] },
  { id: "23-10", label: "후원회 회계보고서(영수증 첩부)", category: "회계보고서", template: "form-23-10.hwpx", orgScope: "supporter", fields: [] },
  { id: "23-11", label: "후원회 회계보고서(잔여재산 인계·인수서)", category: "회계보고서", template: "form-23-11.hwpx", orgScope: "supporter", fields: [] },
  { id: "37-2", label: "정치자금영수증 발급신청서", category: "정치자금영수증", template: "form-37-2.hwpx", orgScope: "supporter", fields: [] },
  { id: "38", label: "정치자금영수증 발행·반납대장", category: "정치자금영수증", template: "form-38.hwpx", orgScope: "supporter", fields: [] },
  { id: "43", label: "선거비용 보전청구서", category: "보전·청구", template: "form-43-fill.hwpx", orgScope: "candidate", fields: fields("선거명", "선거구명", "후보자명", "수령_금융기관", "수령_예금주", "수령_계좌번호", "선관위명"), dataFill: "reimbursement" },
  { id: "44", label: "점자형선거공보 등 부담비용 지급청구서", category: "보전·청구", template: "form-44.hwpx", orgScope: "candidate", fields: [] },
];

export function getFormDef(id: string): HwpxFormDef | undefined {
  return HWPX_FORM_DEFS.find((f) => f.id === id);
}

/** 조직 타입(orgType)에 따라 노출할 서식 필터. */
export function formsForOrgType(orgType: string | null): HwpxFormDef[] {
  return HWPX_FORM_DEFS.filter((f) => {
    if (f.orgScope === "all") return true;
    if (orgType === "supporter") return f.orgScope === "supporter";
    return f.orgScope === "candidate";
  });
}
