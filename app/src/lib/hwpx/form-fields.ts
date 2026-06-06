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
  category: "인계인수" | "회계책임자" | "예금계좌" | "후원회";
  template: string;
  orgScope: OrgScope;
  fields: readonly HwpxFormField[];
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
];

export function getFormDef(id: string): HwpxFormDef | undefined {
  return HWPX_FORM_DEFS.find((f) => f.id === id);
}

/** 조직 타입(orgType)에 따라 노출할 서식 필터. */
export function formsForOrgType(orgType: string | null): HwpxFormDef[] {
  const isSupporter = orgType === "supporter";
  return HWPX_FORM_DEFS.filter((f) =>
    f.orgScope === "all" || (isSupporter ? f.orgScope === "supporter" : f.orgScope === "candidate")
  );
}
