import { describe, it, expect } from "vitest";
import { mapReimbItemKey, REIMB_ITEMS } from "./reimbursement-item-map";

describe("mapReimbItemKey — 지출유형 → 보전 항목", () => {
  it("§61 간판·현판·현수막·옥상구조물(선거사무소)", () => {
    expect(mapReimbItemKey("선거사무소", "간판")).toBe("signboard");
    expect(mapReimbItemKey("선거사무소", "현판")).toBe("signboard");
    expect(mapReimbItemKey("선거사무소", "현수막")).toBe("signboard");
    expect(mapReimbItemKey("선거사무소", "옥상구조물")).toBe("signboard");
  });

  it("선거사무소 '유지비용'은 §61 아님 → 미매핑(양쪽 존재 모호)", () => {
    expect(mapReimbItemKey("선거사무소", "유지비용")).toBeNull();
  });

  it("§67 거리게시용 현수막 (level1 전체)", () => {
    expect(mapReimbItemKey("거리게시용현수막", "거리게시용현수막")).toBe("street_banner");
    expect(mapReimbItemKey("거리게시용현수막", null)).toBe("street_banner");
  });

  it("§68 어깨띠 등 소품", () => {
    for (const l2 of ["어깨띠", "윗옷", "모자", "소품"]) {
      expect(mapReimbItemKey("소품", l2)).toBe("props");
    }
  });

  it("§79 공개장소 연설·대담차량 (level1 전체)", () => {
    for (const l2 of ["차량", "무대연단", "확성장치", "로고송", "발전기"]) {
      expect(mapReimbItemKey("공개장소연설대담", l2)).toBe("speech_vehicle");
    }
  });

  it("§82의5 문자메시지 (전화·전자우편은 제외)", () => {
    expect(mapReimbItemKey("전화/전자우편/문자메시지", "문자메시지")).toBe("sms");
    expect(mapReimbItemKey("전화/전자우편/문자메시지", "전자우편")).toBeNull();
    expect(mapReimbItemKey("전화/전자우편/문자메시지", "전화/인터넷포함")).toBeNull();
  });

  it("§93 명함 / §64·65 벽보·공보·공약서 (인쇄물 분기)", () => {
    expect(mapReimbItemKey("인쇄물", "명함")).toBe("namecard");
    expect(mapReimbItemKey("인쇄물", "선거벽보")).toBe("poster_bulletin");
    expect(mapReimbItemKey("인쇄물", "선거공보")).toBe("poster_bulletin");
    expect(mapReimbItemKey("인쇄물", "선거공약서")).toBe("poster_bulletin");
  });

  it("인쇄물 후보자사진·예비후보자홍보물은 7항목 외 → 미매핑", () => {
    expect(mapReimbItemKey("인쇄물", "후보자사진")).toBeNull();
    expect(mapReimbItemKey("인쇄물", "예비후보자홍보물")).toBeNull();
  });

  it("7항목 외 지출유형(광고·방송연설·선거사무관계자 등) → 미매핑", () => {
    expect(mapReimbItemKey("광고", "신문광고")).toBeNull();
    expect(mapReimbItemKey("방송연설", "TV방송연설")).toBeNull();
    expect(mapReimbItemKey("선거사무관계자", "선거사무원수당")).toBeNull();
  });

  it("null/빈 입력 → 미매핑", () => {
    expect(mapReimbItemKey(null, null)).toBeNull();
    expect(mapReimbItemKey("", "")).toBeNull();
  });
});

describe("REIMB_ITEMS", () => {
  it("7개 항목, key 유일, 법조항 정확", () => {
    expect(REIMB_ITEMS).toHaveLength(7);
    expect(new Set(REIMB_ITEMS.map((i) => i.key)).size).toBe(7);
    expect(REIMB_ITEMS.find((i) => i.key === "signboard")?.law).toBe("법 제61조");
    expect(REIMB_ITEMS.find((i) => i.key === "sms")?.law).toBe("법 제82조의5");
    expect(REIMB_ITEMS.find((i) => i.key === "poster_bulletin")?.law).toBe("법 제64조·제65조");
  });
});
