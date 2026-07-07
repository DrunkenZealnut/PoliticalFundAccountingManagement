/* ------------------------------------------------------------------ */
/*  제출 마법사 트랙별 서식 집합 — form-fields SSOT 필터만(정의 이중화 금지) */
/*                                                                    */
/*  보고서 트랙: 회계장부+회계보고서 category. 후보자는 데이터 채움        */
/*  (dataFill: 서식7·22-1~4), 후원회/정당은 빈 양식(서식8·20·23-x) —      */
/*  "정직한 모두"(설계 §0.2): 어떤 서식이 자동 채움인지 f.dataFill 로 구분. */
/*                                                                    */
/*  보전 트랙: 후보자 전용(선거비용 보전은 후보자만 청구). 서식43+보전목록. */
/*  서식44(점자형 부담비용)는 별도 수동 청구라 마법사 세트에서 제외.        */
/* ------------------------------------------------------------------ */
import {
  HWPX_FORM_DEFS,
  formsForOrgType,
  type HwpxFormDef,
} from "@/lib/hwpx/form-fields";

const REPORT_CATEGORIES: ReadonlySet<HwpxFormDef["category"]> = new Set([
  "회계장부",
  "회계보고서",
]);

/**
 * 보고서 트랙 서식 집합(orgType 별). 기존 submission-forms 페이지와 동일한
 * `formsForOrgType` 스코프 규칙(supporter 외 orgType 은 candidate 스코프)을 재사용한다.
 */
export function reportFormsFor(orgType: string | null): HwpxFormDef[] {
  return formsForOrgType(orgType).filter((f) => REPORT_CATEGORIES.has(f.category));
}

/**
 * 보전 트랙 서식 집합 — candidate 만 비어있지 않다.
 * 서식43(보전청구서)·보전목록(첨부서류)만: dataFill 이 보전 계열인 서식.
 */
export function reimburseFormsFor(orgType: string | null): HwpxFormDef[] {
  if (orgType !== "candidate") return [];
  return HWPX_FORM_DEFS.filter(
    (f) => f.dataFill === "reimbursement" || f.dataFill === "reimbursement-doclist",
  );
}
