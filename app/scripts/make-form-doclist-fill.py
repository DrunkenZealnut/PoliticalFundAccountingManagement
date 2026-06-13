#!/usr/bin/env python3
"""form-22-3-fill.hwpx → form-doclist-fill.hwpx 템플릿 생성.

「선거비용 보전 첨부서류목록」점검목록표는 재산명세서(서식 22-3)와 표 구조가
동일(단일 표: [헤더] + GROUP[명세행 + 소계행] + 합계행)하므로, 이미 토큰화·
마커 삽입이 끝난 form-22-3-fill.hwpx 를 도너로 재사용한다.

변환(텍스트·토큰·마커 치환만 — 구조 무변경, OWPML 손상 위험 최소):
  1) 재산명세서 전용 푸터 주석(주 1~4) 제거(문단 단위 절단)
  2) 제목·부제·헤더·첨부 텍스트 치환
  3) 표 토큰 6 + 소계/합계 치환 (구분→보전항목 …)
  4) ESTATE 마커 → DOCLIST 마커

→ owpml-table 의 renderDoclistSection 이 보전 항목/명세행을 동적 복제한다.
표 구조: 명세행 c0~c5(보전항목/지출일자/거래업체/지출내용/보전청구액/첨부증빙),
소계행 c4(소계금액), 합계행 c4(합계금액). c0(보전항목)은 명세+소계행 rowSpan.
"""
import re
import zipfile

SRC = "app/public/hwpx-templates/form-22-3-fill.hwpx"
DST = "app/public/hwpx-templates/form-doclist-fill.hwpx"

# 헤더/제목/첨부 텍스트 치환 (form-22-3-fill 의 정확한 hp:t inner 기준)
TEXT_REPLACE = {
    "재 산 명 세 서": "선거비용 보전 첨부서류 목록",
    "    2026년   월   일 현재": "    제9회 전국동시지방선거",
    "구      분": "보전항목",
    "종   류": "지출일자",
    "수  량": "거래업체",
    "내  용": "지출내용",
    "가  액": "보전청구액",
    "비  고": "첨부증빙",
    "첨부 : 비품내역   부": "첨부 : 증빙서류 별첨",
}

# 표 토큰 치환 (재산명세서 → 점검목록표)
TOKEN_REPLACE = {
    "{{구분}}": "{{보전항목}}",
    "{{종류}}": "{{지출일자}}",
    "{{수량}}": "{{거래업체}}",
    "{{내용}}": "{{지출내용}}",
    "{{가액}}": "{{보전청구액}}",
    "{{비고}}": "{{첨부증빙}}",
    "{{소계}}": "{{소계_금액}}",
    "{{합계}}": "{{합계_금액}}",
}

NEW_TOKENS = ["보전항목", "지출일자", "거래업체", "지출내용", "보전청구액", "첨부증빙", "소계_금액", "합계_금액"]


def main():
    zin = zipfile.ZipFile(SRC)
    xml = zin.read("Contents/section0.xml").decode("utf-8")

    # 1) 재산명세서 전용 푸터 주석(주 1~4) 절단: "주" 주석 문단 시작 ~ </hs:sec> 직전
    note_anchor = xml.find("<hp:t>주</hp:t>")
    tbl_end = xml.rfind("</hp:tbl>")
    if note_anchor == -1 or note_anchor < tbl_end:
        raise RuntimeError("재산명세서 주석(주) 위치를 찾지 못했습니다")
    note_start = xml.rfind("<hp:p ", 0, note_anchor)
    sec_close = xml.rfind("</hs:sec>")
    if note_start == -1 or sec_close == -1 or note_start > sec_close:
        raise RuntimeError("푸터 절단 경계 산출 실패")
    xml = xml[:note_start] + xml[sec_close:]

    # 2) 텍스트 치환
    for old, new in TEXT_REPLACE.items():
        if old not in xml:
            raise RuntimeError(f"치환 대상 텍스트 없음: {old!r}")
        xml = xml.replace(old, new)

    # 3) 토큰 치환
    for old, new in TOKEN_REPLACE.items():
        if old not in xml:
            raise RuntimeError(f"치환 대상 토큰 없음: {old}")
        xml = xml.replace(old, new)

    # 4) 마커 치환 (ESTATE → DOCLIST)
    xml = xml.replace("ESTATE:", "DOCLIST:")

    # ---- 검증 ----
    for t in NEW_TOKENS:
        assert "{{" + t + "}}" in xml, f"토큰 누락: {t}"
    for marker in ["DOCLIST:GROUP_START", "DOCLIST:GROUP_END", "DOCLIST:ROW_START", "DOCLIST:ROW_END"]:
        assert f"<!--{marker}-->" in xml, f"마커 누락: {marker}"
    # 재산명세서 잔재 0
    for residue in ["재 산 명 세 서", "비품내역", "재산명세서는", "ESTATE:", "{{구분}}", "{{가액}}", "{{소계}}"]:
        assert residue not in xml, f"재산명세서 잔재: {residue!r}"
    assert xml.count("<hp:tbl") == 1, f"표가 1개가 아님: {xml.count('<hp:tbl')}"
    # XML 태그 균형
    for tag in ["hp:tbl", "hp:tr", "hp:tc", "hp:p", "hp:run", "hs:sec"]:
        opens = len(re.findall(rf"<{tag}\b", xml))
        selfc = len(re.findall(rf"<{tag}\b[^>]*?/>", xml))
        closes = len(re.findall(rf"</{tag}>", xml))
        assert opens - selfc == closes, f"{tag} 불균형: open={opens} self={selfc} close={closes}"

    # ---- 재패키징 (mimetype STORED 첫 엔트리) ----
    zout = zipfile.ZipFile(DST, "w")
    zi = zipfile.ZipInfo("mimetype")
    zi.compress_type = zipfile.ZIP_STORED
    zout.writestr(zi, zin.read("mimetype"))
    for name in zin.namelist():
        if name == "mimetype":
            continue
        data = xml.encode("utf-8") if name == "Contents/section0.xml" else zin.read(name)
        zi_entry = zipfile.ZipInfo(name)
        zi_entry.compress_type = zipfile.ZIP_DEFLATED
        zout.writestr(zi_entry, data)
    zout.close()
    zin.close()
    print("생성:", DST)
    print(f"토큰 {len(NEW_TOKENS)}개 OK, 표 1개 OK, DOCLIST 마커 OK, 재산명세서 잔재 0, XML well-formed OK")


if __name__ == "__main__":
    main()
