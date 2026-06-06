"use client";

/**
 * 선관위 제출서류 — 서식 선택 → DB 자동 prefill + 수동 입력 → HWPX 생성·다운로드.
 */
import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/stores/auth";
import { formsForOrgType, type HwpxFormDef } from "@/lib/hwpx/form-fields";
import { useHwpxPrefill } from "@/hooks/use-hwpx-prefill";
import FormCatalog from "@/components/submission-forms/FormCatalog";
import FormInputPanel from "@/components/submission-forms/FormInputPanel";

export default function SubmissionFormsPage() {
  const { orgType, orgId } = useAuth();
  const forms = useMemo(() => formsForOrgType(orgType), [orgType]);
  const [selected, setSelected] = useState<HwpxFormDef | null>(null);
  const { prefill } = useHwpxPrefill();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold">선관위 제출서류</h1>
        <p className="text-sm text-muted-foreground">
          서식을 선택하면 사용기관 정보가 자동으로 채워집니다. 빈 항목을 입력한 뒤 HWPX로 내려받아 한글에서 여세요.
        </p>
      </div>

      {!orgId && (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            먼저 사용기관을 선택하세요.
          </CardContent>
        </Card>
      )}

      {orgId && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[260px_1fr]">
          <Card>
            <CardContent className="py-4">
              <FormCatalog forms={forms} selectedId={selected?.id ?? null} onSelect={setSelected} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-4">
              {selected ? (
                <FormInputPanel def={selected} prefill={prefill} />
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  왼쪽에서 작성할 서식을 선택하세요.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
