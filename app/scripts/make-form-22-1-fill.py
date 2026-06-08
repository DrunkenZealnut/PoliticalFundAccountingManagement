#!/usr/bin/env python3
"""form-22-1.hwpx → form-22-1-fill.hwpx 템플릿 생성.

서식 22-1 정치자금 수입·지출보고서 총괄표 — 구분별(자산/후원회기부금/보조금/
보조금외/합계) 금액 셀을 {{prefix_suffix}} 토큰으로 치환한다. 행 복제 없음
(고정 5행) → 단순 셀 치환. report-summary-builder.summaryTokens 가 채운다.

표 데이터행 rowAddr 7~11, 금액 셀 colAddr: 2=수입,3=선거비용,4=선거비용외,
6=소계,8=잔액 (5행 × 5열 = 25 토큰).
"""
import re
import zipfile

SRC = "app/public/hwpx-templates/form-22-1.hwpx"
DST = "app/public/hwpx-templates/form-22-1-fill.hwpx"

ROW_PREFIX = {7: "자산", 8: "후원회기부금", 9: "보조금", 10: "보조금외", 11: "합계"}
CELL_SUFFIX = {2: "수입", 3: "선거비용", 4: "선거비용외", 6: "소계", 8: "잔액"}


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


def main():
    zin = zipfile.ZipFile(SRC)
    xml = zin.read("Contents/section0.xml").decode("utf-8")

    tbl_m = re.search(r"<hp:tbl\b.*?</hp:tbl>", xml, re.S)
    if not tbl_m:
        raise RuntimeError(f"템플릿에서 <hp:tbl>을 찾을 수 없습니다: {SRC}")
    tbl = tbl_m.group(0)

    def repl_tr(m):
        tr = m.group(0)
        a = re.search(r'<hp:cellAddr colAddr="\d+" rowAddr="(\d+)"', tr)
        if not a:
            return tr
        prefix = ROW_PREFIX.get(int(a.group(1)))
        if not prefix:
            return tr

        def repl_tc(mm):
            tc = mm.group(0)
            ca = re.search(r'<hp:cellAddr colAddr="(\d+)"', tc)
            suf = CELL_SUFFIX.get(int(ca.group(1))) if ca else None
            return tokenize_tc(tc, f"{prefix}_{suf}") if suf else tc

        return re.sub(r"<hp:tc\b.*?</hp:tc>", repl_tc, tr, flags=re.S)

    new_tbl = re.sub(r"<hp:tr\b.*?</hp:tr>", repl_tr, tbl, flags=re.S)
    new_xml = xml[: tbl_m.start()] + new_tbl + xml[tbl_m.end():]

    # 검증: 25개 토큰(5행 × 5열)
    expected = [f"{p}_{s}" for p in ROW_PREFIX.values() for s in CELL_SUFFIX.values()]
    for t in expected:
        assert "{{" + t + "}}" in new_xml, f"토큰 누락: {t}"
    assert new_xml.count("<hp:tbl") == 1, f"표가 1개가 아님: {new_xml.count('<hp:tbl')}"
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
    print(f"토큰 {len(expected)}개 OK, 표 1개 OK, XML well-formed OK")


if __name__ == "__main__":
    main()
