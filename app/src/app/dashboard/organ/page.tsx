"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/stores/auth";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { SUPPORTER_SEC_CDS } from "@/lib/accounting/organ-pair";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface OrganRow {
  org_id: number;
  org_sec_cd: number;
  org_name: string;
  userid: string | null;
  passwd: string | null;
  hint1: string | null;
  hint2: string | null;
}

interface FormState {
  userid: string;
  passwd: string;
  hint1: string;
  hint2: string;
  useSeparateCandidate: boolean;
  candidateUserid: string;
  candidatePasswd: string;
}

const SESSION_KEY = "organ-credentials-candidate";

function validateUserid(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "필수 입력입니다";
  if (trimmed.length > 20) return "최대 20자까지 입력 가능합니다";
  if (!/^[A-Za-z0-9_]+$/.test(trimmed)) {
    return "영문, 숫자, 언더스코어(_)만 사용 가능합니다";
  }
  return null;
}

function validatePasswd(value: string): string | null {
  if (!value) return "필수 입력입니다";
  if (value.length > 20) return "최대 20자까지 입력 가능합니다 (선관위 프로그램 제약)";
  return null;
}

function validateHint(value: string): string | null {
  if (value.length > 50) return "최대 50자까지 입력 가능합니다";
  return null;
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  error,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error: string | null;
  required?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </Label>
      <div className="flex gap-2">
        <Input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={20}
          className="flex-1"
          aria-invalid={error != null}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "비밀번호 숨기기" : "비밀번호 보이기"}
        >
          {show ? "숨김" : "표시"}
        </Button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export default function OrganInfoPage() {
  const { orgId, orgSecCd, orgName } = useAuth();
  // 초기값 true — 마운트 시 곧바로 fetch 시작. setLoading(true)를 effect에서 동기 호출하지 않도록 함.
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [organ, setOrgan] = useState<OrganRow | null>(null);
  const [form, setForm] = useState<FormState>({
    userid: "",
    passwd: "",
    hint1: "",
    hint2: "",
    useSeparateCandidate: false,
    candidateUserid: "",
    candidatePasswd: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string | null>>>({});
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const isSupporter = orgSecCd != null && SUPPORTER_SEC_CDS.has(orgSecCd);

  // load는 await 이후 setState만 호출 — useEffect 동기 setState 회피 (react-hooks/set-state-in-effect)
  const load = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    const supabase = createSupabaseBrowser();
    const { data, error } = await supabase
      .from("organ")
      .select("org_id, org_sec_cd, org_name, userid, passwd, hint1, hint2")
      .eq("org_id", orgId)
      .single();
    if (error || !data) {
      setLoading(false);
      return;
    }
    const row = data as OrganRow;
    setOrgan(row);
    setForm((prev) => ({
      ...prev,
      userid: row.userid ?? "",
      passwd: row.passwd ?? "",
      hint1: row.hint1 ?? "",
      hint2: row.hint2 ?? "",
    }));
    // 후보자 자격증명은 sessionStorage에서 복원 (DB에 저장 안 함)
    if (typeof window !== "undefined") {
      try {
        const raw = sessionStorage.getItem(`${SESSION_KEY}-${orgId}`);
        if (raw) {
          const parsed = JSON.parse(raw) as { userid?: string; passwd?: string };
          if (parsed.userid || parsed.passwd) {
            setForm((prev) => ({
              ...prev,
              useSeparateCandidate: true,
              candidateUserid: parsed.userid ?? "",
              candidatePasswd: parsed.passwd ?? "",
            }));
          }
        }
      } catch {
        // sessionStorage 접근 실패는 무시
      }
    }
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    // microtask로 미루어 effect 동기 setState 회피 (react-hooks/set-state-in-effect)
    Promise.resolve().then(() => {
      void load();
    });
  }, [load]);

  function validateAll(): boolean {
    const e: Partial<Record<keyof FormState, string | null>> = {
      userid: validateUserid(form.userid),
      passwd: validatePasswd(form.passwd),
      hint1: validateHint(form.hint1),
      hint2: validateHint(form.hint2),
    };
    if (isSupporter && form.useSeparateCandidate) {
      e.candidateUserid = validateUserid(form.candidateUserid);
      e.candidatePasswd = validatePasswd(form.candidatePasswd);
    }
    setErrors(e);
    return Object.values(e).every((v) => v == null);
  }

  async function handleSave() {
    setSavedMessage(null);
    if (!orgId) return;
    if (!validateAll()) return;
    setSaving(true);
    const supabase = createSupabaseBrowser();
    const { error } = await supabase
      .from("organ")
      .update({
        userid: form.userid.trim(),
        passwd: form.passwd,
        hint1: form.hint1.trim() || null,
        hint2: form.hint2.trim() || null,
      })
      .eq("org_id", orgId);
    setSaving(false);
    if (error) {
      setSavedMessage(`저장 실패: ${error.message}`);
      return;
    }

    // 후보자 자격증명은 sessionStorage에 저장 (DB에는 저장하지 않음)
    if (typeof window !== "undefined") {
      const key = `${SESSION_KEY}-${orgId}`;
      if (isSupporter && form.useSeparateCandidate && form.candidateUserid && form.candidatePasswd) {
        sessionStorage.setItem(
          key,
          JSON.stringify({
            userid: form.candidateUserid.trim(),
            passwd: form.candidatePasswd,
          }),
        );
      } else {
        sessionStorage.removeItem(key);
      }
    }

    setSavedMessage("저장되었습니다.");
    await load();
  }

  if (!orgId) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-600">기관을 먼저 선택해주세요.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="text-xl font-bold">사용기관관리</h1>

      <Card className="p-4 space-y-2">
        <h2 className="text-sm font-semibold text-gray-500">기관 식별 정보</h2>
        {loading ? (
          <p className="text-sm text-gray-500">불러오는 중...</p>
        ) : organ ? (
          <dl className="grid grid-cols-[120px_1fr] gap-y-1 text-sm">
            <dt className="text-gray-500">기관 ID</dt>
            <dd>{organ.org_id}</dd>
            <dt className="text-gray-500">기관 종류 코드</dt>
            <dd>{organ.org_sec_cd}</dd>
            <dt className="text-gray-500">기관명</dt>
            <dd className="font-medium">{organ.org_name || orgName}</dd>
          </dl>
        ) : (
          <p className="text-sm text-red-600">기관 정보를 찾을 수 없습니다.</p>
        )}
      </Card>

      <Card className="p-4 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">선관위 프로그램 로그인 정보</h2>
          <p className="mt-1 text-xs text-gray-500 leading-relaxed">
            이 정보는 다운로드한 <strong>.db 파일</strong>을 윈도우 선관위 정치자금 회계관리
            프로그램에서 <strong>[자료 복구]</strong> 후 재로그인할 때 사용됩니다. 비밀번호는
            평문으로 저장되며, 본인 기관 외에는 접근할 수 없습니다 (RLS).
          </p>
        </div>

        <div className="space-y-1">
          <Label htmlFor="userid">
            사용자 ID<span className="text-red-500 ml-1">*</span>
          </Label>
          <Input
            id="userid"
            value={form.userid}
            onChange={(e) => setForm((f) => ({ ...f, userid: e.target.value }))}
            maxLength={20}
            placeholder="영문/숫자/_ 최대 20자"
            aria-invalid={errors.userid != null}
          />
          {errors.userid && <p className="text-xs text-red-600">{errors.userid}</p>}
        </div>

        <PasswordField
          id="passwd"
          label="비밀번호"
          value={form.passwd}
          onChange={(v) => setForm((f) => ({ ...f, passwd: v }))}
          error={errors.passwd ?? null}
          required
        />

        <div className="space-y-1">
          <Label htmlFor="hint1">비밀번호 힌트 1</Label>
          <Input
            id="hint1"
            value={form.hint1}
            onChange={(e) => setForm((f) => ({ ...f, hint1: e.target.value }))}
            maxLength={50}
          />
          {errors.hint1 && <p className="text-xs text-red-600">{errors.hint1}</p>}
        </div>

        <div className="space-y-1">
          <Label htmlFor="hint2">비밀번호 힌트 2</Label>
          <Input
            id="hint2"
            value={form.hint2}
            onChange={(e) => setForm((f) => ({ ...f, hint2: e.target.value }))}
            maxLength={50}
          />
          {errors.hint2 && <p className="text-xs text-red-600">{errors.hint2}</p>}
        </div>

        {isSupporter && (
          <div className="border-t pt-4 space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.useSeparateCandidate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, useSeparateCandidate: e.target.checked }))
                }
              />
              <span>
                후보자 계정 자격증명을 별도로 지정 (브라우저 세션에만 저장)
              </span>
            </label>
            {form.useSeparateCandidate && (
              <div className="space-y-3 pl-6">
                <div className="space-y-1">
                  <Label htmlFor="candUserid">후보자 사용자 ID</Label>
                  <Input
                    id="candUserid"
                    value={form.candidateUserid}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, candidateUserid: e.target.value }))
                    }
                    maxLength={20}
                    aria-invalid={errors.candidateUserid != null}
                  />
                  {errors.candidateUserid && (
                    <p className="text-xs text-red-600">{errors.candidateUserid}</p>
                  )}
                </div>
                <PasswordField
                  id="candPasswd"
                  label="후보자 비밀번호"
                  value={form.candidatePasswd}
                  onChange={(v) => setForm((f) => ({ ...f, candidatePasswd: v }))}
                  error={errors.candidatePasswd ?? null}
                />
                <p className="text-xs text-gray-500">
                  이 값은 데이터베이스에 저장되지 않고 브라우저 세션에만 남습니다. 탭을 닫으면
                  사라지며 다음 export 시 다시 입력해야 합니다.
                </p>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 pt-2">
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? "저장 중..." : "저장"}
          </Button>
          <Button variant="outline" onClick={() => load()} disabled={saving || loading}>
            취소(되돌리기)
          </Button>
          {savedMessage && (
            <span
              className={`text-sm ${
                savedMessage.startsWith("저장 실패") ? "text-red-600" : "text-green-700"
              }`}
            >
              {savedMessage}
            </span>
          )}
        </div>
      </Card>
    </div>
  );
}
