#!/usr/bin/env python3
"""form-22-3.hwpx → form-22-3-fill.hwpx 템플릿 생성.

서식 22-3 재산명세서 = 단일 표(헤더행 + 구분별[명세행 + 소계행] + 합계행).
구분 1개(명세행 + 소계행)만 남기고 토큰화 + ESTATE GROUP/ROW 마커 삽입,
나머지 구분 삭제, 합계행 토큰화.
→ owpml-table 의 renderEstateSection 이 구분/명세행을 동적 복제하고
  c0(구분명) rowSpan·표 rowAddr 를 재계산해 렌더한다.

표 구조: 명세행 c0~c5(구분/종류/수량/내용/가액/비고), 소계행 c4(가액 소계),
합계행 c4(가액 합계). 명세행 c0 는 명세+소계행을 rowSpan 으로 묶는다.
"""
import re
import zipfile

SRC = "app/public/hwpx-templates/form-22-3.hwpx"
DST = "app/public/hwpx-templates/form-22-3-fill.hwpx"

DETAIL_TOKEN = {0: "구분", 1: "종류", 2: "수량", 3: "내용", 4: "가액", 5: "비고"}


def tokenize_tc(tc: str, token: str) -> str:
    """tc 안 첫 run 의 텍스트를 {{token}} 으로 만든다(빈/텍스트 셀 모두)."""
    tok = "{{" + token + "}}"
    m_self = re.search(r'<hp:run charPrIDRef="(\d+)"\s*/>', tc)
    m_open = re.search(r'<hp:run charPrIDRef="(\d+)"><hp:t>.*?</hp:t>', tc, re.S)
    cands = []
    if m_self:
        cands.append((m_self.start(), "self", m_self))
    if m_open:
        cands.append((m_open.start(), "open", m_open))
    if not cands:
        raise RuntimeError(f"run 없음(token={token}): {tc[:120]}")
    cands.sort(key=lambda x: x[0])
    _, kind, m = cands[0]
    if kind == "self":
        rep = f'<hp:run charPrIDRef="{m.group(1)}"><hp:t>{tok}</hp:t></hp:run>'
    else:
        rep = f'<hp:run charPrIDRef="{m.group(1)}"><hp:t>{tok}</hp:t>'
    return tc[: m.start()] + rep + tc[m.end():]


def tokenize_row(tr: str, colmap: dict) -> str:
    """tr 의 각 tc 를 colAddr→토큰 맵 기준 토큰화."""
    def repl(m):
        tc = m.group(0)
        a = re.search(r'<hp:cellAddr colAddr="(\d+)"', tc)
        tok = colmap.get(int(a.group(1))) if a else None
        return tokenize_tc(tc, tok) if tok else tc
    return re.sub(r"<hp:tc\b.*?</hp:tc>", repl, tr, flags=re.S)


def main():
    zin = zipfile.ZipFile(SRC)
    xml = zin.read("Contents/section0.xml").decode("utf-8")

    tbl_m = re.search(r"<hp:tbl\b.*?</hp:tbl>", xml, re.S)
    if not tbl_m:
        raise RuntimeError(f"템플릿에서 <hp:tbl>을 찾을 수 없습니다: {SRC}")
    tbl = tbl_m.group(0)
    trs = list(re.finditer(r"<hp:tr\b.*?</hp:tr>", tbl, re.S))
    if len(trs) < 4:
        raise RuntimeError(f"tr 수 부족: {len(trs)}")

    header = trs[0].group(0)                              # 헤더행
    detail = tokenize_row(trs[1].group(0), DETAIL_TOKEN)  # 명세행(c0~c5)
    subtotal = tokenize_row(trs[2].group(0), {4: "소계"})  # 소계행(c4)
    total = tokenize_row(trs[-1].group(0), {4: "합계"})    # 합계행(c4)

    group = (
        "<!--ESTATE:GROUP_START-->"
        + "<!--ESTATE:ROW_START-->" + detail + "<!--ESTATE:ROW_END-->"
        + subtotal
        + "<!--ESTATE:GROUP_END-->"
    )

    # 표 본문 재구성: [tbl 헤더 속성…] 헤더행 + GROUP + 합계행 [/tbl]
    body = tbl[: trs[0].start()] + header + group + total + tbl[trs[-1].end():]
    # rowCnt = 헤더1 + 명세1 + 소계1 + 합계1 = 4 (렌더 시 동적 재계산되나 템플릿은 정합 유지)
    body = re.sub(
        r'(<hp:tbl\b[^>]*\browCnt=")\d+(")',
        lambda mm: mm.group(1) + "4" + mm.group(2),
        body, count=1,
    )

    new_xml = xml[: tbl_m.start()] + body + xml[tbl_m.end():]

    # 검증
    for need in ["{{" + t + "}}" for t in DETAIL_TOKEN.values()] + ["{{소계}}", "{{합계}}"]:
        assert need in new_xml, f"토큰 누락: {need}"
    assert new_xml.count("<hp:tbl") == 1, f"표가 1개가 아님: {new_xml.count('<hp:tbl')}"
    for marker in ["ESTATE:GROUP_START", "ESTATE:GROUP_END", "ESTATE:ROW_START", "ESTATE:ROW_END"]:
        assert f"<!--{marker}-->" in new_xml, f"마커 누락: {marker}"
    for tag in ["hp:tbl", "hp:tr", "hp:tc", "hp:p", "hp:run"]:
        opens = len(re.findall(rf"<{tag}\b", new_xml))
        selfc = len(re.findall(rf"<{tag}\b[^>]*?/>", new_xml))
        closes = len(re.findall(rf"</{tag}>", new_xml))
        assert opens - selfc == closes, f"{tag} 불균형: open={opens} self={selfc} close={closes}"

    # 재패키징 (mimetype STORED 첫 엔트리)
    zout = zipfile.ZipFile(DST, "w")
    zi = zipfile.ZipInfo("mimetype")
    zi.compress_type = zipfile.ZIP_STORED
    zout.writestr(zi, zin.read("mimetype"))
    for name in zin.namelist():
        if name == "mimetype":
            continue
        data = new_xml.encode("utf-8") if name == "Contents/section0.xml" else zin.read(name)
        zi_entry = zipfile.ZipInfo(name)
        zi_entry.compress_type = zipfile.ZIP_DEFLATED
        zout.writestr(zi_entry, data)
    zout.close()
    zin.close()
    print("생성:", DST)
    print(f"토큰 {len(DETAIL_TOKEN) + 2}개 OK, 표 1개 OK, ESTATE 마커 OK, XML well-formed OK")


if __name__ == "__main__":
    main()
