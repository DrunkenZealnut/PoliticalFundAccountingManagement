"use client";

import { useState, useCallback } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";

interface UndoRecord {
  bak_id: number;
  work_kind: number; // 1=수정, 2=삭제
  acc_book_id: number;
  org_id: number;
  incm_sec_cd: number;
  acc_sec_cd: number;
  item_sec_cd: number;
  exp_sec_cd: number;
  cust_id: number;
  acc_date: string;
  content: string;
  acc_amt: number;
  rcp_yn: string;
  rcp_no: string | null;
}

const MAX_UNDO = 100;

/**
 * Undo hook using acc_book_bak table.
 * Supports restoring modified (work_kind=1) and deleted (work_kind=2) records.
 * Limited to MAX_UNDO (100) records per login session.
 */
export function useUndo(orgId: number | null, onRestore: () => void) {
  const [undoCount, setUndoCount] = useState(0);
  const [undoing, setUndoing] = useState(false);

  const performUndo = useCallback(async () => {
    if (!orgId || undoing) return;
    setUndoing(true);

    const supabase = createSupabaseBrowser();

    // Get the most recent backup record for this org
    const { data: bakRecords } = await supabase
      .from("acc_book_bak")
      .select("*")
      .eq("org_id", orgId)
      .order("bak_id", { ascending: false })
      .limit(1);

    if (!bakRecords || bakRecords.length === 0) {
      alert("복구할 자료가 없습니다.");
      setUndoing(false);
      return;
    }

    if (undoCount >= MAX_UNDO) {
      alert(`복구 허용 건수(${MAX_UNDO}건)를 초과하였습니다.`);
      setUndoing(false);
      return;
    }

    const bak = bakRecords[0] as UndoRecord;

    try {
      if (bak.work_kind === 2) {
        // 삭제된 레코드 복원: re-insert
        const { error } = await supabase.from("acc_book").insert({
          org_id: bak.org_id,
          incm_sec_cd: bak.incm_sec_cd,
          acc_sec_cd: bak.acc_sec_cd,
          item_sec_cd: bak.item_sec_cd,
          exp_sec_cd: bak.exp_sec_cd,
          cust_id: bak.cust_id,
          acc_date: bak.acc_date,
          content: bak.content,
          acc_amt: bak.acc_amt,
          rcp_yn: bak.rcp_yn,
          rcp_no: bak.rcp_no,
        });
        if (error) throw error;
      } else if (bak.work_kind === 1) {
        // 수정된 레코드 복원: update back to original
        const { error } = await supabase
          .from("acc_book")
          .update({
            incm_sec_cd: bak.incm_sec_cd,
            acc_sec_cd: bak.acc_sec_cd,
            item_sec_cd: bak.item_sec_cd,
            exp_sec_cd: bak.exp_sec_cd,
            cust_id: bak.cust_id,
            acc_date: bak.acc_date,
            content: bak.content,
            acc_amt: bak.acc_amt,
            rcp_yn: bak.rcp_yn,
            rcp_no: bak.rcp_no,
          })
          .eq("acc_book_id", bak.acc_book_id);
        if (error) throw error;
      }

      // Remove the used backup record
      await supabase.from("acc_book_bak").delete().eq("bak_id", bak.bak_id);

      setUndoCount((c) => c + 1);
      onRestore();
    } catch (err) {
      alert(`복구 실패: ${err instanceof Error ? err.message : "오류"}`);
    } finally {
      setUndoing(false);
    }
  }, [orgId, undoCount, undoing, onRestore]);

  return { performUndo, undoCount, undoing, canUndo: undoCount < MAX_UNDO };
}
