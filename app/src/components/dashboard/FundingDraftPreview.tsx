"use client";

import { Card, CardContent } from "@/components/ui/card";
import { HelpTooltip } from "@/components/help-tooltip";
import { previewDraft, type AsOfRow, type DraftExpense } from "@/lib/accounting/funding-balance-asof";

const won = (n: number) => n.toLocaleString("ko-KR");

interface Props {
  rows: AsOfRow[];
  draft: DraftExpense;
  getName: (cv: number) => string;
}

/**
 * 지출 입력 시점 자금원 잔액 가드 (후보자 전용).
 * 입력 거래일 기준 자금원별 가용잔액 + "저장 후 예상 잔액" 미리보기 + 음수 시 non-blocking 경고.
 * 단일 통합계좌 현실상 "음수"는 현금 부족이 아니라 태깅 불일치(→사후 재배분 필요)임을 안내.
 */
export function FundingDraftPreview({ rows, draft, getName }: Props) {
  const hasSource = draft.acc_sec_cd > 0;
  const hasAmount = draft.acc_amt > 0;
  if (!hasSource && !hasAmount) return null;

  const p = previewDraft(rows, draft);
  const srcName = hasSource ? getName(draft.acc_sec_cd) : "";
  const dateLabel =
    draft.acc_date && draft.acc_date !== "99999999"
      ? `${draft.acc_date.slice(0, 4)}-${draft.acc_date.slice(4, 6)}-${draft.acc_date.slice(6, 8)} 기준`
      : "전체 기준";
  // 대체 추천: 입력 금액을 감당할 여유 있는 다른 자금원
  const alt = p.bySource.find((s) => s.accSecCd !== draft.acc_sec_cd && s.available >= draft.acc_amt);

  return (
    <Card className={p.willGoNegative ? "border-red-400" : ""}>
      <CardContent className="py-3 space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <HelpTooltip id="expense.balance-guard">
            <span className="font-semibold text-muted-foreground underline decoration-dotted underline-offset-2">
              자금원 잔액 가드
            </span>
          </HelpTooltip>
          <span className="text-xs text-muted-foreground">{dateLabel}</span>
        </div>

        {/* 자금원별 가용잔액 (입력일 기준) */}
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {p.bySource
            .filter((s) => s.accSecCd > 0)
            .map((s) => (
              <span
                key={s.accSecCd}
                className={s.accSecCd === draft.acc_sec_cd ? "font-semibold" : "text-muted-foreground"}
              >
                {getName(s.accSecCd)}{" "}
                <span className={`tabular-nums ${s.available < 0 ? "text-red-600" : ""}`}>
                  {won(s.available)}원
                </span>
              </span>
            ))}
        </div>

        {/* 저장 후 예상 잔액 미리보기 */}
        {hasSource && hasAmount && (
          <div className="tabular-nums">
            <span className="font-semibold">{srcName}</span>: 현재 {won(p.current)}원 → 저장 후{" "}
            <span className={p.projected < 0 ? "font-semibold text-red-600" : "font-semibold text-green-700"}>
              {won(p.projected)}원
            </span>
          </div>
        )}

        {/* non-blocking 경고 */}
        {p.willGoNegative && (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-red-700">
            ⚠ <b>{srcName}</b>이(가) {won(p.projected)}원이 됩니다. 이 자금원으로 저장하면 수입지출부·결산에서
            음수가 되어 <b>사후 재배분</b>이 필요합니다.
            {alt && (
              <>
                {" "}
                여유 있는 <b>{getName(alt.accSecCd)}</b>({won(alt.available)}원) 선택을 권장합니다.
              </>
            )}
            <span className="text-xs"> (저장은 가능합니다)</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
