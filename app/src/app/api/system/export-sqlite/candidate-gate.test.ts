import { describe, it, expect, vi } from "vitest";

// route.ts는 모듈 로드 시 createClient(url,...)를 실행하므로 import 이전에 유효 URL 주입(normalize.test.ts 패턴).
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
});

import { allocateCandidateAccBookForExport } from "./route";

/**
 * FR-02 (V3): export-sqlite 후보자 자금원 게이트가 로컬 const가 아닌 SSOT
 * (FUNDING_SOURCE_BY_ACC_SEC_CD: 82·83·84·85)로 판정되는지 + 동작 보존(TC-5) 검증.
 *   - 후보자(82~85 존재) → 분할 경로 진입(planAllocationPersist).
 *   - 비후보자(후원회 1·2) → 무변경(원본 배열 그대로 반환).
 */
const r = (p: Record<string, unknown>): Record<string, unknown> => ({
  acc_book_id: 1,
  incm_sec_cd: 1,
  acc_sec_cd: 84,
  item_sec_cd: 86,
  acc_amt: 0,
  acc_date: "20260101",
  acc_time: null,
  cust_id: 1,
  ...p,
});

describe("allocateCandidateAccBookForExport — 후보자 자금원 게이트 (FR-02 V3, TC-5)", () => {
  it("후보자(82 지출 부족 → 84 이동) 거래는 분할 경로로 진입한다 (게이트 ON)", () => {
    const rows = [
      r({ acc_book_id: 1, incm_sec_cd: 1, acc_sec_cd: 84, item_sec_cd: 86, acc_amt: 100_000, acc_date: "20260101" }),
      r({ acc_book_id: 2, incm_sec_cd: 1, acc_sec_cd: 82, item_sec_cd: 86, acc_amt: 30_000, acc_date: "20260102" }),
      r({ acc_book_id: 3, incm_sec_cd: 2, acc_sec_cd: 82, item_sec_cd: 86, acc_amt: 50_000, acc_date: "20260103" }),
    ];
    const out = allocateCandidateAccBookForExport(rows);
    // 82 지출 50,000이 82:30,000(잔류) + 84:20,000(이동)으로 분할 → 행 1개 증가.
    expect(out.length).toBe(4);
    expect(
      out.some((x) => Number(x.acc_sec_cd) === 84 && Number(x.incm_sec_cd) === 2 && Number(x.acc_amt) === 20_000),
    ).toBe(true);
    // 총지출 보존(분할은 금액 합 불변).
    expect(out.filter((x) => Number(x.incm_sec_cd) === 2).reduce((s, x) => s + Number(x.acc_amt), 0)).toBe(50_000);
  });

  it("비후보자(후원회 acc_sec_cd 1·2)는 무변경 — 게이트 OFF, 원본 배열 그대로(참조 동일) 반환", () => {
    const rows = [
      r({ acc_book_id: 1, incm_sec_cd: 1, acc_sec_cd: 1, item_sec_cd: 94, acc_amt: 100_000 }),
      r({ acc_book_id: 2, incm_sec_cd: 2, acc_sec_cd: 2, item_sec_cd: 97, acc_amt: 200_000 }),
    ];
    expect(allocateCandidateAccBookForExport(rows)).toBe(rows);
  });

  it("자금원 82·83·84·85 각각이 게이트를 켠다 (SSOT FUNDING_SOURCE_BY_ACC_SEC_CD 키와 일치)", () => {
    for (const src of [82, 83, 84, 85]) {
      const rows = [r({ acc_book_id: 1, incm_sec_cd: 1, acc_sec_cd: src, item_sec_cd: 86, acc_amt: 1000 })];
      // 게이트 ON이면 planAllocationPersist를 통과해 재구성된 새 배열이 반환됨(원본 참조 아님).
      expect(allocateCandidateAccBookForExport(rows)).not.toBe(rows);
    }
  });
});
