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
