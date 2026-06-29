import { describe, it, expect, vi } from "vitest";

// route.ts는 모듈 로드 시 createClient(url,...)를 실행하므로 import 이전에 유효 URL 주입.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
});

import { selectReferencedCustomers } from "./route";
import { buildOrganExport, remapOrgId, type SupabaseOrgan } from "@/lib/accounting/organ-pair";

/**
 * restore 모드 파이프라인 통합 회귀 (FR-08 FK 무결성 + FR-02/03/07).
 *
 * restore는 export-sqlite의 targetExportOrgId(기존 data1=1/data2=2)를 **임의 N**으로 일반화한다.
 * 해피패스(1/2) 단위테스트만으론 일반화 분기가 거짓 안심을 줄 수 있으므로(메모리:
 * parity-test-must-exercise-divergence-condition), 여기선 **N=3(프로그램 실제 ORG_ID)** 으로
 * 갈리는 조건을 실제 트리거해 라우트가 합성하는 단계를 그대로 재현한다:
 *   buildOrganExport(singleOrgId:3) → remapOrgId(accBook) → filterByExportOrgId(===3)
 *   → selectReferencedCustomers → FK orphan 0.
 */

const RESTORE_ORG_ID = 3; // 프로그램이 이 후원회에 부여한 실제 번호(1/2 아님 = divergence)
const SUPABASE_ORG_ID = 21;

const supporter: SupabaseOrgan = {
  org_id: SUPABASE_ORG_ID,
  org_sec_cd: 596, // 기초의회의원 후원회 (페어 자동생성 대상 — singleOrgId가 우회해야 함)
  org_name: "동대문구라선거구구의회의원예비후보자오준석후원회",
  reg_num: "2208280735",
  userid: "oh2026",
  passwd: "pw",
};

// 거래: 이 후원회(org_id=21)만. cust_id 5,7,-999(익명) 참조.
const accBook = (): Record<string, unknown>[] => [
  { acc_book_id: 1, org_id: SUPABASE_ORG_ID, cust_id: 5, acc_amt: 1000, acc_date: "20260408" },
  { acc_book_id: 2, org_id: SUPABASE_ORG_ID, cust_id: 7, acc_amt: 2000, acc_date: "20260409" },
  { acc_book_id: 3, org_id: SUPABASE_ORG_ID, cust_id: -999, acc_amt: 500, acc_date: "20260410" },
  { acc_book_id: 4, org_id: SUPABASE_ORG_ID, cust_id: 5, acc_amt: 300, acc_date: "20260411" },
];

// 거래처: 참조되는 5,7 + 미참조 9(타 기관) + 공유 NULL org.
const customers = (): Record<string, unknown>[] => [
  { cust_id: 5, org_id: SUPABASE_ORG_ID, name: "후원자A" },
  { cust_id: 7, org_id: null, name: "공유거래처" },
  { cust_id: 9, org_id: 99, name: "타기관거래처(미참조)" },
];

describe("restore 파이프라인 — divergence(ORG_ID=3) 통합 회귀", () => {
  it("ORGAN: 정확히 1행, ORG_ID=restoreOrgId, 가짜 후보자 페어 없음", () => {
    const { organRows, orgIdMap } = buildOrganExport(supporter, {
      maskPasswd: false,
      singleOrgId: RESTORE_ORG_ID,
    });
    expect(organRows).toHaveLength(1);
    expect(organRows[0].ORG_ID).toBe(RESTORE_ORG_ID);
    expect(organRows.some((r) => r.ORG_SEC_CD === 90)).toBe(false); // 후보자 미생성(FR-02)
    expect(orgIdMap.get(SUPABASE_ORG_ID)).toBe(RESTORE_ORG_ID);
  });

  it("ACC_BOOK: 모든 거래 org_id가 restoreOrgId로 remap + 필터 통과(건수 보존)", () => {
    const { orgIdMap } = buildOrganExport(supporter, { singleOrgId: RESTORE_ORG_ID });
    const remapped = remapOrgId(accBook(), orgIdMap);
    expect(remapped.every((r) => Number(r.org_id) === RESTORE_ORG_ID)).toBe(true);

    // route.ts filterByExportOrgId(targetExportOrgId=restoreOrgId)와 동일
    const filtered = remapped.filter((r) => Number(r.org_id) === RESTORE_ORG_ID);
    expect(filtered).toHaveLength(accBook().length); // 누락 0
  });

  it("CUSTOMER: 참조 cust_id만 선정 → FK orphan 0 (익명 -999 제외 전부 포함)", () => {
    const { orgIdMap } = buildOrganExport(supporter, { singleOrgId: RESTORE_ORG_ID });
    const finalAccBook = remapOrgId(accBook(), orgIdMap).filter(
      (r) => Number(r.org_id) === RESTORE_ORG_ID,
    );
    const remappedCustomer = remapOrgId(customers(), orgIdMap);
    const selected = selectReferencedCustomers(remappedCustomer, finalAccBook);

    const selectedIds = new Set(selected.map((c) => Number(c.cust_id)));
    // 거래가 참조하는 cust_id 중 익명(-999, SQL로 별도 보장) 제외 전부가 선정돼야 FK orphan 0
    const referenced = new Set(finalAccBook.map((r) => Number(r.cust_id)));
    for (const id of referenced) {
      if (id === -999) continue;
      expect(selectedIds.has(id)).toBe(true);
    }
    // 미참조 거래처(9)는 빠져야 함(불필요 노출 방지)
    expect(selectedIds.has(9)).toBe(false);
    // 공유 거래처(7, org_id=null)도 참조되면 포함 — org_id 필터로 누락되지 않음(FK 고아 방지 회귀)
    expect(selectedIds.has(7)).toBe(true);
  });
});
