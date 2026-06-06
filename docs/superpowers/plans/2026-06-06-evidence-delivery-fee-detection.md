# 증빙 PDF 배송비 감지 → 별도 등록 안내 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 증빙 PDF를 첨부할 때 텍스트를 추출해 배송비 항목이 있으면 "배송비는 별도 항목으로 등록하라"는 인라인 경고 배너를 보여준다.

**Architecture:** 순수 감지 함수 `detectDeliveryFee(text)`와 I/O 함수 `extractPdfText(base64)`를 한 모듈로 분리해 감지 규칙을 파일 없이 단위 테스트한다. `EvidenceFileManager`는 PDF 첨부 시 두 함수를 호출해 `deliveryWarning` state를 켜고 노란 배너를 렌더한다. 비차단 — 사용자는 무시하고 저장 가능. 이미지는 검사하지 않는다.

**Tech Stack:** TypeScript, React 19, Next.js 16(App Router, 클라이언트 컴포넌트), pdfjs-dist(신규), Vitest + @testing-library/react(happy-dom).

> **실행 환경 메모:** 모든 명령은 `app/` 디렉토리에서 실행한다. 파일 경로는 리포 루트 기준(`app/src/...`)으로 표기했다. `node_modules/.bin`이 비어 있어 vitest는 node 진입점으로 직접 실행한다(아래 명령 참고).

---

## File Structure

- **Create** `app/src/lib/evidence/delivery-fee-detector.ts`
  - `detectDeliveryFee(text)` — 순수 함수. 배송비 키워드 매칭.
  - `extractPdfText(base64)` — pdfjs-dist 동적 import로 PDF 텍스트 추출.
- **Create** `app/src/lib/evidence/delivery-fee-detector.test.ts`
  - `detectDeliveryFee` 단위 테스트(감지/오탐 케이스).
- **Modify** `app/package.json`
  - `pdfjs-dist` 의존성 추가.
- **Modify** `app/src/components/evidence/evidence-file-manager.tsx`
  - 첨부 시 PDF 검사 → `deliveryWarning` state → 인라인 경고 배너.
- **Modify** `app/src/components/evidence/evidence-file-manager.test.tsx`
  - detector 모듈을 모킹해 배너 노출/해제 테스트 추가.

---

## Task 1: `detectDeliveryFee` 순수 함수 (TDD)

**Files:**
- Create: `app/src/lib/evidence/delivery-fee-detector.ts`
- Test: `app/src/lib/evidence/delivery-fee-detector.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/src/lib/evidence/delivery-fee-detector.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { detectDeliveryFee } from "./delivery-fee-detector";

describe("detectDeliveryFee", () => {
  it("점자 견적서의 '박스/포장/발송비'를 감지한다", () => {
    const text = "점자 선거 공보물 제작비 316,800 소계 박스/포장/발송비 14% 44,352 합계";
    const r = detectDeliveryFee(text);
    expect(r.matched).toBe(true);
    expect(r.keyword).toContain("발송비");
  });

  it("'운송비'를 감지한다", () => {
    expect(detectDeliveryFee("점자공보물 운송비 44,352원").matched).toBe(true);
  });

  it("'택배비 3,000원'을 감지한다", () => {
    expect(detectDeliveryFee("상품가 50,000 택배비 3,000원").matched).toBe(true);
  });

  it("'배달료'를 감지한다", () => {
    expect(detectDeliveryFee("배달료 4,500").matched).toBe(true);
  });

  it("'퀵서비스'를 감지한다", () => {
    expect(detectDeliveryFee("퀵서비스 이용").matched).toBe(true);
  });

  it("안내문구 '이용문의(구매/취소/배송)'는 오탐하지 않는다", () => {
    expect(detectDeliveryFee("이용문의 (구매/취소/배송)").matched).toBe(false);
  });

  it("'배송지 주소', '배송 안내'는 오탐하지 않는다", () => {
    expect(detectDeliveryFee("배송지 주소 서울 / 배송 안내").matched).toBe(false);
  });

  it("배송비 언급이 없으면 미감지", () => {
    expect(detectDeliveryFee("점자 공보물 제작비 316,800원").matched).toBe(false);
  });

  it("빈 문자열은 미감지", () => {
    expect(detectDeliveryFee("").matched).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `app/`):
```bash
node node_modules/vitest/vitest.mjs run src/lib/evidence/delivery-fee-detector.test.ts
```
Expected: FAIL — `detectDeliveryFee is not a function` / 모듈을 찾을 수 없음.

- [ ] **Step 3: Write minimal implementation**

Create `app/src/lib/evidence/delivery-fee-detector.ts`:

```ts
/**
 * 증빙 텍스트에서 배송비(운송·발송·택배 등) 비용 항목을 감지한다.
 * 단순 "배송" 매칭은 안내문구("구매/취소/배송", "배송지")를 오탐하므로,
 * 비용을 뜻하는 접미(비/료/요금)가 붙은 경우와 "퀵서비스"만 매칭한다.
 */
const DELIVERY_FEE_PATTERN =
  /(배송|운송|발송|택배|운반|배달)\s*(비|료|요금)|퀵\s*(서비스|비|료)/;

export function detectDeliveryFee(text: string): { matched: boolean; keyword?: string } {
  if (!text) return { matched: false };
  const m = DELIVERY_FEE_PATTERN.exec(text);
  return m ? { matched: true, keyword: m[0].trim() } : { matched: false };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `app/`):
```bash
node node_modules/vitest/vitest.mjs run src/lib/evidence/delivery-fee-detector.test.ts
```
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/evidence/delivery-fee-detector.ts app/src/lib/evidence/delivery-fee-detector.test.ts
git commit -m "feat(evidence): 배송비 키워드 감지 순수 함수 detectDeliveryFee"
```

---

## Task 2: `extractPdfText` (pdfjs-dist 의존성 + PDF 텍스트 추출)

**Files:**
- Modify: `app/package.json`
- Modify: `app/src/lib/evidence/delivery-fee-detector.ts`

- [ ] **Step 1: Add pdfjs-dist dependency**

Run (from `app/`):
```bash
npm install pdfjs-dist
```
Expected: `package.json`의 `dependencies`에 `"pdfjs-dist": "^4..."`(또는 최신) 추가.
> `.bin`이 비어도 `npm install`(패키지 설치) 자체는 동작한다. 실패 시 `package.json`에 직접 추가 후 `npm install` 재시도.

- [ ] **Step 2: Append `extractPdfText` to the detector module**

`app/src/lib/evidence/delivery-fee-detector.ts` 끝에 추가:

```ts
/** data URL 접두부를 제외한 base64 문자열을 Uint8Array로 변환한다. */
function base64ToUint8Array(base64: string): Uint8Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * PDF(base64)에서 텍스트 레이어를 추출한다. 클라이언트 전용.
 * pdfjs를 동적 import 하여 이 모듈을 import하는 단위 테스트(순수 함수)가
 * 브라우저 전용 코드를 로드하지 않게 한다.
 * 텍스트가 없는 스캔 PDF/암호화 PDF 등은 빈 문자열 또는 throw → 호출부에서 무시.
 */
export async function extractPdfText(base64: string): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const pdf = await pdfjs.getDocument({ data: base64ToUint8Array(base64) }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it) => ("str" in it ? it.str : "")).join(" ") + "\n";
  }
  return text;
}
```

- [ ] **Step 3: Verify detector unit tests still pass (pdfjs import must not break them)**

Run (from `app/`):
```bash
node node_modules/vitest/vitest.mjs run src/lib/evidence/delivery-fee-detector.test.ts
```
Expected: PASS (9 tests) — 동적 import이므로 pdfjs는 로드되지 않는다.

- [ ] **Step 4: Verify the build resolves the worker import**

Run (from `app/`):
```bash
node node_modules/next/dist/bin/next build
```
Expected: 빌드 성공. pdfjs worker URL 관련 에러가 없어야 한다.
> 만약 worker 해석 에러가 나면, 같은 파일에서 `workerSrc`를
> `` `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs` ``
> 로 대체한다(CDN fallback).

- [ ] **Step 5: Commit**

```bash
git add app/package.json app/package-lock.json app/src/lib/evidence/delivery-fee-detector.ts
git commit -m "feat(evidence): pdfjs-dist로 증빙 PDF 텍스트 추출 extractPdfText"
```

---

## Task 3: `EvidenceFileManager` 배너 통합

**Files:**
- Modify: `app/src/components/evidence/evidence-file-manager.tsx`

- [ ] **Step 1: Import the detector**

`app/src/components/evidence/evidence-file-manager.tsx` 상단 import 블록(8번째 줄 `fileToBase64` import 아래)에 추가:

```ts
import { detectDeliveryFee, extractPdfText } from "@/lib/evidence/delivery-fee-detector";
```

- [ ] **Step 2: Add warning state**

컴포넌트 함수 본문에서 기존 `const inputRef = useRef<HTMLInputElement>(null);`(64번째 줄) 아래에 추가:

```ts
  const [deliveryWarning, setDeliveryWarning] = useState(false);
```

- [ ] **Step 3: Check PDFs on attach inside `handleSelect`**

`handleSelect` 내부에서 `onPendingChange(next);`(109번째 줄) **바로 다음 줄**에 PDF 검사 블록을 추가:

```ts
    // 새로 추가된 PDF에서 배송비 항목을 감지하면 별도 등록 안내 배너를 켠다.
    for (const file of files.slice(0, room)) {
      if (file.type !== "application/pdf") continue;
      try {
        const base64 = await fileToBase64(file);
        const text = await extractPdfText(base64);
        if (detectDeliveryFee(text).matched) {
          setDeliveryWarning(true);
          break;
        }
      } catch {
        // 추출 실패(스캔/암호화 PDF 등)는 조용히 무시
      }
    }
```

- [ ] **Step 4: Reset the warning when all pending files are removed**

`removePending` 함수(117~119번째 줄)를 다음으로 교체:

```ts
  function removePending(idx: number) {
    const next = pendingFiles.filter((_, i) => i !== idx);
    onPendingChange(next);
    if (next.length === 0) setDeliveryWarning(false);
  }
```

- [ ] **Step 5: Render the inline warning banner**

`<Label>...</Label>` 블록(133~138번째 줄) **바로 아래**에 배너를 추가:

```tsx
      {deliveryWarning && (
        <div
          role="alert"
          className="mt-1 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800"
        >
          ⚠️ 이 증빙에 배송비(운송·발송·택배 등)가 포함된 것 같습니다. 배송비는 별도 항목으로 등록하세요.
        </div>
      )}
```

- [ ] **Step 6: Lint the changed file**

Run (from `app/`):
```bash
node node_modules/eslint/bin/eslint.js src/components/evidence/evidence-file-manager.tsx
```
Expected: 에러 없음.

- [ ] **Step 7: Commit**

```bash
git add app/src/components/evidence/evidence-file-manager.tsx
git commit -m "feat(evidence): 증빙 PDF 배송비 감지 시 별도 등록 안내 배너"
```

---

## Task 4: 컴포넌트 통합 테스트 (배너 노출/해제)

**Files:**
- Modify: `app/src/components/evidence/evidence-file-manager.test.tsx`

- [ ] **Step 1: Write the failing test**

`app/src/components/evidence/evidence-file-manager.test.tsx`의 import 줄들 **아래**(3번째 줄 `EvidenceFileManager` import 다음)에 모듈 모킹을 추가:

```ts
import { vi } from "vitest";

vi.mock("@/lib/evidence/delivery-fee-detector", () => ({
  extractPdfText: vi.fn().mockResolvedValue("점자 박스/포장/발송비 44,352"),
  detectDeliveryFee: vi.fn().mockReturnValue({ matched: true, keyword: "발송비" }),
}));
```
> 파일 첫 줄에 이미 `import { describe, it, expect, vi, ... } from "vitest";`가 있다.
> `vi`가 이미 import되어 있으므로 위에서 `import { vi } from "vitest";` 줄은 생략하고,
> `vi.mock(...)` 호출만 import 블록 바로 아래에 둔다.

그리고 `describe("EvidenceFileManager", ...)` 블록 안에 테스트를 추가:

```ts
  it("배송비가 감지된 PDF를 첨부하면 별도 등록 안내 배너를 표시한다", async () => {
    render(
      <EvidenceFileManager accBookId={null} orgId={7} pendingFiles={[]} onPendingChange={noop} />
    );
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const pdf = new File(["%PDF-1.4 dummy"], "견적서.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [pdf] } });

    expect(
      await screen.findByText(/배송비는 별도 항목으로 등록하세요/)
    ).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `app/`):
```bash
node node_modules/vitest/vitest.mjs run src/components/evidence/evidence-file-manager.test.tsx
```
Expected: 새 테스트 FAIL — 배너 텍스트를 찾지 못함(아직 Task 3 미적용 상태로 실행하면 실패. Task 3 적용 후라면 이 테스트가 동작을 고정한다).
> Task 3가 이미 완료된 상태라면 Step 1 작성 직후 바로 PASS 할 수 있다. 그 경우
> 테스트가 실제로 동작을 검증하는지 확인하려면 모킹의 `matched`를 `false`로 잠시
> 바꿔 FAIL 하는지 본 뒤 되돌린다.

- [ ] **Step 3: Make it pass**

Task 3가 완료되어 있으면 추가 구현 없이 PASS 한다.

Run (from `app/`):
```bash
node node_modules/vitest/vitest.mjs run src/components/evidence/evidence-file-manager.test.tsx
```
Expected: PASS — 기존 테스트 + 새 배너 테스트 모두 통과.

- [ ] **Step 4: Run the full evidence test suite**

Run (from `app/`):
```bash
node node_modules/vitest/vitest.mjs run src/lib/evidence src/components/evidence
```
Expected: 전체 PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/components/evidence/evidence-file-manager.test.tsx
git commit -m "test(evidence): 배송비 감지 배너 노출 통합 테스트"
```

---

## Self-Review 결과

- **Spec coverage:** PDF 텍스트만 검사(Task 2), 인라인 비차단 배너(Task 3 Step 5), 오탐 방지 규칙(Task 1 테스트/구현), 순수·I/O 분리(Task 1·2), pdfjs-dist 신규 의존성(Task 2), detectDeliveryFee 단위 테스트(Task 1) — 스펙 각 항목이 태스크에 매핑됨. 이미지 미검사는 Task 3 Step 3의 `file.type !== "application/pdf" continue`로 충족.
- **Placeholder scan:** TODO/TBD 없음. 모든 코드 스텝에 실제 코드 포함. worker 해석 실패에 대한 CDN fallback은 구체 코드로 제시.
- **Type consistency:** `detectDeliveryFee(text) → { matched, keyword? }`, `extractPdfText(base64) → Promise<string>` — Task 3·4에서 동일 시그니처로 사용. `deliveryWarning`/`setDeliveryWarning` 명칭 전 태스크 일관.
- **비범위 확인:** 금액 자동추출/자동분개/과거 데이터 재검사는 계획에 포함하지 않음(스펙 §8 준수).
