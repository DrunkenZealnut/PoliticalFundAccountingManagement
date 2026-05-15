/**
 * 선관위 제출 양식 카탈로그.
 *
 * orgSecCd(사용기관 코드)에 따라 필요한 양식 목록이 달라진다.
 * forms/page.tsx의 FORM_GROUPS를 단일 진실원천(SSOT)으로 이동한 모듈.
 *
 * `parityChecked` 필드는 PFund2 공식 출력과 비교 검증 완료 여부를 나타낸다.
 * 미검증 양식은 UI에서 ⚠️ 뱃지로 표시할 수 있다.
 */

import { SUPPORTER_SEC_CDS, CANDIDATE_SEC_CDS } from "./organ-pair";

export type FormCategory =
  | "회계보고"
  | "회계책임자"
  | "예금계좌"
  | "후원회"
  | "보전청구"
  | "지출내역"
  | "기타";

export type FormGenerator =
  | { type: "page"; href: string }
  | { type: "pdf"; endpoint: string }
  | { type: "excel"; endpoint: string }
  | { type: "print"; templateId: string };

export interface SubmissionForm {
  id: string;
  label: string;
  category: FormCategory;
  stage: string;
  /** 화이트리스트. 빈 배열이면 모든 사용기관에서 사용 가능. */
  requiredFor: readonly number[];
  generator: FormGenerator;
  parityChecked: boolean;
  notes?: string;
}

const ALL_ORGS: readonly number[] = [];

const SUPPORTER_LIST: readonly number[] = Array.from(SUPPORTER_SEC_CDS);
const CANDIDATE_LIST: readonly number[] = Array.from(CANDIDATE_SEC_CDS);

/** 후보자 + 후원회 모두에 해당하는 화이트리스트 */
const CANDIDATE_AND_SUPPORTER: readonly number[] = [
  ...CANDIDATE_LIST,
  ...SUPPORTER_LIST,
];

/**
 * 전체 양식 카탈로그.
 *
 * forms/page.tsx의 FORM_GROUPS와 1:1 동기화. 신규 양식 추가는 여기서만.
 */
export const SUBMISSION_FORMS: readonly SubmissionForm[] = [
  // Stage 1: 회계보고서 제출
  {
    id: "audit-opinion",
    label: "감사의견서",
    category: "회계보고",
    stage: "1",
    requiredFor: ALL_ORGS,
    generator: { type: "page", href: "/dashboard/audit" },
    parityChecked: false,
  },
  {
    id: "audit-resolution",
    label: "심사의결서",
    category: "회계보고",
    stage: "1",
    requiredFor: ALL_ORGS,
    generator: { type: "page", href: "/dashboard/audit" },
    parityChecked: false,
  },
  {
    id: "audit-submit",
    label: "회계보고서 제출문서",
    category: "회계보고",
    stage: "1",
    requiredFor: ALL_ORGS,
    generator: { type: "page", href: "/dashboard/audit" },
    parityChecked: false,
  },
  // Stage 2: 회계책임자 관련
  {
    id: "2-1",
    label: "[서식2-1] 회계책임자 선임신고서",
    category: "회계책임자",
    stage: "2",
    requiredFor: ALL_ORGS,
    generator: { type: "print", templateId: "2-1" },
    parityChecked: false,
  },
  {
    id: "2-2",
    label: "[서식2-2] 취임동의서",
    category: "회계책임자",
    stage: "2",
    requiredFor: ALL_ORGS,
    generator: { type: "print", templateId: "2-2" },
    parityChecked: false,
  },
  {
    id: "2-3",
    label: "[서식2-3] 선거비용지출액 약정서",
    category: "회계책임자",
    stage: "2",
    requiredFor: CANDIDATE_LIST,
    generator: { type: "print", templateId: "2-3" },
    parityChecked: false,
    notes: "후보자의 회계책임자에 한함",
  },
  {
    id: "3",
    label: "[서식3] 회계책임자 겸임신고서",
    category: "회계책임자",
    stage: "2",
    requiredFor: ALL_ORGS,
    generator: { type: "print", templateId: "3" },
    parityChecked: false,
  },
  {
    id: "6-1",
    label: "[서식6-1] 회계책임자 변경신고서",
    category: "회계책임자",
    stage: "2",
    requiredFor: ALL_ORGS,
    generator: { type: "print", templateId: "6-1" },
    parityChecked: false,
  },
  // Stage 3: 계좌/인계 관련
  {
    id: "1-1",
    label: "[서식1-1] (예비)후보자의 정치자금 수입과 지출 인계인수서",
    category: "예금계좌",
    stage: "3",
    requiredFor: CANDIDATE_LIST,
    generator: { type: "print", templateId: "1-1" },
    parityChecked: false,
  },
  {
    id: "1-2",
    label: "[서식1-2] 인계인수내역 별지",
    category: "예금계좌",
    stage: "3",
    requiredFor: CANDIDATE_LIST,
    generator: { type: "print", templateId: "1-2" },
    parityChecked: false,
  },
  {
    id: "4",
    label: "[서식4] 예금계좌 신고서",
    category: "예금계좌",
    stage: "3",
    requiredFor: ALL_ORGS,
    generator: { type: "print", templateId: "4" },
    parityChecked: false,
  },
  {
    id: "5",
    label: "[서식5] 예금계좌 변경신고서",
    category: "예금계좌",
    stage: "3",
    requiredFor: ALL_ORGS,
    generator: { type: "print", templateId: "5" },
    parityChecked: false,
  },
  {
    id: "6-2",
    label: "[서식6-2] 회계책임자 변경신고서 첨부서류 (인계인수서)",
    category: "예금계좌",
    stage: "3",
    requiredFor: ALL_ORGS,
    generator: { type: "print", templateId: "6-2" },
    parityChecked: false,
  },
  // Stage 4: 지출내역서
  {
    id: "9",
    label: "[서식9] 정치자금지출 위임장",
    category: "지출내역",
    stage: "4",
    requiredFor: ALL_ORGS,
    generator: { type: "print", templateId: "9" },
    parityChecked: false,
  },
  {
    id: "10",
    label: "[서식10] 회계사무보조자 정치자금 지출내역서",
    category: "지출내역",
    stage: "4",
    requiredFor: ALL_ORGS,
    generator: { type: "print", templateId: "10" },
    parityChecked: false,
  },
  {
    id: "11",
    label: "[서식11] 체크카드 등을 교부받은 자의 정치자금 지출내역서",
    category: "지출내역",
    stage: "4",
    requiredFor: ALL_ORGS,
    generator: { type: "print", templateId: "11" },
    parityChecked: false,
  },
  {
    id: "12-1",
    label: "[서식12-1] (예비)후보자의 선거운동비용 지출내역서",
    category: "지출내역",
    stage: "4",
    requiredFor: CANDIDATE_LIST,
    generator: { type: "print", templateId: "12-1" },
    parityChecked: false,
  },
  {
    id: "12-2",
    label: "[서식12-2] (예비)후보자의 선거운동비용 지출내역서 별지",
    category: "지출내역",
    stage: "4",
    requiredFor: CANDIDATE_LIST,
    generator: { type: "print", templateId: "12-2" },
    parityChecked: false,
  },
  {
    id: "13",
    label: "[서식13] (예비)후보자 선거운동경비 지급 및 잔액 반환",
    category: "지출내역",
    stage: "4",
    requiredFor: CANDIDATE_LIST,
    generator: { type: "print", templateId: "13" },
    parityChecked: false,
  },
  // Stage 5: 보전청구 (이미 머지됨)
  {
    id: "reimbursement-1",
    label: "[서식1] 선거비용 보전청구서",
    category: "보전청구",
    stage: "5",
    requiredFor: CANDIDATE_LIST,
    generator: { type: "page", href: "/dashboard/reimbursement" },
    parityChecked: true, // 최근 머지된 작업에서 검증됨
  },
];

/**
 * orgSecCd에 따라 필요한 양식만 필터링.
 *
 * `requiredFor`가 빈 배열인 양식은 모든 사용기관에 표시.
 * 그 외엔 화이트리스트에 포함된 사용기관에만 표시.
 */
export function getRequiredForms(orgSecCd: number): SubmissionForm[] {
  return SUBMISSION_FORMS.filter(
    (f) =>
      f.requiredFor.length === 0 ||
      f.requiredFor.includes(orgSecCd),
  );
}

/**
 * Stage별로 그룹화된 양식 목록 반환.
 * forms/page.tsx의 렌더링 구조에 직접 사용 가능.
 */
export function getFormsGroupedByStage(
  orgSecCd: number,
): Array<{ stage: string; forms: SubmissionForm[] }> {
  const filtered = getRequiredForms(orgSecCd);
  const stageMap = new Map<string, SubmissionForm[]>();
  for (const form of filtered) {
    const list = stageMap.get(form.stage) ?? [];
    list.push(form);
    stageMap.set(form.stage, list);
  }
  return Array.from(stageMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([stage, forms]) => ({ stage, forms }));
}

/**
 * 양식이 parity 검증되지 않았는지 확인 (UI 뱃지용).
 */
export function getUncheckedForms(orgSecCd: number): SubmissionForm[] {
  return getRequiredForms(orgSecCd).filter((f) => !f.parityChecked);
}

// Re-export 양식 검증 헬퍼: CANDIDATE_AND_SUPPORTER 화이트리스트가 필요할 때 사용
export const FORM_AUDIENCE = {
  CANDIDATE: CANDIDATE_LIST,
  SUPPORTER: SUPPORTER_LIST,
  CANDIDATE_AND_SUPPORTER,
  ALL_ORGS,
} as const;
