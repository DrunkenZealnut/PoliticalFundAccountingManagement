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
  reg_num: string | null;
  rep_name: string | null;
  acct_name: string | null;
  comm: string | null;
  acc_from: string | null;
  acc_to: string | null;
  userid: string | null;
  passwd: string | null;
  hint1: string | null;
  hint2: string | null;
  // PFund2 호환 후보자 정보 (010 마이그레이션)
  candidate_org_name: string | null;
  candidate_reg_num: string | null;
  candidate_reg_date: string | null;
  candidate_post: string | null;
  candidate_addr: string | null;
  candidate_addr_detail: string | null;
  candidate_tel: string | null;
  candidate_fax: string | null;
  candidate_rep_name: string | null;
  candidate_acct_name: string | null;
  candidate_userid: string | null;
  candidate_passwd: string | null;
  candidate_hint1: string | null;
  candidate_hint2: string | null;
}

interface FormState {
  // 후원회/단일 organ 기본 정보
  org_name: string;
  reg_num: string;
  rep_name: string;
  acct_name: string;
  comm: string;
  acc_from: string;
  acc_to: string;
  // 후원회 자격증명
  userid: string;
  passwd: string;
  hint1: string;
  hint2: string;
  // 페어 export 임시 자격증명 (sessionStorage)
  useSeparateCandidate: boolean;
  candidateUserid: string;
  candidatePasswd: string;
  // PFund2 호환 후보자 영구 정보 (DB 저장)
  candidate_org_name: string;
  candidate_reg_num: string;
  candidate_reg_date: string;
  candidate_post: string;
  candidate_addr: string;
  candidate_addr_detail: string;
  candidate_tel: string;
  candidate_fax: string;
  candidate_rep_name: string;
  candidate_acct_name: string;
  candidate_userid_db: string;
  candidate_passwd_db: string;
  candidate_hint1: string;
  candidate_hint2: string;
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

function validateOrgName(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "기관명은 필수입니다";
  if (trimmed.length > 100) return "최대 100자까지 입력 가능합니다";
  return null;
}

function validateRegNum(value: string): string | null {
  if (!value) return null; // optional
  if (value.length > 13) return "최대 13자까지 입력 가능합니다";
  return null;
}

function validatePersonName(value: string): string | null {
  if (value.length > 50) return "최대 50자까지 입력 가능합니다";
  return null;
}

function validateComm(value: string): string | null {
  if (value.length > 50) return "최대 50자까지 입력 가능합니다";
  return null;
}

function validateAccDate(value: string): string | null {
  if (!value) return null; // optional
  if (!/^\d{8}$/.test(value)) return "YYYYMMDD 8자리 숫자로 입력해주세요";
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
  const { orgId, orgSecCd } = useAuth();
  // 초기값 true — 마운트 시 곧바로 fetch 시작. setLoading(true)를 effect에서 동기 호출하지 않도록 함.
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [organ, setOrgan] = useState<OrganRow | null>(null);
  const [form, setForm] = useState<FormState>({
    org_name: "",
    reg_num: "",
    rep_name: "",
    acct_name: "",
    comm: "",
    acc_from: "",
    acc_to: "",
    userid: "",
    passwd: "",
    hint1: "",
    hint2: "",
    useSeparateCandidate: false,
    candidateUserid: "",
    candidatePasswd: "",
    candidate_org_name: "",
    candidate_reg_num: "",
    candidate_reg_date: "",
    candidate_post: "",
    candidate_addr: "",
    candidate_addr_detail: "",
    candidate_tel: "",
    candidate_fax: "",
    candidate_rep_name: "",
    candidate_acct_name: "",
    candidate_userid_db: "",
    candidate_passwd_db: "",
    candidate_hint1: "",
    candidate_hint2: "",
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
      .select(
        "org_id, org_sec_cd, org_name, reg_num, rep_name, acct_name, comm, acc_from, acc_to, userid, passwd, hint1, hint2, candidate_org_name, candidate_reg_num, candidate_reg_date, candidate_post, candidate_addr, candidate_addr_detail, candidate_tel, candidate_fax, candidate_rep_name, candidate_acct_name, candidate_userid, candidate_passwd, candidate_hint1, candidate_hint2",
      )
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
      org_name: row.org_name ?? "",
      reg_num: row.reg_num ?? "",
      rep_name: row.rep_name ?? "",
      acct_name: row.acct_name ?? "",
      comm: row.comm ?? "",
      acc_from: row.acc_from ?? "",
      acc_to: row.acc_to ?? "",
      userid: row.userid ?? "",
      passwd: row.passwd ?? "",
      hint1: row.hint1 ?? "",
      hint2: row.hint2 ?? "",
      candidate_org_name: row.candidate_org_name ?? "",
      candidate_reg_num: row.candidate_reg_num ?? "",
      candidate_reg_date: row.candidate_reg_date ?? "",
      candidate_post: row.candidate_post ?? "",
      candidate_addr: row.candidate_addr ?? "",
      candidate_addr_detail: row.candidate_addr_detail ?? "",
      candidate_tel: row.candidate_tel ?? "",
      candidate_fax: row.candidate_fax ?? "",
      candidate_rep_name: row.candidate_rep_name ?? "",
      candidate_acct_name: row.candidate_acct_name ?? "",
      candidate_userid_db: row.candidate_userid ?? "",
      candidate_passwd_db: row.candidate_passwd ?? "",
      candidate_hint1: row.candidate_hint1 ?? "",
      candidate_hint2: row.candidate_hint2 ?? "",
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
      org_name: validateOrgName(form.org_name),
      reg_num: validateRegNum(form.reg_num),
      rep_name: validatePersonName(form.rep_name),
      acct_name: validatePersonName(form.acct_name),
      comm: validateComm(form.comm),
      acc_from: validateAccDate(form.acc_from),
      acc_to: validateAccDate(form.acc_to),
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
        org_name: form.org_name.trim(),
        reg_num: form.reg_num.trim() || null,
        rep_name: form.rep_name.trim() || null,
        acct_name: form.acct_name.trim() || null,
        comm: form.comm.trim() || null,
        acc_from: form.acc_from.trim() || null,
        acc_to: form.acc_to.trim() || null,
        userid: form.userid.trim(),
        passwd: form.passwd,
        hint1: form.hint1.trim() || null,
        hint2: form.hint2.trim() || null,
        candidate_org_name: form.candidate_org_name.trim() || null,
        candidate_reg_num: form.candidate_reg_num.trim() || null,
        candidate_reg_date: form.candidate_reg_date.trim() || null,
        candidate_post: form.candidate_post.trim() || null,
        candidate_addr: form.candidate_addr.trim() || null,
        candidate_addr_detail: form.candidate_addr_detail.trim() || null,
        candidate_tel: form.candidate_tel.trim() || null,
        candidate_fax: form.candidate_fax.trim() || null,
        candidate_rep_name: form.candidate_rep_name.trim() || null,
        candidate_acct_name: form.candidate_acct_name.trim() || null,
        candidate_userid: form.candidate_userid_db.trim() || null,
        candidate_passwd: form.candidate_passwd_db || null,
        candidate_hint1: form.candidate_hint1.trim() || null,
        candidate_hint2: form.candidate_hint2.trim() || null,
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

      <Card className="p-4 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">기관 식별 정보</h2>
          <p className="mt-1 text-xs text-gray-500 leading-relaxed">
            여기에 입력한 값은 PFund2 호환 <strong>.db 파일</strong>의 <code>ORGAN</code> 테이블에
            그대로 들어갑니다. PFund2에서 [자료 복구] 시 기관명 일치 검증을 통과하려면 정식명을
            정확히 입력해주세요 (예: <em>동대문구라선거구구의회의원후보자오준석후원회</em>).
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500">불러오는 중...</p>
        ) : !organ ? (
          <p className="text-sm text-red-600">기관 정보를 찾을 수 없습니다.</p>
        ) : (
          <>
            <dl className="grid grid-cols-[120px_1fr] gap-y-1 text-sm">
              <dt className="text-gray-500">기관 ID</dt>
              <dd>{organ.org_id}</dd>
              <dt className="text-gray-500">기관 종류 코드</dt>
              <dd>{organ.org_sec_cd}</dd>
            </dl>

            <div className="space-y-1">
              <Label htmlFor="org_name">
                기관 정식명<span className="text-red-500 ml-1">*</span>
              </Label>
              <Input
                id="org_name"
                value={form.org_name}
                onChange={(e) => setForm((f) => ({ ...f, org_name: e.target.value }))}
                maxLength={100}
                aria-invalid={errors.org_name != null}
              />
              {errors.org_name && <p className="text-xs text-red-600">{errors.org_name}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="reg_num">등록번호 (선거구/사업자)</Label>
                <Input
                  id="reg_num"
                  value={form.reg_num}
                  onChange={(e) => setForm((f) => ({ ...f, reg_num: e.target.value }))}
                  maxLength={13}
                  placeholder="예: 2348261566"
                  aria-invalid={errors.reg_num != null}
                />
                {errors.reg_num && <p className="text-xs text-red-600">{errors.reg_num}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="comm">관할 선관위</Label>
                <Input
                  id="comm"
                  value={form.comm}
                  onChange={(e) => setForm((f) => ({ ...f, comm: e.target.value }))}
                  maxLength={50}
                  placeholder="예: 동대문구선거관리위원회"
                  aria-invalid={errors.comm != null}
                />
                {errors.comm && <p className="text-xs text-red-600">{errors.comm}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="rep_name">대표자명</Label>
                <Input
                  id="rep_name"
                  value={form.rep_name}
                  onChange={(e) => setForm((f) => ({ ...f, rep_name: e.target.value }))}
                  maxLength={50}
                  placeholder="후원회 단위면 후보자 본명 권장"
                  aria-invalid={errors.rep_name != null}
                />
                {errors.rep_name && <p className="text-xs text-red-600">{errors.rep_name}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="acct_name">회계책임자명</Label>
                <Input
                  id="acct_name"
                  value={form.acct_name}
                  onChange={(e) => setForm((f) => ({ ...f, acct_name: e.target.value }))}
                  maxLength={50}
                  aria-invalid={errors.acct_name != null}
                />
                {errors.acct_name && <p className="text-xs text-red-600">{errors.acct_name}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="acc_from">회계기간 시작 (YYYYMMDD)</Label>
                <Input
                  id="acc_from"
                  value={form.acc_from}
                  onChange={(e) => setForm((f) => ({ ...f, acc_from: e.target.value }))}
                  maxLength={8}
                  placeholder="예: 20260101"
                  aria-invalid={errors.acc_from != null}
                />
                {errors.acc_from && <p className="text-xs text-red-600">{errors.acc_from}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="acc_to">회계기간 종료 (YYYYMMDD)</Label>
                <Input
                  id="acc_to"
                  value={form.acc_to}
                  onChange={(e) => setForm((f) => ({ ...f, acc_to: e.target.value }))}
                  maxLength={8}
                  placeholder="예: 20261231"
                  aria-invalid={errors.acc_to != null}
                />
                {errors.acc_to && <p className="text-xs text-red-600">{errors.acc_to}</p>}
              </div>
            </div>

            {isSupporter && (!form.rep_name.trim() && !form.acct_name.trim()) && (
              <div className="rounded bg-yellow-50 border border-yellow-200 p-2 text-xs text-yellow-800">
                ⚠️ 후원회 단위 기관입니다. <strong>대표자명</strong>이 비어 있으면 PFund2의
                후보자 행이 자동 유도되며 (예: 기관명에서 추출), 정확하지 않을 수 있습니다.
                후보자 본명을 직접 입력하는 것을 권장합니다.
              </div>
            )}
          </>
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

      {isSupporter && (
        <Card className="p-4 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">
              후보자 정보 (PFund2 호환) <span className="text-xs font-normal text-gray-500">선택</span>
            </h2>
            <p className="mt-1 text-xs text-gray-500 leading-relaxed">
              PFund2는 후보자(ORG_ID=1)와 후원회(ORG_ID=2)를 별도 `.db`로 운영합니다. 정확한
              자료 복구를 위해 후보자 본인 정보를 입력해주세요 (PFund2 Fund_Data_1.db의 ORGAN
              행과 동일하게). 비워두면 후원회 정식명에서 자동 유도되거나 fallback 값이 사용되는데,
              부정확할 수 있습니다.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="candidate_org_name">후보자 ORG_NAME</Label>
              <Input
                id="candidate_org_name"
                value={form.candidate_org_name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, candidate_org_name: e.target.value }))
                }
                maxLength={100}
                placeholder="예: 오준석후보"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="candidate_reg_num">후보자 REG_NUM (생년월일)</Label>
              <Input
                id="candidate_reg_num"
                value={form.candidate_reg_num}
                onChange={(e) =>
                  setForm((f) => ({ ...f, candidate_reg_num: e.target.value }))
                }
                maxLength={15}
                placeholder="예: 19850228"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="candidate_rep_name">후보자 REP_NAME (대표자)</Label>
              <Input
                id="candidate_rep_name"
                value={form.candidate_rep_name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, candidate_rep_name: e.target.value }))
                }
                maxLength={50}
                placeholder="예: 곽호준 (선거사무장)"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="candidate_acct_name">후보자 ACCT_NAME (회계담당)</Label>
              <Input
                id="candidate_acct_name"
                value={form.candidate_acct_name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, candidate_acct_name: e.target.value }))
                }
                maxLength={50}
                placeholder="예: 오준석 (후보자 본인)"
              />
            </div>
          </div>

          <div className="grid grid-cols-[100px_1fr] gap-3 items-end">
            <div className="space-y-1">
              <Label htmlFor="candidate_post">우편번호</Label>
              <Input
                id="candidate_post"
                value={form.candidate_post}
                onChange={(e) => setForm((f) => ({ ...f, candidate_post: e.target.value }))}
                maxLength={7}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="candidate_addr">후보자 주소</Label>
              <Input
                id="candidate_addr"
                value={form.candidate_addr}
                onChange={(e) => setForm((f) => ({ ...f, candidate_addr: e.target.value }))}
                maxLength={100}
                placeholder="예: 서울특별시 동대문구 휘경로 14 (이문동)"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="candidate_addr_detail">상세주소</Label>
              <Input
                id="candidate_addr_detail"
                value={form.candidate_addr_detail}
                onChange={(e) =>
                  setForm((f) => ({ ...f, candidate_addr_detail: e.target.value }))
                }
                maxLength={100}
                placeholder="예: 2층"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="candidate_tel">전화</Label>
              <Input
                id="candidate_tel"
                value={form.candidate_tel}
                onChange={(e) => setForm((f) => ({ ...f, candidate_tel: e.target.value }))}
                maxLength={20}
                placeholder="예: 0260811700"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="candidate_reg_date">등록일</Label>
              <Input
                id="candidate_reg_date"
                value={form.candidate_reg_date}
                onChange={(e) =>
                  setForm((f) => ({ ...f, candidate_reg_date: e.target.value }))
                }
                maxLength={8}
                placeholder="YYYYMMDD"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="candidate_fax">팩스</Label>
              <Input
                id="candidate_fax"
                value={form.candidate_fax}
                onChange={(e) => setForm((f) => ({ ...f, candidate_fax: e.target.value }))}
                maxLength={20}
              />
            </div>
          </div>

          <div className="border-t pt-3 space-y-3">
            <p className="text-xs font-semibold text-gray-700">
              후보자 PFund2 로그인 (영구 저장)
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="candidate_userid_db">후보자 USERID</Label>
                <Input
                  id="candidate_userid_db"
                  value={form.candidate_userid_db}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, candidate_userid_db: e.target.value }))
                  }
                  maxLength={20}
                  placeholder="예: ohjunsuk"
                />
              </div>
              <PasswordField
                id="candidate_passwd_db"
                label="후보자 비밀번호"
                value={form.candidate_passwd_db}
                onChange={(v) =>
                  setForm((f) => ({ ...f, candidate_passwd_db: v }))
                }
                error={null}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="candidate_hint1">힌트 1</Label>
                <Input
                  id="candidate_hint1"
                  value={form.candidate_hint1}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, candidate_hint1: e.target.value }))
                  }
                  maxLength={50}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="candidate_hint2">힌트 2</Label>
                <Input
                  id="candidate_hint2"
                  value={form.candidate_hint2}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, candidate_hint2: e.target.value }))
                  }
                  maxLength={50}
                />
              </div>
            </div>
          </div>

          <div className="rounded bg-blue-50 border border-blue-200 p-2 text-xs text-blue-800">
            💡 <strong>Tip</strong>: PFund2 데이터를 가지고 있다면 `Fund_Master.db` 또는
            `Fund_Data_1.db`/`Fund_Data_2.db`를 <a href="/dashboard/submit" className="underline">제출파일생성</a> 페이지의
            <em>PFund2 .db 가져오기</em>로 한 번 import하면 본 후보자 정보가 자동으로 채워집니다.
          </div>
        </Card>
      )}
    </div>
  );
}
