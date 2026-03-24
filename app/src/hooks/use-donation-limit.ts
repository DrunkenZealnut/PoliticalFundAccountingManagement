"use client";

import { useCallback } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { useCodeValues } from "@/hooks/use-code-values";

export interface LimitCheckResult {
  isOverLimit: boolean;
  warnings: string[];
}

/**
 * Hook for checking donation (후원금) limits.
 *
 * Rules from CODEVALUE:
 *   CS_ID=14, CV_ID=117: 익명후원금 1회 한도 (10만원)
 *   CS_ID=13: 기부제한액 (1회/연간 한도)
 *   기명후원금 30만원 초과 시 경고 (이름/주소 공개 대상)
 */
export function useDonationLimit() {
  const { getByCategory } = useCodeValues();

  const checkLimit = useCallback(
    async (params: {
      orgId: number;
      custId: number;
      itemSecCd: number;
      amount: number;
      accDate: string;
    }): Promise<LimitCheckResult> => {
      const warnings: string[] = [];
      const { orgId, custId, itemSecCd, amount } = params;

      // === 1. 익명후원금 1회 한도 ===
      // item_sec_cd for 익명후원금 varies by org type (check name)
      // CV_ID=117 = 10만원 limit
      const anonLimitCodes = getByCategory(14); // CS_ID=14: 익명후원금 한도
      const anonLimit = anonLimitCodes.length > 0
        ? parseInt(anonLimitCodes[0].cv_etc || "100000", 10)
        : 100000;

      // 익명후원금 과목 (CV_ID that contains "익명" in name)
      // Typical: item_sec_cd values for anonymous donations
      const isAnonymous = itemSecCd === 16 || itemSecCd === 96; // 익명후원금 codes
      if (isAnonymous && Math.abs(amount) > anonLimit) {
        warnings.push(
          `익명후원금 1회 한도(${anonLimit.toLocaleString()}원)를 초과합니다. ` +
          `입력금액: ${Math.abs(amount).toLocaleString()}원`
        );
      }

      // === 2. 기명후원금 30만원 초과 경고 (공개 대상) ===
      const isNamedDonation = itemSecCd === 15 || itemSecCd === 95; // 기명후원금 codes
      if (isNamedDonation && Math.abs(amount) > 300000) {
        warnings.push(
          `기명후원금 1회 30만원 초과 시 기부자 정보가 공개됩니다. ` +
          `입력금액: ${Math.abs(amount).toLocaleString()}원`
        );
      }

      // === 3. 동일 기부자 연간 한도 체크 ===
      if (custId > 0 && (isNamedDonation || isAnonymous)) {
        const supabase = createSupabaseBrowser();
        const year = params.accDate.replace(/-/g, "").slice(0, 4);

        const { data: yearData } = await supabase
          .from("acc_book")
          .select("acc_amt")
          .eq("org_id", orgId)
          .eq("cust_id", custId)
          .eq("incm_sec_cd", 1)
          .gte("acc_date", `${year}0101`)
          .lte("acc_date", `${year}1231`);

        if (yearData) {
          const yearTotal = yearData.reduce((s, r) => s + r.acc_amt, 0) + amount;

          // 기부제한액 코드 조회
          const limitCodes = getByCategory(13); // CS_ID=13: 기부제한액
          const annualLimit = limitCodes.length > 0
            ? parseInt(limitCodes[0].cv_etc || "5000000", 10)
            : 5000000;

          if (yearTotal > annualLimit) {
            warnings.push(
              `해당 기부자의 연간 후원금 합계가 한도(${annualLimit.toLocaleString()}원)를 초과합니다. ` +
              `연간 합계: ${yearTotal.toLocaleString()}원 (기존 ${(yearTotal - amount).toLocaleString()}원 + 금회 ${amount.toLocaleString()}원)`
            );
          }
        }
      }

      return {
        isOverLimit: warnings.length > 0,
        warnings,
      };
    },
    [getByCategory]
  );

  return { checkLimit };
}
