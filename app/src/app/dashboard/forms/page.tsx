"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { useAuth } from "@/stores/auth";
import { Button } from "@/components/ui/button";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface OrgInfo {
  org_name: string;
  rep_name: string;
  acct_name: string;
  addr: string;
  addr_detail: string;
  tel: string;
  fax: string;
  post: string;
  comm: string;
  reg_num: string;
  reg_date: string;
}

interface FormDef {
  id: string;
  label: string;
  /** "link" forms navigate to another page instead of printing */
  type: "print" | "link";
  href?: string;
}

interface FormGroup {
  stage: string;
  title: string;
  forms: FormDef[];
}

/* ------------------------------------------------------------------ */
/*  Form Catalog                                                       */
/* ------------------------------------------------------------------ */

const FORM_GROUPS: FormGroup[] = [
  {
    stage: "1",
    title: "회계보고서 제출",
    forms: [
      { id: "audit-opinion", label: "감사의견서", type: "link", href: "/dashboard/audit" },
      { id: "audit-resolution", label: "심사의결서", type: "link", href: "/dashboard/audit" },
      { id: "audit-submit", label: "회계보고서 제출문서", type: "link", href: "/dashboard/audit" },
    ],
  },
  {
    stage: "2",
    title: "회계책임자 관련",
    forms: [
      { id: "2-1", label: "[서식2-1] 회계책임자 선임신고서", type: "print" },
      { id: "2-2", label: "[서식2-2] 취임동의서", type: "print" },
      { id: "2-3", label: "[서식2-3] 선거비용지출액 약정서", type: "print" },
      { id: "3", label: "[서식3] 회계책임자 겸임신고서", type: "print" },
      { id: "6-1", label: "[서식6-1] 회계책임자 변경신고서", type: "print" },
    ],
  },
  {
    stage: "3",
    title: "계좌/인계 관련",
    forms: [
      { id: "1-1", label: "[서식1-1] (예비)후보자의 정치자금 수입과 지출 인계인수서", type: "print" },
      { id: "1-2", label: "[서식1-2] 인계인수내역 별지", type: "print" },
      { id: "4", label: "[서식4] 예금계좌 신고서", type: "print" },
      { id: "5", label: "[서식5] 예금계좌 변경신고서", type: "print" },
      { id: "6-2", label: "[서식6-2] 회계책임자 변경신고서 첨부서류 (인계인수서)", type: "print" },
    ],
  },
  {
    stage: "4",
    title: "지출내역서",
    forms: [
      { id: "9", label: "[서식9] 정치자금지출 위임장", type: "print" },
      { id: "10", label: "[서식10] 회계사무보조자 정치자금 지출내역서", type: "print" },
      { id: "11", label: "[서식11] 체크카드 등을 교부받은 자의 정치자금 지출내역서", type: "print" },
      { id: "12-1", label: "[서식12-1] (예비)후보자의 선거운동비용 지출내역서", type: "print" },
      { id: "12-2", label: "[서식12-2] (예비)후보자의 선거운동비용 지출내역서 별지", type: "print" },
      { id: "13", label: "[서식13] (예비)후보자 선거운동경비 지급 및 잔액 반환", type: "print" },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const today8 = () => {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
};

const fmtDate = (d: string) => {
  if (!d || d.length !== 8) return d || "";
  return `${d.slice(0, 4)}년 ${d.slice(4, 6)}월 ${d.slice(6, 8)}일`;
};

const EMPTY_ROWS = (n: number) => Array.from({ length: n }, () => "");

/* ------------------------------------------------------------------ */
/*  Print CSS (shared)                                                 */
/* ------------------------------------------------------------------ */

const PRINT_CSS = `
  @page { size: A4; margin: 15mm 20mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Malgun Gothic', '맑은 고딕', sans-serif; font-size: 11pt; line-height: 1.6; color: #000; padding: 0; }
  .page { padding: 10px 0; }
  .title { text-align: center; font-size: 18pt; font-weight: bold; margin: 10px 0 20px; letter-spacing: 6px; }
  .subtitle { text-align: center; font-size: 13pt; font-weight: bold; margin: 10px 0 15px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  td, th { border: 1px solid #000; padding: 5px 8px; font-size: 10pt; vertical-align: middle; }
  th { background: #f5f5f5; font-weight: bold; text-align: center; }
  .right { text-align: right; }
  .center { text-align: center; }
  .no-border td, .no-border th { border: none; }
  .sign-area { margin-top: 30px; text-align: center; }
  .note { margin-top: 20px; font-size: 8.5pt; line-height: 1.5; color: #333; }
  .note p { margin: 2px 0; }
  .law-text { margin: 15px 0; font-size: 9.5pt; line-height: 1.7; }
  .blank { min-height: 22px; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
`;

/* ------------------------------------------------------------------ */
/*  Form Renderers                                                     */
/* ------------------------------------------------------------------ */

function renderForm(id: string, o: OrgInfo): string {
  const todayStr = fmtDate(today8());
  const orgName = o.org_name || "○○○";
  const acctName = o.acct_name || "";
  const repName = o.rep_name || "";
  const addr = [o.addr, o.addr_detail].filter(Boolean).join(" ") || "";
  const tel = o.tel || "";

  switch (id) {
    /* ============================================================== */
    /*  Stage 2 - 회계책임자 관련                                       */
    /* ============================================================== */

    case "2-1": // 회계책임자 선임신고서
      return `<div class="page">
        <div class="title">회계책임자 선임신고서</div>
        <table>
          <tr><th style="width:30%">정당(후원회 등)의 명칭</th><td>${orgName}</td></tr>
        </table>
        <table>
          <tr>
            <th rowspan="4" style="width:15%">회계<br/>책임자</th>
            <th style="width:15%">성 명</th><td>${acctName}</td>
          </tr>
          <tr><th>주 소</th><td>${addr}</td></tr>
          <tr><th>전화번호</th><td>${tel}</td></tr>
          <tr><th>선임연월일</th><td class="blank"></td></tr>
        </table>
        <table>
          <tr>
            <th rowspan="2" style="width:15%">예금계좌</th>
            <th style="width:15%">수입용</th>
            <th style="width:20%">금융기관명</th><td style="width:20%"></td>
            <th style="width:15%">계좌번호</th><td></td>
          </tr>
          <tr>
            <th>지출용</th>
            <th>금융기관명</th><td></td>
            <th>계좌번호</th><td></td>
          </tr>
        </table>

        <div class="law-text">
          <p>「정치자금법」 제34조제1항(제60조에서 준용하는 경우를 포함한다)에 따라 위와 같이 회계책임자의 선임을 신고합니다.</p>
        </div>

        <div class="sign-area">
          <p>${todayStr}</p>
          <p style="margin-top:20px;">신 고 인 &nbsp;&nbsp;${orgName}</p>
          <p style="margin-top:10px;">대 표 자 &nbsp;&nbsp;${repName} &nbsp;&nbsp;&nbsp;(서명 또는 인)</p>
          <p style="margin-top:30px;">○○선거관리위원회 귀중</p>
        </div>

        <div class="note">
          <p>【주】 ① 회계책임자가 선임된 때에는 그 날부터 14일 이내에 관할 선거관리위원회에 서면으로 신고하여야 합니다.</p>
          <p>② 회계책임자의 선임신고를 하는 때에는 회계책임자 취임동의서 1부를 첨부하여야 합니다.</p>
          <p>③ 예금계좌의 변경이 있는 때에는 즉시 관할 선거관리위원회에 서면으로 신고하여야 합니다.</p>
        </div>
      </div>`;

    case "2-2": // 취임동의서
      return `<div class="page">
        <div class="title">취 임 동 의 서</div>
        <table>
          <tr><th style="width:25%">성 명</th><td>${acctName}</td></tr>
          <tr><th>주 소</th><td>${addr}</td></tr>
          <tr><th>생년월일</th><td></td></tr>
          <tr><th>전화번호</th><td>${tel}</td></tr>
        </table>

        <div style="margin: 30px 0; text-align: center; font-size: 12pt; line-height: 2;">
          <p>본인은 ${orgName}의 회계책임자로 취임함을 동의합니다.</p>
        </div>

        <div class="sign-area">
          <p>${todayStr}</p>
          <p style="margin-top:25px;">위 동의인 &nbsp;&nbsp;${acctName} &nbsp;&nbsp;&nbsp;(서명 또는 인)</p>
        </div>

        <div class="note">
          <p>【주】 ① 「정치자금법」 제34조(제60조에서 준용하는 경우를 포함한다)에 따른 회계책임자의 선임신고를 하는 때에는 취임동의서 1부를 첨부하여야 합니다.</p>
        </div>
      </div>`;

    case "2-3": // 선거비용지출액 약정서
      return `<div class="page">
        <div class="title">선거비용지출액 약정서</div>

        <table>
          <tr><th style="width:30%">정당(후보자)의 명칭(성명)</th><td>${orgName}</td></tr>
          <tr><th>회계책임자 성명</th><td>${acctName}</td></tr>
        </table>
        <table>
          <tr><th style="width:30%">선거비용제한액</th><td class="right">원</td></tr>
          <tr><th>지출최고액</th><td class="right">원</td></tr>
        </table>

        <div class="law-text">
          <p>「공직선거법」 제122조의2에 따른 선거비용제한액을 초과하여 선거비용을 지출하지 아니할 것을 약정합니다.</p>
        </div>

        <div class="sign-area">
          <p>${todayStr}</p>
          <p style="margin-top:20px;">약 정 인(회계책임자) &nbsp;&nbsp;${acctName} &nbsp;&nbsp;&nbsp;(서명 또는 인)</p>
          <p style="margin-top:30px;">○○선거관리위원회 귀중</p>
        </div>

        <div class="note">
          <p>【주】 ① 회계책임자는 선거비용제한액의 범위 안에서 선거비용의 지출최고액을 정하여 약정하여야 합니다.</p>
          <p>② 약정서는 회계책임자 선임신고 시 또는 선거비용제한액이 고시된 때에 관할 선거관리위원회에 제출하여야 합니다.</p>
        </div>
      </div>`;

    case "3": // 회계책임자 겸임신고서
      return `<div class="page">
        <div class="title">회계책임자 겸임신고서</div>
        <table>
          <tr><th style="width:30%">정당(후원회 등)의 명칭</th><td>${orgName}</td></tr>
        </table>
        <table>
          <tr>
            <th rowspan="5" style="width:15%">겸임하는<br/>회계<br/>책임자</th>
            <th style="width:15%">성 명</th><td>${acctName}</td>
          </tr>
          <tr><th>주 소</th><td>${addr}</td></tr>
          <tr><th>전화번호</th><td>${tel}</td></tr>
          <tr><th>겸임연월일</th><td class="blank"></td></tr>
          <tr><th>겸임하는<br/>회계책임자의 신분</th><td class="blank"></td></tr>
        </table>
        <table>
          <tr>
            <th rowspan="2" style="width:15%">예금계좌</th>
            <th style="width:15%">수입용</th>
            <th style="width:20%">금융기관명</th><td style="width:20%"></td>
            <th style="width:15%">계좌번호</th><td></td>
          </tr>
          <tr>
            <th>지출용</th>
            <th>금융기관명</th><td></td>
            <th>계좌번호</th><td></td>
          </tr>
        </table>

        <div class="law-text">
          <p>「정치자금법」 제34조제3항(제60조에서 준용하는 경우를 포함한다)에 따라 위와 같이 회계책임자의 겸임을 신고합니다.</p>
        </div>

        <div class="sign-area">
          <p>${todayStr}</p>
          <p style="margin-top:20px;">신 고 인 &nbsp;&nbsp;${orgName}</p>
          <p style="margin-top:10px;">대 표 자 &nbsp;&nbsp;${repName} &nbsp;&nbsp;&nbsp;(서명 또는 인)</p>
          <p style="margin-top:30px;">○○선거관리위원회 귀중</p>
        </div>

        <div class="note">
          <p>【주】 ① 정당의 중앙당 회계책임자는 그 정당의 정책연구소 회계책임자를 겸할 수 있으며, 이 경우 해당 정책연구소의 관할 선거관리위원회에도 신고하여야 합니다.</p>
          <p>② 겸임하는 회계책임자의 신분은 중앙당 회계책임자, 정책연구소 회계책임자 등으로 기재합니다.</p>
        </div>
      </div>`;

    case "6-1": // 회계책임자 변경신고서
      return `<div class="page">
        <div class="title">회계책임자 변경신고서</div>
        <table>
          <tr><th style="width:30%">정당(후원회 등)의 명칭</th><td>${orgName}</td></tr>
        </table>
        <table>
          <tr>
            <th rowspan="4" style="width:15%">전임<br/>회계<br/>책임자</th>
            <th style="width:15%">성 명</th><td></td>
          </tr>
          <tr><th>주 소</th><td></td></tr>
          <tr><th>전화번호</th><td></td></tr>
          <tr><th>해임(사임)연월일</th><td class="blank"></td></tr>
        </table>
        <table>
          <tr>
            <th rowspan="4" style="width:15%">후임<br/>회계<br/>책임자</th>
            <th style="width:15%">성 명</th><td>${acctName}</td>
          </tr>
          <tr><th>주 소</th><td>${addr}</td></tr>
          <tr><th>전화번호</th><td>${tel}</td></tr>
          <tr><th>선임연월일</th><td class="blank"></td></tr>
        </table>
        <table>
          <tr>
            <th rowspan="2" style="width:15%">예금계좌</th>
            <th style="width:15%">수입용</th>
            <th style="width:20%">금융기관명</th><td style="width:20%"></td>
            <th style="width:15%">계좌번호</th><td></td>
          </tr>
          <tr>
            <th>지출용</th>
            <th>금융기관명</th><td></td>
            <th>계좌번호</th><td></td>
          </tr>
        </table>

        <div class="law-text">
          <p>「정치자금법」 제34조제1항(제60조에서 준용하는 경우를 포함한다)에 따라 위와 같이 회계책임자의 변경을 신고합니다.</p>
        </div>

        <div class="sign-area">
          <p>${todayStr}</p>
          <p style="margin-top:20px;">신 고 인 &nbsp;&nbsp;${orgName}</p>
          <p style="margin-top:10px;">대 표 자 &nbsp;&nbsp;${repName} &nbsp;&nbsp;&nbsp;(서명 또는 인)</p>
          <p style="margin-top:30px;">○○선거관리위원회 귀중</p>
        </div>

        <div class="note">
          <p>【주】 ① 회계책임자가 변경된 때에는 그 날부터 14일 이내에 관할 선거관리위원회에 서면으로 신고하여야 합니다.</p>
          <p>② 변경신고를 하는 때에는 후임 회계책임자의 취임동의서 1부와 정치자금의 수입과 지출 인계인수서 1부를 첨부하여야 합니다.</p>
        </div>
      </div>`;

    /* ============================================================== */
    /*  Stage 3 - 계좌/인계 관련                                        */
    /* ============================================================== */

    case "1-1": // (예비)후보자의 정치자금 수입과 지출 인계인수서
      return `<div class="page">
        <div class="title">(예비)후보자의 정치자금의 수입과 지출<br/>인계&middot;인수서</div>
        <table>
          <tr><th style="width:30%">정당(후원회 등)의 명칭</th><td>${orgName}</td></tr>
        </table>
        <table>
          <tr>
            <th rowspan="4" style="width:12%">인계자</th>
            <th style="width:18%">성 명</th><td style="width:35%"></td>
            <th style="width:18%">주민등록번호</th><td></td>
          </tr>
          <tr><th>주 소</th><td colspan="3"></td></tr>
          <tr><th>전화번호</th><td colspan="3"></td></tr>
          <tr><th>직 위</th><td colspan="3"></td></tr>
        </table>
        <table>
          <tr>
            <th rowspan="4" style="width:12%">인수자</th>
            <th style="width:18%">성 명</th><td style="width:35%">${acctName}</td>
            <th style="width:18%">주민등록번호</th><td></td>
          </tr>
          <tr><th>주 소</th><td colspan="3">${addr}</td></tr>
          <tr><th>전화번호</th><td colspan="3">${tel}</td></tr>
          <tr><th>직 위</th><td colspan="3">회계책임자</td></tr>
        </table>
        <table>
          <tr><th style="width:30%">인계인수내역</th><td>별지 참조</td></tr>
          <tr><th>인계인수연월일</th><td class="blank"></td></tr>
        </table>

        <div class="law-text">
          <p>「정치자금법」 제35조(제60조에서 준용하는 경우를 포함한다)에 따라 위와 같이 정치자금의 수입과 지출에 관한 사항을 인계&middot;인수합니다.</p>
        </div>

        <div class="sign-area">
          <p>${todayStr}</p>
          <p style="margin-top:15px;">인 계 자 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(서명 또는 인)</p>
          <p style="margin-top:10px;">인 수 자 &nbsp;&nbsp;${acctName} &nbsp;&nbsp;&nbsp;(서명 또는 인)</p>
        </div>

        <div class="note">
          <p>【주】 ① 인계인수내역이 많은 경우 별지를 사용합니다.</p>
          <p>② 회계책임자가 변경된 때에는 전임 회계책임자는 후임 회계책임자에게 모든 회계관련 서류를 인계하여야 합니다.</p>
        </div>
      </div>`;

    case "1-2": // 인계인수내역 별지
      return `<div class="page">
        <div class="title">인계&middot;인수내역</div>
        <p style="text-align:right; margin-bottom:5px; font-size:10pt;">(${orgName})</p>
        <table>
          <tr>
            <th style="width:8%">번호</th>
            <th style="width:42%">구 분</th>
            <th style="width:15%">수 량</th>
            <th style="width:20%">금액(원)</th>
            <th style="width:15%">비 고</th>
          </tr>
          <tr><td class="center">1</td><td>수입지출보고서</td><td class="center"></td><td class="right"></td><td></td></tr>
          <tr><td class="center">2</td><td>수입지출부</td><td class="center"></td><td class="right"></td><td></td></tr>
          <tr><td class="center">3</td><td>회계관리프로그램 백업파일</td><td class="center"></td><td class="right"></td><td></td></tr>
          <tr><td class="center">4</td><td>영수증 등 지출증빙서류</td><td class="center"></td><td class="right"></td><td></td></tr>
          <tr><td class="center">5</td><td>예금계좌 (수입용)</td><td class="center"></td><td class="right"></td><td></td></tr>
          <tr><td class="center">6</td><td>예금계좌 (지출용)</td><td class="center"></td><td class="right"></td><td></td></tr>
          <tr><td class="center">7</td><td>체크카드</td><td class="center"></td><td class="right"></td><td></td></tr>
          <tr><td class="center">8</td><td>책상</td><td class="center"></td><td class="right"></td><td></td></tr>
          <tr><td class="center">9</td><td>의자</td><td class="center"></td><td class="right"></td><td></td></tr>
          <tr><td class="center">10</td><td>컴퓨터</td><td class="center"></td><td class="right"></td><td></td></tr>
          ${EMPTY_ROWS(5).map((_, i) => `<tr><td class="center">${11 + i}</td><td></td><td class="center"></td><td class="right"></td><td></td></tr>`).join("")}
        </table>

        <div class="sign-area" style="margin-top:30px;">
          <p>${todayStr}</p>
          <p style="margin-top:15px;">인 계 자 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(서명 또는 인)</p>
          <p style="margin-top:10px;">인 수 자 &nbsp;&nbsp;${acctName} &nbsp;&nbsp;&nbsp;(서명 또는 인)</p>
        </div>
      </div>`;

    case "4": // 예금계좌 신고서
      return `<div class="page">
        <div class="title">예금계좌 신고서</div>
        <table class="no-border" style="margin-bottom:10px;">
          <tr><td style="width:20%"><b>문서번호:</b></td><td></td></tr>
        </table>
        <table>
          <tr><th style="width:30%">정당(후원회 등)의 명칭</th><td>${orgName}</td></tr>
          <tr><th>회계책임자 성명</th><td>${acctName}</td></tr>
        </table>
        <table>
          <tr>
            <th rowspan="3" style="width:12%">수입용</th>
            <th style="width:18%">예금주</th><td style="width:35%"></td>
            <th style="width:18%">비 고</th><td></td>
          </tr>
          <tr><th>금융기관명</th><td></td><th rowspan="2"></th><td rowspan="2"></td></tr>
          <tr><th>계좌번호</th><td></td></tr>
        </table>
        <table>
          <tr>
            <th rowspan="3" style="width:12%">지출용</th>
            <th style="width:18%">예금주</th><td style="width:35%"></td>
            <th style="width:18%">비 고</th><td></td>
          </tr>
          <tr><th>금융기관명</th><td></td><th rowspan="2"></th><td rowspan="2"></td></tr>
          <tr><th>계좌번호</th><td></td></tr>
        </table>

        <div class="law-text">
          <p>「정치자금법」 제34조의2(제60조에서 준용하는 경우를 포함한다)에 따라 위와 같이 예금계좌를 신고합니다.</p>
        </div>

        <div class="sign-area">
          <p>${todayStr}</p>
          <p style="margin-top:20px;">신 고 인 &nbsp;&nbsp;${orgName}</p>
          <p style="margin-top:10px;">회계책임자 &nbsp;&nbsp;${acctName} &nbsp;&nbsp;&nbsp;(서명 또는 인)</p>
          <p style="margin-top:30px;">○○선거관리위원회 귀중</p>
        </div>

        <div class="note">
          <p>【주】 ① 회계책임자는 선임신고를 한 후 지체 없이 정치자금의 수입과 지출을 위한 예금계좌를 개설하고 관할 선거관리위원회에 신고하여야 합니다.</p>
          <p>② 수입용 계좌와 지출용 계좌를 각각 개설하여야 합니다.</p>
        </div>
      </div>`;

    case "5": // 예금계좌 변경신고서
      return `<div class="page">
        <div class="title">예금계좌 변경신고서</div>
        <table class="no-border" style="margin-bottom:10px;">
          <tr><td style="width:20%"><b>문서번호:</b></td><td></td></tr>
        </table>
        <table>
          <tr><th style="width:30%">정당(후원회 등)의 명칭</th><td>${orgName}</td></tr>
          <tr><th>회계책임자 성명</th><td>${acctName}</td></tr>
        </table>
        <p style="margin:10px 0 5px; font-weight:bold; font-size:11pt;">■ 변경 전</p>
        <table>
          <tr>
            <th rowspan="3" style="width:12%">수입용</th>
            <th style="width:18%">예금주</th><td style="width:35%"></td>
            <th style="width:18%">비 고</th><td></td>
          </tr>
          <tr><th>금융기관명</th><td></td><th rowspan="2"></th><td rowspan="2"></td></tr>
          <tr><th>계좌번호</th><td></td></tr>
        </table>
        <table>
          <tr>
            <th rowspan="3" style="width:12%">지출용</th>
            <th style="width:18%">예금주</th><td style="width:35%"></td>
            <th style="width:18%">비 고</th><td></td>
          </tr>
          <tr><th>금융기관명</th><td></td><th rowspan="2"></th><td rowspan="2"></td></tr>
          <tr><th>계좌번호</th><td></td></tr>
        </table>
        <p style="margin:10px 0 5px; font-weight:bold; font-size:11pt;">■ 변경 후</p>
        <table>
          <tr>
            <th rowspan="3" style="width:12%">수입용</th>
            <th style="width:18%">예금주</th><td style="width:35%"></td>
            <th style="width:18%">비 고</th><td></td>
          </tr>
          <tr><th>금융기관명</th><td></td><th rowspan="2"></th><td rowspan="2"></td></tr>
          <tr><th>계좌번호</th><td></td></tr>
        </table>
        <table>
          <tr>
            <th rowspan="3" style="width:12%">지출용</th>
            <th style="width:18%">예금주</th><td style="width:35%"></td>
            <th style="width:18%">비 고</th><td></td>
          </tr>
          <tr><th>금융기관명</th><td></td><th rowspan="2"></th><td rowspan="2"></td></tr>
          <tr><th>계좌번호</th><td></td></tr>
        </table>

        <div class="law-text">
          <p>「정치자금법」 제34조의2(제60조에서 준용하는 경우를 포함한다)에 따라 위와 같이 예금계좌의 변경을 신고합니다.</p>
        </div>

        <div class="sign-area">
          <p>${todayStr}</p>
          <p style="margin-top:20px;">신 고 인 &nbsp;&nbsp;${orgName}</p>
          <p style="margin-top:10px;">회계책임자 &nbsp;&nbsp;${acctName} &nbsp;&nbsp;&nbsp;(서명 또는 인)</p>
          <p style="margin-top:30px;">○○선거관리위원회 귀중</p>
        </div>

        <div class="note">
          <p>【주】 ① 예금계좌의 변경이 있는 때에는 즉시 관할 선거관리위원회에 서면으로 신고하여야 합니다.</p>
        </div>
      </div>`;

    case "6-2": // 회계책임자 변경신고서 첨부서류
      return `<div class="page">
        <div class="title">정치자금의 수입과 지출 인계&middot;인수서</div>
        <p class="center" style="margin-bottom:15px; font-size:10pt;">(회계책임자 변경신고서 첨부서류)</p>
        <table>
          <tr><th style="width:30%">정당(후원회 등)의 명칭</th><td>${orgName}</td></tr>
        </table>
        <table>
          <tr>
            <th rowspan="4" style="width:12%">인계자<br/>(전 회계<br/>책임자)</th>
            <th style="width:18%">성 명</th><td style="width:35%"></td>
            <th style="width:18%">주민등록번호</th><td></td>
          </tr>
          <tr><th>주 소</th><td colspan="3"></td></tr>
          <tr><th>전화번호</th><td colspan="3"></td></tr>
          <tr><th>직 위</th><td colspan="3">전 회계책임자</td></tr>
        </table>
        <table>
          <tr>
            <th rowspan="4" style="width:12%">인수자<br/>(현 회계<br/>책임자)</th>
            <th style="width:18%">성 명</th><td style="width:35%">${acctName}</td>
            <th style="width:18%">주민등록번호</th><td></td>
          </tr>
          <tr><th>주 소</th><td colspan="3">${addr}</td></tr>
          <tr><th>전화번호</th><td colspan="3">${tel}</td></tr>
          <tr><th>직 위</th><td colspan="3">현 회계책임자</td></tr>
        </table>
        <table>
          <tr><th style="width:30%">인계인수내역</th><td>별지 참조</td></tr>
          <tr><th>인계인수연월일</th><td class="blank"></td></tr>
        </table>

        <div class="law-text">
          <p>「정치자금법」 제35조(제60조에서 준용하는 경우를 포함한다)에 따라 위와 같이 정치자금의 수입과 지출에 관한 사항을 인계&middot;인수합니다.</p>
        </div>

        <div class="sign-area">
          <p>${todayStr}</p>
          <p style="margin-top:15px;">인계자(전 회계책임자) &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(서명 또는 인)</p>
          <p style="margin-top:10px;">인수자(현 회계책임자) &nbsp;&nbsp;${acctName} &nbsp;&nbsp;&nbsp;(서명 또는 인)</p>
        </div>

        <div class="note">
          <p>【주】 ① 회계책임자 변경신고 시 이 인계인수서를 첨부하여야 합니다.</p>
          <p>② 인계인수내역이 많은 경우 별지를 사용합니다.</p>
        </div>
      </div>`;

    /* ============================================================== */
    /*  Stage 4 - 지출내역서                                            */
    /* ============================================================== */

    case "9": // 정치자금지출 위임장
      return `<div class="page">
        <div class="title">정치자금지출 위임장</div>
        <table>
          <tr><th style="width:30%">정당(후원회 등)의 명칭</th><td>${orgName}</td></tr>
          <tr><th>회계책임자 성명</th><td>${acctName}</td></tr>
        </table>
        <table>
          <tr>
            <th rowspan="4" style="width:12%">수임자<br/>(회계사무<br/>보조자)</th>
            <th style="width:18%">성 명</th><td></td>
          </tr>
          <tr><th>생년월일</th><td></td></tr>
          <tr><th>주 소</th><td></td></tr>
          <tr><th>전화번호</th><td></td></tr>
        </table>
        <p style="font-weight:bold; margin:10px 0 5px;">■ 위임내용</p>
        <table>
          <tr>
            <th style="width:25%">위임기간</th>
            <td></td>
          </tr>
          <tr>
            <th>지출목적</th>
            <td></td>
          </tr>
          <tr>
            <th>지출의 대강의 내역</th>
            <td></td>
          </tr>
          <tr>
            <th>지출한도금액</th>
            <td class="right">원</td>
          </tr>
          <tr>
            <th>지출기간</th>
            <td></td>
          </tr>
          <tr>
            <th>비 고</th>
            <td></td>
          </tr>
        </table>

        <div class="law-text">
          <p>「정치자금법」 제36조제3항(제60조에서 준용하는 경우를 포함한다)에 따라 위와 같이 정치자금의 지출을 위임합니다.</p>
        </div>

        <div class="sign-area">
          <p>${todayStr}</p>
          <p style="margin-top:20px;">위 임 인(회계책임자) &nbsp;&nbsp;${acctName} &nbsp;&nbsp;&nbsp;(서명 또는 인)</p>
        </div>

        <div class="note">
          <p>【주】 ① 회계책임자는 회계사무보조자에게 정치자금의 지출을 위임할 수 있으며, 이 경우 위임장을 교부하여야 합니다.</p>
          <p>② 위임장에는 지출목적, 지출의 대강의 내역, 지출한도금액 등을 기재하여야 합니다.</p>
        </div>
      </div>`;

    case "10": // 회계사무보조자 정치자금 지출내역서
      return `<div class="page">
        <div class="title">회계사무보조자 정치자금 지출내역서</div>
        <table>
          <tr><th style="width:30%">정당(후원회 등)의 명칭</th><td>${orgName}</td></tr>
          <tr><th>회계사무보조자 성명</th><td></td></tr>
        </table>

        <p style="font-weight:bold; margin:12px 0 5px;">1. 총괄</p>
        <table>
          <tr>
            <th>위임기간</th>
            <th>위임액</th>
            <th>지출액</th>
            <th>잔 액</th>
            <th>비 고</th>
          </tr>
          <tr>
            <td class="center"></td>
            <td class="right">원</td>
            <td class="right">원</td>
            <td class="right">원</td>
            <td></td>
          </tr>
        </table>

        <p style="font-weight:bold; margin:12px 0 5px;">2. 세부지출내역</p>
        <table style="font-size:8.5pt;">
          <tr>
            <th rowspan="2" style="width:8%">연월일</th>
            <th rowspan="2" style="width:14%">내 역</th>
            <th colspan="2">지출액</th>
            <th rowspan="2" style="width:8%">잔 액</th>
            <th rowspan="2" style="width:7%">성 명</th>
            <th rowspan="2" style="width:7%">생년<br/>월일</th>
            <th rowspan="2" style="width:12%">주 소</th>
            <th rowspan="2" style="width:6%">직 업</th>
            <th rowspan="2" style="width:6%">전화<br/>번호</th>
            <th rowspan="2" style="width:7%">영수증<br/>일련번호</th>
            <th rowspan="2" style="width:6%">비고</th>
          </tr>
          <tr>
            <th style="width:8%">금회</th>
            <th style="width:8%">누계</th>
          </tr>
          ${EMPTY_ROWS(10).map(() => `<tr>
            <td class="blank"></td><td></td><td class="right"></td><td class="right"></td>
            <td class="right"></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
          </tr>`).join("")}
        </table>

        <div class="law-text">
          <p>「정치자금법」 제36조제3항(제60조에서 준용하는 경우를 포함한다)에 따라 위와 같이 정치자금 지출내역을 보고합니다.</p>
        </div>

        <div class="sign-area">
          <p>${todayStr}</p>
          <p style="margin-top:15px;">보고인(회계사무보조자) &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(서명 또는 인)</p>
          <p style="margin-top:20px;">${orgName} 회계책임자 &nbsp;&nbsp;${acctName} &nbsp;귀하</p>
        </div>
      </div>`;

    case "11": // 체크카드 등을 교부받은 자의 정치자금 지출내역서
      return `<div class="page">
        <div class="title">체크카드 등을 교부받은 자의<br/>정치자금 지출내역서</div>
        <table>
          <tr><th style="width:30%">정당(후원회 등)의 명칭</th><td>${orgName}</td></tr>
          <tr><th>교부받은 자 성명</th><td></td></tr>
        </table>

        <p style="font-weight:bold; margin:12px 0 5px;">1. 총괄</p>
        <table>
          <tr>
            <th>지출기간</th>
            <th>지출건수</th>
            <th>지출액</th>
            <th>비 고</th>
          </tr>
          <tr>
            <td class="center"></td>
            <td class="center">건</td>
            <td class="right">원</td>
            <td></td>
          </tr>
        </table>

        <p style="font-weight:bold; margin:12px 0 5px;">2. 세부지출내역</p>
        <table style="font-size:8.5pt;">
          <tr>
            <th rowspan="2" style="width:8%">연월일</th>
            <th rowspan="2" style="width:14%">내 역</th>
            <th colspan="2">지출액</th>
            <th rowspan="2" style="width:8%">잔 액</th>
            <th rowspan="2" style="width:7%">성 명</th>
            <th rowspan="2" style="width:7%">생년<br/>월일</th>
            <th rowspan="2" style="width:12%">주 소</th>
            <th rowspan="2" style="width:6%">직 업</th>
            <th rowspan="2" style="width:6%">전화<br/>번호</th>
            <th rowspan="2" style="width:7%">영수증<br/>일련번호</th>
            <th rowspan="2" style="width:6%">비고</th>
          </tr>
          <tr>
            <th style="width:8%">금회</th>
            <th style="width:8%">누계</th>
          </tr>
          ${EMPTY_ROWS(10).map(() => `<tr>
            <td class="blank"></td><td></td><td class="right"></td><td class="right"></td>
            <td class="right"></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
          </tr>`).join("")}
        </table>

        <div class="law-text">
          <p>「정치자금법」 제36조(제60조에서 준용하는 경우를 포함한다)에 따라 위와 같이 정치자금 지출내역을 보고합니다.</p>
        </div>

        <div class="sign-area">
          <p>${todayStr}</p>
          <p style="margin-top:15px;">보고인(교부받은 자) &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(서명 또는 인)</p>
          <p style="margin-top:20px;">${orgName} 회계책임자 &nbsp;&nbsp;${acctName} &nbsp;귀하</p>
        </div>
      </div>`;

    case "12-1": // (예비)후보자의 선거운동비용 지출내역서
      return `<div class="page">
        <div class="title">(예비)후보자의 선거운동비용 지출내역서</div>
        <table>
          <tr><th style="width:30%">(예비)후보자 성명</th><td>${repName || orgName}</td></tr>
          <tr><th>회계책임자 성명</th><td>${acctName}</td></tr>
        </table>

        <p style="font-weight:bold; margin:12px 0 5px;">1. 총괄</p>
        <table>
          <tr>
            <th>수입&middot;지출기간</th>
            <th>수령액</th>
            <th>지출액</th>
            <th>잔 액</th>
            <th>비 고</th>
          </tr>
          <tr>
            <td class="center"></td>
            <td class="right">원</td>
            <td class="right">원</td>
            <td class="right">원</td>
            <td></td>
          </tr>
        </table>

        <p style="font-weight:bold; margin:12px 0 5px;">2. 세부지출내역</p>
        <table style="font-size:8pt;">
          <tr>
            <th rowspan="2" style="width:6%">연월일</th>
            <th rowspan="2" style="width:10%">내 역</th>
            <th colspan="2">수입액</th>
            <th colspan="2">지출액</th>
            <th rowspan="2" style="width:6%">잔 액</th>
            <th rowspan="2" style="width:6%">성명</th>
            <th rowspan="2" style="width:6%">생년<br/>월일</th>
            <th rowspan="2" style="width:10%">주 소</th>
            <th rowspan="2" style="width:5%">직업</th>
            <th rowspan="2" style="width:5%">전화<br/>번호</th>
            <th rowspan="2" style="width:6%">영수증<br/>일련번호</th>
            <th rowspan="2" style="width:5%">비고</th>
          </tr>
          <tr>
            <th style="width:6%">금회</th>
            <th style="width:6%">누계</th>
            <th style="width:6%">금회</th>
            <th style="width:6%">누계</th>
          </tr>
          ${EMPTY_ROWS(10).map(() => `<tr>
            <td class="blank"></td><td></td>
            <td class="right"></td><td class="right"></td>
            <td class="right"></td><td class="right"></td>
            <td class="right"></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
          </tr>`).join("")}
        </table>

        <div class="law-text">
          <p>「정치자금법」 제36조(제60조에서 준용하는 경우를 포함한다)에 따라 위와 같이 선거운동비용 지출내역을 보고합니다.</p>
        </div>

        <div class="sign-area">
          <p>${todayStr}</p>
          <p style="margin-top:15px;">보고인((예비)후보자) &nbsp;&nbsp;${repName || ""} &nbsp;&nbsp;&nbsp;(서명 또는 인)</p>
          <p style="margin-top:20px;">${orgName} 회계책임자 &nbsp;&nbsp;${acctName} &nbsp;귀하</p>
        </div>

        <div class="note">
          <p>【주】 ① (예비)후보자가 회계책임자로부터 선거운동비용을 수령하여 직접 지출한 경우에는 그 지출내역서를 회계책임자에게 제출하여야 합니다.</p>
          <p>② 세부지출내역이 많은 경우 별지를 사용합니다.</p>
        </div>
      </div>`;

    case "12-2": // (예비)후보자의 선거운동비용 지출내역서 별지
      return `<div class="page">
        <div class="title">(예비)후보자의 선거운동비용 지출내역서<br/>[세부지출내역 별지]</div>
        <table>
          <tr><th style="width:30%">(예비)후보자 성명</th><td>${repName || orgName}</td></tr>
        </table>

        <table style="font-size:8pt; margin-top:10px;">
          <tr>
            <th rowspan="2" style="width:6%">연월일</th>
            <th rowspan="2" style="width:10%">내 역</th>
            <th colspan="2">수입액</th>
            <th colspan="2">지출액</th>
            <th rowspan="2" style="width:6%">잔 액</th>
            <th rowspan="2" style="width:6%">성명</th>
            <th rowspan="2" style="width:6%">생년<br/>월일</th>
            <th rowspan="2" style="width:10%">주 소</th>
            <th rowspan="2" style="width:5%">직업</th>
            <th rowspan="2" style="width:5%">전화<br/>번호</th>
            <th rowspan="2" style="width:6%">영수증<br/>일련번호</th>
            <th rowspan="2" style="width:5%">비고</th>
          </tr>
          <tr>
            <th style="width:6%">금회</th>
            <th style="width:6%">누계</th>
            <th style="width:6%">금회</th>
            <th style="width:6%">누계</th>
          </tr>
          ${EMPTY_ROWS(20).map(() => `<tr>
            <td class="blank"></td><td></td>
            <td class="right"></td><td class="right"></td>
            <td class="right"></td><td class="right"></td>
            <td class="right"></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
          </tr>`).join("")}
        </table>

        <div class="sign-area" style="margin-top:20px;">
          <p>위와 같이 보고합니다.</p>
          <p style="margin-top:10px;">${todayStr}</p>
          <p style="margin-top:15px;">보고인((예비)후보자) &nbsp;&nbsp;${repName || ""} &nbsp;&nbsp;&nbsp;(서명 또는 인)</p>
        </div>
      </div>`;

    case "13": // (예비)후보자 선거운동경비 지급 및 잔액 반환
      return `<div class="page">
        <div class="title">(예비)후보자 선거운동경비<br/>지급 및 잔액 반환</div>
        <table>
          <tr><th style="width:30%">(예비)후보자 성명</th><td>${repName || orgName}</td></tr>
          <tr><th>회계책임자 성명</th><td>${acctName}</td></tr>
        </table>

        <table style="margin-top:15px;">
          <tr>
            <th style="width:8%">번호</th>
            <th style="width:15%">연월일</th>
            <th style="width:25%">내 역</th>
            <th style="width:15%">지급액</th>
            <th style="width:15%">반환액</th>
            <th style="width:12%">잔 액</th>
            <th style="width:10%">비 고</th>
          </tr>
          <tr>
            <td class="center">1</td><td></td>
            <td>선거운동경비 지급</td>
            <td class="right">원</td><td class="right"></td><td class="right">원</td><td></td>
          </tr>
          <tr>
            <td class="center">2</td><td></td>
            <td>잔액 반환</td>
            <td class="right"></td><td class="right">원</td><td class="right">원</td><td></td>
          </tr>
          ${EMPTY_ROWS(8).map((_, i) => `<tr>
            <td class="center">${3 + i}</td><td></td><td></td>
            <td class="right"></td><td class="right"></td><td class="right"></td><td></td>
          </tr>`).join("")}
          <tr style="font-weight:bold;">
            <td colspan="3" class="center">합 계</td>
            <td class="right">원</td><td class="right">원</td><td class="right">원</td><td></td>
          </tr>
        </table>

        <div class="law-text">
          <p>위와 같이 선거운동경비를 지급하고 잔액을 반환받았음을 확인합니다.</p>
        </div>

        <div class="sign-area">
          <p>${todayStr}</p>
          <p style="margin-top:15px;">(예비)후보자 &nbsp;&nbsp;${repName || ""} &nbsp;&nbsp;&nbsp;(서명 또는 인)</p>
          <p style="margin-top:10px;">회계책임자 &nbsp;&nbsp;${acctName} &nbsp;&nbsp;&nbsp;(서명 또는 인)</p>
        </div>

        <div class="note">
          <p>【주】 ① (예비)후보자에게 선거운동경비를 지급하고 잔액을 반환받은 경우 이 서식을 작성합니다.</p>
        </div>
      </div>`;

    default:
      return `<div class="page"><p>서식을 찾을 수 없습니다: ${id}</p></div>`;
  }
}

/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

export default function FormsPage() {
  const { orgId, orgName, acctName } = useAuth();
  const [orgInfo, setOrgInfo] = useState<OrgInfo>({
    org_name: orgName || "",
    rep_name: "",
    acct_name: acctName || "",
    addr: "",
    addr_detail: "",
    tel: "",
    fax: "",
    post: "",
    comm: "",
    reg_num: "",
    reg_date: "",
  });
  const [selectedForm, setSelectedForm] = useState<string | null>(null);

  // Load organ info from DB
  useEffect(() => {
    if (!orgId) return;
    const supabase = createSupabaseBrowser();
    supabase
      .from("organ")
      .select("org_name, rep_name, acct_name, addr, addr_detail, tel, fax, post, comm, reg_num, reg_date")
      .eq("org_id", orgId)
      .single()
      .then(({ data }) => {
        if (data) {
          setOrgInfo({
            org_name: data.org_name || orgName || "",
            rep_name: data.rep_name || "",
            acct_name: data.acct_name || acctName || "",
            addr: data.addr || "",
            addr_detail: data.addr_detail || "",
            tel: data.tel || "",
            fax: data.fax || "",
            post: data.post || "",
            comm: data.comm || "",
            reg_num: data.reg_num || "",
            reg_date: data.reg_date || "",
          });
        }
      });
  }, [orgId, orgName, acctName]);

  const printForm = useCallback(
    (formId: string) => {
      const contentHtml = renderForm(formId, orgInfo);
      const formDef = FORM_GROUPS.flatMap((g) => g.forms).find((f) => f.id === formId);
      const title = formDef?.label || "서식";

      const printWindow = window.open("", "_blank");
      if (!printWindow) {
        alert("팝업이 차단되었습니다. 팝업을 허용해 주세요.");
        return;
      }
      printWindow.document.write(`<!DOCTYPE html><html><head>
        <meta charset="utf-8"/>
        <title>${title}</title>
        <style>${PRINT_CSS}</style>
      </head><body>${contentHtml}
      <script>window.onload=function(){window.print();}<\/script>
      </body></html>`);
      printWindow.document.close();
    },
    [orgInfo],
  );

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">서식 출력</h2>
      <p className="text-sm text-gray-500">
        정치자금법 관련 각종 신고서 및 내역서 서식을 출력합니다. 기관정보는 사용기관관리에 등록된 내용으로 자동 입력됩니다.
      </p>

      {/* Org info summary */}
      <div className="bg-white rounded-lg border p-4">
        <h3 className="text-sm font-semibold text-gray-600 mb-2">자동입력 기관정보</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div>
            <span className="text-gray-400">기관명:</span>{" "}
            <span className="font-medium">{orgInfo.org_name || "-"}</span>
          </div>
          <div>
            <span className="text-gray-400">대표자:</span>{" "}
            <span className="font-medium">{orgInfo.rep_name || "-"}</span>
          </div>
          <div>
            <span className="text-gray-400">회계책임자:</span>{" "}
            <span className="font-medium">{orgInfo.acct_name || "-"}</span>
          </div>
          <div>
            <span className="text-gray-400">전화번호:</span>{" "}
            <span className="font-medium">{orgInfo.tel || "-"}</span>
          </div>
          <div className="md:col-span-2">
            <span className="text-gray-400">주소:</span>{" "}
            <span className="font-medium">
              {[orgInfo.addr, orgInfo.addr_detail].filter(Boolean).join(" ") || "-"}
            </span>
          </div>
        </div>
      </div>

      {/* Form groups */}
      <div className="space-y-4">
        {FORM_GROUPS.map((group) => (
          <div key={group.stage} className="bg-white rounded-lg border">
            <div className="px-4 py-3 border-b bg-gray-50 rounded-t-lg">
              <h3 className="font-semibold text-sm">
                단계 {group.stage}. {group.title}
              </h3>
            </div>
            <div className="divide-y">
              {group.forms.map((form) => {
                const isSelected = selectedForm === form.id;
                if (form.type === "link") {
                  return (
                    <div
                      key={form.id}
                      className="flex items-center justify-between px-4 py-3 hover:bg-gray-50"
                    >
                      <span className="text-sm">{form.label}</span>
                      <Link href={form.href || "#"}>
                        <Button variant="outline" size="sm">
                          이동
                        </Button>
                      </Link>
                    </div>
                  );
                }
                return (
                  <div
                    key={form.id}
                    className={`flex items-center justify-between px-4 py-3 hover:bg-gray-50 cursor-pointer ${
                      isSelected ? "bg-blue-50" : ""
                    }`}
                    onClick={() => setSelectedForm(isSelected ? null : form.id)}
                  >
                    <span className="text-sm">{form.label}</span>
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        printForm(form.id);
                      }}
                    >
                      출력
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
