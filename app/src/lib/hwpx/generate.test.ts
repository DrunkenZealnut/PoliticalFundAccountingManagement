import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import { generateHwpx } from "./generate";

const TEMPLATE = join(process.cwd(), "public/hwpx-templates/form-2-1.hwpx");

function loadTemplate(): Uint8Array {
  return new Uint8Array(readFileSync(TEMPLATE));
}

const VALUES: Record<string, string> = {
  회계책임자명: "홍길동",
  회계책임자명_한자: "洪吉童",
  회계책임자_주소: "서울시 종로구 세종대로 1",
  회계책임자_전화: "02-555-1234",
  수입계좌_예금주: "홍길동",
  수입계좌_금융기관: "국민은행",
  수입계좌_번호: "123-45-678900",
  지출계좌_예금주: "홍길동",
  지출계좌_금융기관: "국민은행",
  지출계좌_번호: "123-45-678911",
  선거명: "제9회 전국동시지방선거",
  후보자명: "김후보",
  선관위명: "서울특별시",
};

async function readSection(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  return zip.file("Contents/section0.xml")!.async("string");
}

describe("generateHwpx", () => {
  it("모든 토큰을 값으로 치환한다", async () => {
    const { bytes } = await generateHwpx(loadTemplate(), VALUES);
    const sec = await readSection(bytes);
    expect(sec).not.toMatch(/\{\{[^}]+\}\}/); // 잔여 토큰 없음
    expect(sec).toContain("홍길동");
    expect(sec).toContain("국민은행");
    expect(sec).toContain("김후보");
  });

  it("미입력 토큰은 빈 문자열로 제거한다", async () => {
    const { bytes, unresolved } = await generateHwpx(loadTemplate(), { 회계책임자명: "홍길동" });
    const sec = await readSection(bytes);
    expect(sec).not.toMatch(/\{\{[^}]+\}\}/);
    expect(unresolved.length).toBeGreaterThan(0); // 입력 안 된 토큰들 보고
  });

  it("값의 XML 특수문자를 escape 한다", async () => {
    const { bytes } = await generateHwpx(loadTemplate(), { ...VALUES, 회계책임자명: "A&B<C>" });
    const sec = await readSection(bytes);
    expect(sec).toContain("A&amp;B&lt;C&gt;");
    expect(sec).not.toContain("A&B<C>");
  });

  it("결과물의 mimetype 은 첫 엔트리이며 STORED(무압축)이다", async () => {
    const { bytes } = await generateHwpx(loadTemplate(), VALUES);
    // 첫 local file header: PK\x03\x04, compression method @offset8(2B)=0, filename @offset30
    expect(bytes[0]).toBe(0x50); // P
    expect(bytes[1]).toBe(0x4b); // K
    const method = bytes[8] | (bytes[10] /* unused */ & 0); // method low byte
    expect(bytes[8]).toBe(0); // STORED low byte
    expect(bytes[9]).toBe(0); // STORED high byte
    void method;
    const nameBytes = bytes.slice(30, 30 + "mimetype".length);
    expect(Buffer.from(nameBytes).toString("utf8")).toBe("mimetype");
  });

  it("결과물을 다시 열면 mimetype 값이 보존된다", async () => {
    const { bytes } = await generateHwpx(loadTemplate(), VALUES);
    const zip = await JSZip.loadAsync(bytes);
    expect(await zip.file("mimetype")!.async("string")).toBe("application/hwp+zip");
  });
});
