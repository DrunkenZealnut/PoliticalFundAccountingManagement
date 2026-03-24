"use client";
import { useState, useEffect, useCallback } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { useAuth } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface OpinionData {
  acc_from: string; acc_to: string; audit_from: string; audit_to: string;
  opinion: string; position: string; addr: string; name: string;
  judge_from: string; judge_to: string; incm_from: string; incm_to: string;
  estate_amt: number; in_amt: number; cm_amt: number; balance_amt: number;
  print_01: string; print_02: string;
  comm_desc: string; comm_name01: string; comm_name02: string;
  comm_name03: string; comm_name04: string; comm_name05: string;
  acc_title: string; acc_docy: string; acc_docnum: string;
  acc_fdate: string; acc_torgnm: string; acc_borgnm: string; acc_repnm: string;
}

const DEFAULT_OPINION: OpinionData = {
  acc_from: "", acc_to: "", audit_from: "", audit_to: "",
  opinion: "정치자금법 및 정치자금사무관리 규칙과 일반적으로 인정된 회계원칙에 따라 적정하게 처리함",
  position: "", addr: "", name: "",
  judge_from: "", judge_to: "", incm_from: "", incm_to: "",
  estate_amt: 0, in_amt: 0, cm_amt: 0, balance_amt: 0,
  print_01: "", print_02: "",
  comm_desc: "", comm_name01: "", comm_name02: "",
  comm_name03: "", comm_name04: "", comm_name05: "",
  acc_title: "", acc_docy: "", acc_docnum: "",
  acc_fdate: "", acc_torgnm: "", acc_borgnm: "", acc_repnm: "",
};

function formatDate(d: string) {
  if (!d || d.length !== 8) return d;
  return `${d.slice(0, 4)}년 ${d.slice(4, 6)}월 ${d.slice(6, 8)}일`;
}

function formatAmt(n: number) {
  return n.toLocaleString("ko-KR");
}

export default function AuditPage() {
  const supabase = createSupabaseBrowser();
  const { orgId, orgName } = useAuth();
  const [tab, setTab] = useState("opinion");
  const [opinion, setOpinion] = useState<OpinionData>(DEFAULT_OPINION);
  const [loaded, setLoaded] = useState(false);

  // Load existing opinion data
  useEffect(() => {
    if (!orgId || loaded) return;
    (async () => {
      const { data } = await supabase.from("opinion").select("*").eq("org_id", orgId).single();
      if (data) {
        const merged = { ...DEFAULT_OPINION };
        for (const [k, v] of Object.entries(data)) {
          if (k in merged && v !== null) {
            (merged as Record<string, unknown>)[k] = v;
          }
        }
        setOpinion(merged);
      }
      setLoaded(true);
    })();
  }, [orgId, supabase, loaded]);

  async function handleSaveOpinion() {
    if (!orgId) return;
    const { error } = await supabase.from("opinion").upsert({ org_id: orgId, ...opinion });
    if (error) alert(`저장 실패: ${error.message}`);
    else alert("저장되었습니다.");
  }

  const printDocument = useCallback((title: string, contentHtml: string) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("팝업이 차단되었습니다. 팝업을 허용해 주세요.");
      return;
    }
    printWindow.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8"/>
      <title>${title}</title>
      <style>
        @page { size: A4; margin: 20mm; }
        body { font-family: 'Malgun Gothic', '맑은 고딕', sans-serif; font-size: 12pt; line-height: 1.8; color: #000; }
        .title { text-align: center; font-size: 18pt; font-weight: bold; margin: 20px 0 30px; }
        .subtitle { text-align: center; font-size: 14pt; font-weight: bold; margin: 15px 0; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        td, th { border: 1px solid #333; padding: 6px 10px; font-size: 11pt; }
        th { background: #f0f0f0; font-weight: bold; text-align: center; }
        .right { text-align: right; }
        .center { text-align: center; }
        .sign-area { margin-top: 40px; text-align: center; }
        .sign-line { display: inline-block; width: 200px; border-bottom: 1px solid #000; margin: 0 10px; }
        .no-border td { border: none; padding: 3px 10px; }
        @media print { body { -webkit-print-color-adjust: exact; } }
      </style>
    </head><body>${contentHtml}
    <script>window.onload=function(){window.print();}</script>
    </body></html>`);
    printWindow.document.close();
  }, []);

  function handlePrintOpinion() {
    const fmtDot = (d: string) => {
      if (!d || d.length !== 8) return d;
      return `${d.slice(0, 4)}. ${d.slice(4, 6)}. ${d.slice(6, 8)}.`;
    };
    const html = `
      <div style="border: 2px solid #000; padding: 40px 50px; margin: 20px;">
        <div class="title" style="border-bottom: 2px solid #000; padding-bottom: 10px;">감 사 의 견 서</div>

        <p style="margin-top: 30px; line-height: 1.8;">
          「정치자금법」 제41조제1항에 따라 실시한 &nbsp;${formatDate(opinion.acc_from)}부터 ${formatDate(opinion.acc_to)}까지의<br/>
          회계처리 내역에 대한 감사의견은 다음과 같습니다.
        </p>

        <div class="center" style="margin: 30px 0; font-size: 14pt; letter-spacing: 20px;">다 음</div>

        <div style="margin: 20px 0;">
          <p><b>1. 감사개요</b></p>
          <p style="margin: 10px 0 5px 20px;">가. 감사기간 ： &nbsp;&nbsp;${fmtDot(opinion.audit_from)} &nbsp;~ &nbsp;${fmtDot(opinion.audit_to)}</p>
          <p style="margin: 5px 0 5px 20px;">나. 감사대상</p>
          <p style="margin: 3px 0 3px 40px;">○ &nbsp;재산상황</p>
          <p style="margin: 3px 0 3px 40px;">○ &nbsp;정치자금의 수입과 지출에 관한 내역 및 결산내역</p>
        </div>

        <div style="margin: 20px 0;">
          <p><b>2. 감사의견 ：</b> &nbsp;&nbsp;${opinion.opinion || "「정치자금법」 및 「정치자금사무관리 규칙」과 일반적으로 인정된 회계원칙에 따라 적정하게 처리함"}</p>
        </div>

        <div style="margin: 20px 0;">
          <p><b>3. 특기사항 ：</b> &nbsp;&nbsp;없음</p>
        </div>

        <div class="center" style="margin: 40px 0 30px;">${formatDate(opinion.print_01 || opinion.audit_to)}</div>

        <div class="center" style="margin: 20px 0;">
          <p style="letter-spacing: 10px; margin-bottom: 15px;">감 사 자</p>
          <table class="no-border" style="width: 50%; margin: 0 auto;">
            <tr><td style="width:80px">(직 위)</td><td>${opinion.position || ""}</td><td></td></tr>
            <tr><td>(주 소)</td><td>${opinion.addr || ""}</td><td></td></tr>
            <tr><td>(성 명)</td><td>${opinion.name || ""}</td><td style="text-align:right">(인)</td></tr>
          </table>
        </div>
      </div>

      <div style="margin: 20px 20px 0; font-size: 9pt; line-height: 1.6; color: #333;">
        <p>【주】 ① 감사의견서의 양식에 관하여는 제한이 없으며, 회계보고에 관한 전반적인 사항을 권한 있는 기관이 감사하였음을 나타내고 있으면 이를 감사의견서로 인정할 수 있음.</p>
        <p>② 감사기간은 감사대상기간이 아니라 회계보고서를 실제로 감사한 기간을 기재함.</p>
        <p>③ 감사의견에는 정당의 회계처리가 "「정치자금법」 및 「정치자금사무관리 규칙」과 일반적으로 인정된 회계원칙"에 적합한 지의 여부에 관한 의견을 기재하여야 함.</p>
        <p>④ 감사자의 직위 등은 당헌ㆍ당규 상에 규정된 사항을 기재하여야 하며, 당헌ㆍ당규 상에 감사기관에 관한 사항이 규정되지 않은 경우 대의기관이나 그 수임기관에서 임시감사기관을 구성하여야 함.</p>
      </div>
    `;
    printDocument("감사의견서", html);
  }

  function handlePrintResolution() {
    const commEntries = [
      { name: opinion.comm_name01 },
      { name: opinion.comm_name02 },
      { name: opinion.comm_name03 },
      { name: opinion.comm_name04 },
      { name: opinion.comm_name05 },
    ];
    const fmtDot2 = (d: string) => {
      if (!d || d.length !== 8) return d;
      return `${d.slice(0, 4)}. ${d.slice(4, 6)}. ${d.slice(6, 8)}`;
    };
    const html = `
      <div style="text-align: right; margin-bottom: 10px;">
        <span style="border: 1px solid #000; padding: 3px 10px; font-size: 10pt;">원본대조필</span>
        &nbsp;&nbsp;(인)
      </div>

      <div class="title">재산 및 수입·지출상황 등의 심사의결서</div>

      <div style="margin: 30px 0;">
        <p><b><i>1. 의결주문</i></b></p>
        <p style="margin: 15px 0; line-height: 1.8;">
          「정치자금법」 제41조 제1항에 따라 재산상황, 정치자금의 수입ㆍ지출내역 및<br/>
          결산내역(내역별첨)을 심사하고 다음과 같이 확정ㆍ의결한다.
        </p>

        <table class="no-border" style="margin: 15px 0;">
          <tr><td style="width:180px">가. 수입·지출기간 ：</td><td>${fmtDot2(opinion.judge_from || opinion.acc_from)} ~ ${fmtDot2(opinion.judge_to || opinion.acc_to)} 까지</td></tr>
          <tr><td>나. 재 산 ：</td><td style="text-align:right; width:150px;">${formatAmt(opinion.estate_amt)} 원</td></tr>
        </table>

        <p style="margin: 10px 0 5px;">다. 정치자금의 수입·지출내역</p>
        <table class="no-border" style="margin-left: 20px;">
          <tr><td style="width:120px">○ 수 입 ：</td><td style="text-align:right; width:150px;">${formatAmt(opinion.in_amt)} 원</td></tr>
          <tr><td>○ 지 출 ：</td><td style="text-align:right">${formatAmt(opinion.cm_amt)} 원</td></tr>
          <tr><td>○ 잔 액 ：</td><td style="text-align:right">${formatAmt(opinion.balance_amt)} 원</td></tr>
        </table>
      </div>

      <div class="center" style="margin: 30px 0;">
        ${formatDate(opinion.print_02 || opinion.judge_to)}<br/>
        <span style="font-size: 11pt;">${orgName || ""} &nbsp;${opinion.comm_desc || "예산결산위원회"}</span>
      </div>

      <div style="margin: 20px 0;">
        <table class="no-border" style="width: 70%; margin: 0 auto;">
          ${commEntries.map((c) => `
            <tr>
              <td style="width:120px">직 위：운영위원</td>
              <td>성 명：</td>
              <td style="width:100px">${c.name || ""}</td>
              <td style="width:40px; text-align:right">(인)</td>
            </tr>
          `).join("")}
        </table>
      </div>

      <div style="margin: 30px 0;">
        <p><b><i>2. 참고사항</i></b></p>
        <p style="margin: 10px 0 3px;">가. 수입·지출내역 1부</p>
        <p style="margin: 3px 0;">나. 심사보고서 1부</p>
      </div>

      <div style="margin-top: 30px; font-size: 9pt; line-height: 1.6; color: #333;">
        <p>【주】 ① 사본은 정당한 권한을 가진 자(사무국장 등)의 인장으로 날인하여야 함.</p>
        <p>② 의결서의 양식에 관하여는 제한이 없으며, 회계보고에 관한 전반적인 사항을 권한 있는 기관이 심사·의결하였음을 나타내고 있으면 이를 의결서로 인정할 수 있음.</p>
        <p>③ 심사ㆍ의결에 참여한 자 전원의 직위, 성명을 기재하고 날인 또는 서명함.</p>
        <p>④ 세부내역은 회계보고시 제출하는 명세서 등으로 대체할 수 있으며 그 사항을 명시하여야 함.</p>
      </div>
    `;
    printDocument("심사의결서", html);
  }

  function handlePrintSubmitDoc() {
    const html = `
      <table class="no-border" style="margin-bottom: 20px;">
        <tr>
          <td style="width:100px"><b>문서번호:</b></td>
          <td>${opinion.acc_docy ? `${opinion.acc_docy}-${opinion.acc_docnum}` : opinion.acc_docnum}</td>
        </tr>
        <tr><td><b>시행일자:</b></td><td>${formatDate(opinion.acc_fdate)}</td></tr>
        <tr><td><b>수 신:</b></td><td>${opinion.acc_torgnm || ""}</td></tr>
        <tr><td><b>발 신:</b></td><td>${opinion.acc_borgnm || orgName || ""}</td></tr>
      </table>
      <div class="title">회 계 보 고 서  제 출</div>
      <div style="margin: 30px 0; line-height: 2;">
        <p>정치자금법 제40조의 규정에 의하여 회계보고서를 별첨과 같이 제출합니다.</p>
        <p style="margin-top: 30px;"><b>별첨:</b></p>
        <ol style="margin-left: 20px; line-height: 2.2;">
          <li>정치자금 수입지출보고서 1부</li>
          <li>감사의견서 1부</li>
          <li>심사의결서 1부</li>
          <li>재산명세서 1부</li>
          <li>정치자금 수입지출부 1부</li>
        </ol>
      </div>
      <div class="center" style="margin-top: 50px;">
        <p>${formatDate(opinion.acc_fdate)}</p>
        <p style="margin-top: 30px; font-size: 14pt;"><b>${opinion.acc_borgnm || orgName || ""}</b></p>
        <p style="margin-top: 15px;">회계책임자 &nbsp;${opinion.acc_repnm || ""} &nbsp;(인)</p>
      </div>
    `;
    printDocument("회계보고서 제출문서", html);
  }

  const u = (field: keyof OpinionData, value: string | number) =>
    setOpinion({ ...opinion, [field]: value });

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">감사의견서 등 출력</h2>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="opinion">감사의견서</TabsTrigger>
          <TabsTrigger value="resolution">심사의결서</TabsTrigger>
          <TabsTrigger value="submit">회계보고서 제출문서</TabsTrigger>
        </TabsList>

        {/* 감사의견서 */}
        <TabsContent value="opinion" className="bg-white rounded-lg border p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><Label>회계기간 From</Label><Input value={opinion.acc_from} onChange={e => u("acc_from", e.target.value)} placeholder="YYYYMMDD" /></div>
            <div><Label>회계기간 To</Label><Input value={opinion.acc_to} onChange={e => u("acc_to", e.target.value)} placeholder="YYYYMMDD" /></div>
            <div><Label>감사기간 From</Label><Input value={opinion.audit_from} onChange={e => u("audit_from", e.target.value)} placeholder="YYYYMMDD" /></div>
            <div><Label>감사기간 To</Label><Input value={opinion.audit_to} onChange={e => u("audit_to", e.target.value)} placeholder="YYYYMMDD" /></div>
          </div>
          <div>
            <Label>감사의견</Label>
            <textarea
              className="w-full border rounded p-2 text-sm"
              rows={3}
              value={opinion.opinion}
              onChange={e => u("opinion", e.target.value)}
              placeholder="정치자금법 및 정치자금사무관리 규칙과 일반적으로 인정된 회계원칙에 따라 적정하게 처리함"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>출력일자</Label><Input value={opinion.print_01} onChange={e => u("print_01", e.target.value)} placeholder="YYYYMMDD" /></div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div><Label>감사자 직위</Label><Input value={opinion.position} onChange={e => u("position", e.target.value)} /></div>
            <div><Label>감사자 주소</Label><Input value={opinion.addr} onChange={e => u("addr", e.target.value)} /></div>
            <div><Label>감사자 성명</Label><Input value={opinion.name} onChange={e => u("name", e.target.value)} /></div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSaveOpinion}>저장</Button>
            <Button variant="outline" onClick={handlePrintOpinion}>출력</Button>
          </div>
        </TabsContent>

        {/* 심사의결서 */}
        <TabsContent value="resolution" className="bg-white rounded-lg border p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><Label>수입지출기간 From</Label><Input value={opinion.judge_from} onChange={e => u("judge_from", e.target.value)} placeholder="YYYYMMDD" /></div>
            <div><Label>수입지출기간 To</Label><Input value={opinion.judge_to} onChange={e => u("judge_to", e.target.value)} placeholder="YYYYMMDD" /></div>
            <div><Label>재산</Label><Input type="number" value={opinion.estate_amt || ""} onChange={e => u("estate_amt", Number(e.target.value))} /></div>
            <div><Label>수입</Label><Input type="number" value={opinion.in_amt || ""} onChange={e => u("in_amt", Number(e.target.value))} /></div>
            <div><Label>지출</Label><Input type="number" value={opinion.cm_amt || ""} onChange={e => u("cm_amt", Number(e.target.value))} /></div>
            <div><Label>잔액</Label><Input type="number" value={opinion.balance_amt || ""} onChange={e => u("balance_amt", Number(e.target.value))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>의결일자</Label><Input value={opinion.print_02} onChange={e => u("print_02", e.target.value)} placeholder="YYYYMMDD" /></div>
            <div><Label>위원회명칭</Label><Input value={opinion.comm_desc} onChange={e => u("comm_desc", e.target.value)} placeholder="운영위원회" /></div>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map(n => (
              <div key={n}>
                <Label>운영위원 {n}</Label>
                <Input
                  value={(opinion as unknown as Record<string, string | number>)[`comm_name0${n}`] as string || ""}
                  onChange={e => u(`comm_name0${n}` as keyof OpinionData, e.target.value)}
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSaveOpinion}>저장</Button>
            <Button variant="outline" onClick={handlePrintResolution}>출력</Button>
          </div>
        </TabsContent>

        {/* 회계보고서 제출문서 */}
        <TabsContent value="submit" className="bg-white rounded-lg border p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><Label>문서년도</Label><Input value={opinion.acc_docy} onChange={e => u("acc_docy", e.target.value)} placeholder="2022" /></div>
            <div><Label>문서번호</Label><Input value={opinion.acc_docnum} onChange={e => u("acc_docnum", e.target.value)} /></div>
            <div><Label>시행일자</Label><Input value={opinion.acc_fdate} onChange={e => u("acc_fdate", e.target.value)} placeholder="YYYYMMDD" /></div>
            <div><Label>수신 기관명</Label><Input value={opinion.acc_torgnm} onChange={e => u("acc_torgnm", e.target.value)} placeholder="○○선거관리위원회" /></div>
            <div><Label>보고 기관명</Label><Input value={opinion.acc_borgnm} onChange={e => u("acc_borgnm", e.target.value)} /></div>
            <div><Label>대표자 성명</Label><Input value={opinion.acc_repnm} onChange={e => u("acc_repnm", e.target.value)} /></div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSaveOpinion}>저장</Button>
            <Button variant="outline" onClick={handlePrintSubmitDoc}>출력</Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
