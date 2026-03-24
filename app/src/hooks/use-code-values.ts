"use client";

import { useCallback, useSyncExternalStore } from "react";

export interface CodeValue {
  cv_id: number;
  cs_id: number;
  cv_name: string;
  cv_order: number;
  cv_etc: string | null;
  cv_etc2: string | null;
}

export interface AccRel {
  acc_rel_id: number;
  org_sec_cd: number;
  incm_sec_cd: number;
  acc_sec_cd: number;
  item_sec_cd: number;
  exp_sec_cd: number;
  input_yn: string;
  acc_order: number;
}

interface CodeStore {
  codeValues: CodeValue[];
  accRels: AccRel[];
  loading: boolean;
}

// External store for code values
let store: CodeStore = { codeValues: [], accRels: [], loading: true };
let listeners: Array<() => void> = [];
let fetchStarted = false;

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

function fetchCodeData() {
  // Use server API route (bypasses RLS via service role key)
  fetch("/api/codes")
    .then((res) => res.json())
    .then((data) => {
      store = {
        codeValues: data.codeValues || [],
        accRels: data.accRels || [],
        loading: false,
      };
      emitChange();
    })
    .catch(() => {
      // Fallback: retry after delay
      if (retryCount < 3) {
        retryCount++;
        setTimeout(fetchCodeData, 2000);
      } else {
        store = { codeValues: [], accRels: [], loading: false };
        emitChange();
      }
    });
}

let retryCount = 0;

function subscribe(listener: () => void) {
  listeners = [...listeners, listener];
  if (!fetchStarted) {
    fetchStarted = true;
    fetchCodeData();
  }
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function getSnapshot(): CodeStore {
  return store;
}

function getServerSnapshot(): CodeStore {
  return { codeValues: [], accRels: [], loading: true };
}

export function useCodeValues() {
  const { codeValues, accRels, loading } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );

  /** Get code values by category (cs_id) */
  const getByCategory = useCallback(
    (csId: number): CodeValue[] => {
      return codeValues.filter((cv) => cv.cs_id === csId);
    },
    [codeValues]
  );

  /** Look up a single code name by cv_id */
  const getName = useCallback(
    (cvId: number): string => {
      return codeValues.find((cv) => cv.cv_id === cvId)?.cv_name || String(cvId);
    },
    [codeValues]
  );

  /** Get valid account codes (acc_sec_cd) for a given org type + income/expense */
  const getAccounts = useCallback(
    (orgSecCd: number, incmSecCd: number): CodeValue[] => {
      const validCds = [
        ...new Set(
          accRels
            .filter((r) => r.org_sec_cd === orgSecCd && r.incm_sec_cd === incmSecCd)
            .map((r) => r.acc_sec_cd)
        ),
      ];
      return codeValues
        .filter((cv) => validCds.includes(cv.cv_id))
        .sort((a, b) => a.cv_order - b.cv_order);
    },
    [codeValues, accRels]
  );

  /** Get valid item codes (item_sec_cd) for a given org type + income/expense + account */
  const getItems = useCallback(
    (orgSecCd: number, incmSecCd: number, accSecCd: number): CodeValue[] => {
      const validCds = [
        ...new Set(
          accRels
            .filter(
              (r) =>
                r.org_sec_cd === orgSecCd &&
                r.incm_sec_cd === incmSecCd &&
                r.acc_sec_cd === accSecCd
            )
            .map((r) => r.item_sec_cd)
        ),
      ];
      return codeValues
        .filter((cv) => validCds.includes(cv.cv_id))
        .sort((a, b) => a.cv_order - b.cv_order);
    },
    [codeValues, accRels]
  );

  /** Get valid expense categories (exp_sec_cd) for a given org type + account + item */
  const getExpenseCategories = useCallback(
    (orgSecCd: number, accSecCd: number, itemSecCd: number): CodeValue[] => {
      const validCds = [
        ...new Set(
          accRels
            .filter(
              (r) =>
                r.org_sec_cd === orgSecCd &&
                r.incm_sec_cd === 2 &&
                r.acc_sec_cd === accSecCd &&
                r.item_sec_cd === itemSecCd &&
                r.exp_sec_cd !== 0
            )
            .map((r) => r.exp_sec_cd)
        ),
      ];
      return codeValues
        .filter((cv) => validCds.includes(cv.cv_id))
        .sort((a, b) => a.cv_order - b.cv_order);
    },
    [codeValues, accRels]
  );

  return {
    codeValues,
    accRels,
    loading,
    getByCategory,
    getName,
    getAccounts,
    getItems,
    getExpenseCategories,
  };
}
