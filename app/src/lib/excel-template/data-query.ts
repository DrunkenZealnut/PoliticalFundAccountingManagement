import { createClient } from "@supabase/supabase-js";
import { adjustNegativeIncome } from "@/lib/accounting/adjust-negative-income";
import type {
  ReportRequest,
  IncomeExpenseReportData,
  AccountRow,
  LedgerRow,
} from "./types";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { db: { schema: "pfam" } },
);

// Code name cache
let codeCache: Record<number, string> | null = null;
async function getCodeNames(): Promise<Record<number, string>> {
  if (codeCache) return codeCache;
  const { data } = await supabase.from("codevalue").select("cv_id, cv_name");
  codeCache = {};
  for (const r of data || []) codeCache[r.cv_id] = r.cv_name;
  return codeCache;
}

/**
 * 조직 기본 정보 조회
 */
async function getOrganInfo(orgId: string) {
  const { data } = await supabase
    .from("organ")
    .select("org_name, org_sec_cd, acct_name, election_name, district_name")
    .eq("org_id", Number(orgId))
    .single();
  return data;
}

/**
 * T1: 수입지출보고서 데이터 조회
 * acc_book에서 계정별 수입/지출 합계를 집계
 */
export async function queryIncomeExpenseReport(
  req: ReportRequest,
): Promise<IncomeExpenseReportData> {
  const organ = await getOrganInfo(req.orgId);
  const codes = await getCodeNames();

  // 모든 거래 조회
  let reportQuery = supabase
    .from("acc_book")
    .select("acc_sec_cd, item_sec_cd, incm_sec_cd, acc_amt")
    .eq("org_id", Number(req.orgId));
  if (req.dateFrom) reportQuery = reportQuery.gte("acc_date", req.dateFrom);
  if (req.dateTo) reportQuery = reportQuery.lte("acc_date", req.dateTo);
  const { data: rawRecords } = await reportQuery;

  // 음수 수입 → 지출 전환 (선관위 보고서 정합성)
  const records = adjustNegativeIncome(rawRecords || []);

  // 계정별 집계
  const accGroups: Record<
    string,
    { income: number; expElection: number; expNonElection: number }
  > = {};

  for (const r of records || []) {
    const accName = codes[r.acc_sec_cd] || String(r.acc_sec_cd);
    const itemName = codes[r.item_sec_cd] || "";
    const isIncome = r.incm_sec_cd === 1;

    if (!accGroups[accName]) {
      accGroups[accName] = { income: 0, expElection: 0, expNonElection: 0 };
    }

    if (isIncome) {
      accGroups[accName].income += r.acc_amt || 0;
    } else {
      const isElection = itemName.includes("선거비용") && !itemName.includes("외");
      if (isElection) {
        accGroups[accName].expElection += r.acc_amt || 0;
      } else {
        accGroups[accName].expNonElection += r.acc_amt || 0;
      }
    }
  }

  function makeRow(accName: string): AccountRow {
    const g = accGroups[accName] || { income: 0, expElection: 0, expNonElection: 0 };
    const expSubtotal = g.expElection + g.expNonElection;
    return {
      income: g.income,
      expElection: g.expElection,
      expNonElection: g.expNonElection,
      expSubtotal,
      balance: g.income - expSubtotal,
    };
  }

  // 계정명으로 매핑 (코드값에 따라 유연하게)
  const assetKeys = Object.keys(accGroups).filter(
    (k) => k.includes("자산") || k.includes("후보자"),
  );
  const donationKeys = Object.keys(accGroups).filter(
    (k) => k.includes("기부금") || k.includes("후원"),
  );
  const subsidyKeys = Object.keys(accGroups).filter((k) => k.includes("보조금"));

  const asset = assetKeys.reduce(
    (acc, k) => {
      const r = makeRow(k);
      return {
        income: acc.income + r.income,
        expElection: acc.expElection + r.expElection,
        expNonElection: acc.expNonElection + r.expNonElection,
        expSubtotal: acc.expSubtotal + r.expSubtotal,
        balance: acc.balance + r.balance,
      };
    },
    { income: 0, expElection: 0, expNonElection: 0, expSubtotal: 0, balance: 0 },
  );

  const donation = donationKeys.reduce(
    (acc, k) => {
      const r = makeRow(k);
      return {
        income: acc.income + r.income,
        expElection: acc.expElection + r.expElection,
        expNonElection: acc.expNonElection + r.expNonElection,
        expSubtotal: acc.expSubtotal + r.expSubtotal,
        balance: acc.balance + r.balance,
      };
    },
    { income: 0, expElection: 0, expNonElection: 0, expSubtotal: 0, balance: 0 },
  );

  const subsidy = subsidyKeys.reduce(
    (acc, k) => {
      const r = makeRow(k);
      return {
        income: acc.income + r.income,
        expElection: acc.expElection + r.expElection,
        expNonElection: acc.expNonElection + r.expNonElection,
        expSubtotal: acc.expSubtotal + r.expSubtotal,
        balance: acc.balance + r.balance,
      };
    },
    { income: 0, expElection: 0, expNonElection: 0, expSubtotal: 0, balance: 0 },
  );

  const subsidyOther: AccountRow = {
    income: 0,
    expElection: 0,
    expNonElection: 0,
    expSubtotal: 0,
    balance: 0,
  };

  const total: AccountRow = {
    income: asset.income + donation.income + subsidy.income + subsidyOther.income,
    expElection:
      asset.expElection +
      donation.expElection +
      subsidy.expElection +
      subsidyOther.expElection,
    expNonElection:
      asset.expNonElection +
      donation.expNonElection +
      subsidy.expNonElection +
      subsidyOther.expNonElection,
    expSubtotal:
      asset.expSubtotal +
      donation.expSubtotal +
      subsidy.expSubtotal +
      subsidyOther.expSubtotal,
    balance:
      asset.balance +
      donation.balance +
      subsidy.balance +
      subsidyOther.balance,
  };

  const today = new Date();
  const dateStr = `${today.getFullYear()}년 ${String(today.getMonth() + 1).padStart(2, "0")}월 ${String(today.getDate()).padStart(2, "0")}일`;

  return {
    electionName: organ?.election_name || "",
    districtName: organ?.district_name || "",
    entityName: organ?.org_name || "",
    asset,
    donation,
    subsidy,
    subsidyOther,
    total,
    reportDate: dateStr,
    accountantLine: `${organ?.org_name || ""}   회계책임자  ${organ?.acct_name || ""}  (인)`,
    candidateLine: "(예비)후보자                     (인)",
    committeeLine: `${organ?.district_name || ""} 선거관리위원회 귀중`,
  };
}

/**
 * T5~T10: 수입지출부 데이터 조회
 */
export async function queryLedgerData(
  req: ReportRequest,
): Promise<{ header: Record<string, unknown>; rows: LedgerRow[] }> {
  const codes = await getCodeNames();

  const accName = req.accSecCd ? codes[Number(req.accSecCd)] || "" : "";
  const itemName = req.itemSecCd ? codes[Number(req.itemSecCd)] || "" : "";

  let query = supabase
    .from("acc_book")
    .select("*, customer:cust_id(name, reg_num, addr, job, tel)")
    .eq("org_id", Number(req.orgId));

  if (req.accSecCd) query = query.eq("acc_sec_cd", Number(req.accSecCd));
  if (req.itemSecCd) query = query.eq("item_sec_cd", Number(req.itemSecCd));
  if (req.dateFrom) query = query.gte("acc_date", req.dateFrom);
  if (req.dateTo) query = query.lte("acc_date", req.dateTo);

  const { data: records } = await query
    .order("acc_date")
    .order("acc_sort_num");

  const rows: LedgerRow[] = [];
  let incCum = 0;
  let expCum = 0;

  for (const r of (records || []) as Record<string, unknown>[]) {
    const customer = r.customer as Record<string, string> | null;
    const amt = (r.acc_amt as number) || 0;
    const isIncome = (r.incm_sec_cd as number) === 1;

    if (isIncome) incCum += amt;
    else expCum += amt;

    rows.push({
      accDate: (r.acc_date as string) || "",
      description: (r.content as string) || "",
      incomeAmt: isIncome ? amt : null,
      incomeCum: incCum,
      expenseAmt: !isIncome ? amt : null,
      expenseCum: expCum,
      balance: incCum - expCum,
      custName: customer?.name || "",
      regNum: customer?.reg_num || "",
      addr: customer?.addr || "",
      job: customer?.job || "",
      tel: customer?.tel || "",
      receiptNo: (r.rcp_no as string) || "",
      remark: (r.bigo as string) || "",
      transfer: "",
    });
  }

  const accountLabel = accName && itemName
    ? `[계정(과 목)명: ${accName} (${itemName}) ]`
    : `[전체 수입·지출 내역]`;

  return {
    header: { accountLabel },
    rows,
  };
}

/**
 * 보고서 유형에 따라 적절한 데이터 조회 함수 호출
 */
export async function queryReportData(
  req: ReportRequest,
): Promise<Record<string, unknown>> {
  switch (req.reportType) {
    case "income-expense-report":
      return (await queryIncomeExpenseReport(req)) as unknown as Record<
        string,
        unknown
      >;

    case "audit-opinion": {
      const organ = await getOrganInfo(req.orgId);
      // opinion 테이블에서 감사의견 조회
      const { data: opinion } = await supabase
        .from("opinion")
        .select("*")
        .eq("org_id", Number(req.orgId))
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const today = new Date().toLocaleDateString("ko-KR");
      return {
        auditDescription:
          opinion?.audit_desc ||
          `「정치자금법」 제 41조 제1항의 규정에 따라 실시한 회계처리 내역에 대한 감사의견은 다음과 같습니다.`,
        auditPeriodEnd: opinion?.audit_period_end || "",
        auditPeriodLine:
          opinion?.audit_period
            ? `  가. 감사기간 : ${opinion.audit_period}`
            : "",
        opinionText:
          opinion?.opinion_text
            ? `2. 감사의견 : ${opinion.opinion_text}`
            : "",
        specialNotes:
          opinion?.special_notes
            ? `3. 특기사항 : ${opinion.special_notes}`
            : "",
        reportDate: today,
        auditorAddress: opinion?.auditor_addr || "",
        auditorName: opinion?.auditor_name || organ?.acct_name || "",
      };
    }

    case "review-resolution": {
      const organ = await getOrganInfo(req.orgId);
      let resQuery = supabase
        .from("acc_book")
        .select("acc_sec_cd, item_sec_cd, incm_sec_cd, acc_amt")
        .eq("org_id", Number(req.orgId));
      if (req.dateFrom) resQuery = resQuery.gte("acc_date", req.dateFrom);
      if (req.dateTo) resQuery = resQuery.lte("acc_date", req.dateTo);
      const { data: resRecords } = await resQuery;

      const adjusted = adjustNegativeIncome(resRecords || []);
      let totalIncome = 0;
      let totalExpense = 0;
      for (const r of adjusted) {
        if (r.incm_sec_cd === 1) totalIncome += r.acc_amt || 0;
        else totalExpense += r.acc_amt || 0;
      }

      const periodStr =
        req.dateFrom && req.dateTo
          ? `${req.dateFrom} ~ ${req.dateTo}`
          : "";

      return {
        period: periodStr,
        totalAsset: 0,
        totalIncome,
        totalExpense,
        totalBalance: totalIncome - totalExpense,
        resolutionDate: new Date().toLocaleDateString("ko-KR"),
        committeeName: `${organ?.org_name || ""} 예산결산위원회`,
        member1Name: "",
        member2Name: "",
        member3Name: "",
      };
    }

    case "accounting-report": {
      const organ = await getOrganInfo(req.orgId);
      const year = new Date().getFullYear();
      return {
        orgName: organ?.org_name || "",
        docNumber: `회계 ${year} - `,
        issueDate: new Date().toLocaleDateString("ko-KR"),
        recipientName: "",
        title: `${organ?.org_name || ""} 회계보고서 제출`,
        representLine: `${organ?.org_name || ""}  대표자           (인)`,
      };
    }

    case "ledger":
      return (await queryLedgerData(req)) as unknown as Record<
        string,
        unknown
      >;

    default:
      throw new Error(`Unknown report type: ${req.reportType}`);
  }
}
