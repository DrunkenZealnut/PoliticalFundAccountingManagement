import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import { generateHwpx } from "./generate";
import { getFormDef } from "./form-fields";

/**
 * 서식 44 점자형 선거공보 등 부담비용 지급청구서 (순수 토큰-채움) 통합 테스트.
 * 양식 구조: 사용자 제공 RAG 파일 기준(머리 3 + 수량 7 + 금액 25 + 수령 4 + 선관위명 1 = 40 토큰).
 */
const TEMPLATE = join(process.cwd(), "public/hwpx-templates/form-44-fill.hwpx");

function loadTemplate(): Uint8Array {
  return new Uint8Array(readFileSync(TEMPLATE));
}

async function readSection(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  return zip.file("Contents/section0.xml")!.async("string");
}

const def = getFormDef("44")!;

describe("서식 44 정의", () => {
  it("getFormDef('44') 가 form-44-fill.hwpx · 40 필드 · dataFill 없음", () => {
    expect(def).toBeDefined();
    expect(def.template).toBe("form-44-fill.hwpx");
    expect(def.dataFill).toBeUndefined();
    expect(def.orgScope).toBe("candidate");
    expect(def.fields.length).toBe(40);
  });

  it("핵심 토큰이 정의에 포함된다", () => {
    const tokens = new Set(def.fields.map((f) => f.token));
    for (const t of [
      "선거명_상세", "소속정당명", "후보자명",
      "점자공보_부수", "저장매체_개수",
      "금액_공보_점자인쇄비", "금액_활동보조인_수당", "금액_계_계",
      "수령_예금주", "수령_계좌번호", "수령_비고", "선관위명",
    ]) {
      expect(tokens.has(t), t).toBe(true);
    }
  });

  it("머리 선거명은 const 총선거명이 아닌 수동 입력(선거명_상세)이다", () => {
    // RAG 양식 머리는 구체 선거명 자리 — 공유 `선거명` const 가 자동 주입되면
    // "제9회 전국동시지방선거"라는 무의미한 중복 값이 법정 문서에 들어간다.
    const f = def.fields.find((x) => x.token === "선거명_상세")!;
    expect(f.source).toEqual({ from: "manual" });
    expect(f.required).toBe(true);
    expect(def.fields.some((x) => x.token === "선거명")).toBe(false);
  });
});

describe("서식 44 토큰 치환", () => {
  it("모든 필드 값 입력 시 잔여 토큰 없이 값이 채워진다", async () => {
    const values: Record<string, string> = {};
    for (const f of def.fields) values[f.token] = `[${f.token}]`;

    const { bytes, unresolved } = await generateHwpx(loadTemplate(), values);
    const sec = await readSection(bytes);

    expect(sec).not.toMatch(/\{\{[^}]+\}\}/); // 잔여 토큰 없음
    expect(unresolved).toEqual([]);
    expect(sec).toContain("[후보자명]");
    expect(sec).toContain("[소속정당명]");
    expect(sec).toContain("[금액_계_계]");
    expect(sec).toContain("[저장매체_개수]");
    expect(sec).toContain("[수령_예금주]");
  });

  it("표 셀 토큰이 올바른 행·열 순서로 배치된다 (오배치 가드)", async () => {
    // 3-way 정합성 가드(form-fields.test)는 토큰 '집합'만 비교하므로 셀 맞바꿈을
    // 못 잡는다. 문서 순서(행 우선 → 열)가 곧 셀 위치이므로 출현 순서로 가드한다.
    const values: Record<string, string> = {};
    for (const f of def.fields) values[f.token] = `[${f.token}]`;
    const sec = await readSection((await generateHwpx(loadTemplate(), values)).bytes);

    const ordered = [
      // 수량 표(표0): 공보 3 → 공약서 3 → 저장매체
      "[점자공보_부수]", "[점자공보_매수]", "[점자공보_총매수]",
      "[점자공약서_부수]", "[점자공약서_매수]", "[점자공약서_총매수]", "[저장매체_개수]",
      // 청구금액 표(표1): 행(공보→공약서→저장매체→활동보조인→계) × 열(계→점자인쇄비→한글인쇄료→운반비→수당)
      "[금액_공보_계]", "[금액_공보_점자인쇄비]", "[금액_공보_한글인쇄료]", "[금액_공보_운반비]", "[금액_공보_수당]",
      "[금액_공약서_계]", "[금액_저장매체_계]", "[금액_활동보조인_계]",
      "[금액_계_계]", "[금액_계_수당]",
      // 수령계좌 표(표2)
      "[수령_예금주]", "[수령_금융기관]", "[수령_계좌번호]", "[수령_비고]",
    ];
    const positions = ordered.map((t) => sec.indexOf(t));
    expect(positions.every((p) => p >= 0)).toBe(true);
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i], `${ordered[i]} 는 ${ordered[i - 1]} 뒤에 와야 함`).toBeGreaterThan(positions[i - 1]);
    }
  });

  it("부분 입력(미해당 금액칸 공란) 시에도 잔여 토큰이 남지 않는다", async () => {
    // 활동보조인 행은 수당만 해당 → 나머지 금액칸은 미입력
    const values: Record<string, string> = {
      선거명_상세: "○○구의회 의원선거",
      소속정당명: "△△당",
      후보자명: "홍길동",
      금액_활동보조인_수당: "700,000",
      금액_계_계: "700,000",
      수령_예금주: "홍길동",
      선관위명: "○○구",
    };
    const { bytes } = await generateHwpx(loadTemplate(), values);
    const sec = await readSection(bytes);

    expect(sec).not.toMatch(/\{\{[^}]+\}\}/); // 미입력 토큰도 stripUnresolvedTokens 로 제거
    expect(sec).toContain("홍길동");
    expect(sec).toContain("700,000");
    expect(sec).toContain("○○구선거관리위원회"); // {{선관위명}}선거관리위원회
  });
});
