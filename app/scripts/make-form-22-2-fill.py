#!/usr/bin/env python3
"""form-22-2.hwpx → form-22-2-fill.hwpx 템플릿 생성.

서식 22-2 선거비용 지출내역 집계표 — 자금원 구분별(계/후보자자산/후원회기부금/
보조금/보조금외) 금액 셀을 {{prefix_suffix}} 토큰으로 치환한다. 행 복제 없음
(고정 3행: 합계/사무소/연락소계) → 단순 셀 치환.
election-expense-summary-builder.electionExpenseSummaryTokens 가 채운다.

데이터행 rowAddr: 2=합계, 3=선거사무소, 4=연락소계 → 토큰화(3행 × 5열 = 15).
금액 셀 colAddr: 2=계, 3=후보자자산, 4=후원회기부금, 5=보조금, 6=보조금외.
개별 연락소 placeholder 행(rowAddr ≥ 5)은 예시 텍스트를 비워 수기 작성용 빈
양식으로 만든다(옵션 A).
"""
import re
import zipfile

SRC = "app/public/hwpx-templates/form-22-2.hwpx"
DST = "app/public/hwpx-templates/form-22-2-fill.hwpx"

ROW_PREFIX = {2: "합계", 3: "사무소", 4: "연락소계"}
CELL_SUFFIX = {2: "계", 3: "후보자자산", 4: "후원회기부금", 5: "보조금", 6: "보조금외"}
PLACEHOLDER_ROW_MIN = 5  # 이 이상 rowAddr 의 데이터행은 비운다(개별 연락소)


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


def clear_placeholders(tc: str) -> str:
    """셀 안 모든 <hp:t> 텍스트를 비운다(예시값 제거, 구조 유지)."""
    return re.sub(r"<hp:t>.*?</hp:t>", "<hp:t></hp:t>", tc, flags=re.S)


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
        row = int(a.group(1))
        prefix = ROW_PREFIX.get(row)

        if prefix:
            def repl_tc(mm):
                tc = mm.group(0)
                ca = re.search(r'<hp:cellAddr colAddr="(\d+)"', tc)
                suf = CELL_SUFFIX.get(int(ca.group(1))) if ca else None
                return tokenize_tc(tc, f"{prefix}_{suf}") if suf else tc

            return re.sub(r"<hp:tc\b.*?</hp:tc>", repl_tc, tr, flags=re.S)

        if row >= PLACEHOLDER_ROW_MIN:
            # 개별 연락소 예시행: 텍스트 비움(수기 작성용 빈 양식)
            return re.sub(r"<hp:tc\b.*?</hp:tc>", lambda mm: clear_placeholders(mm.group(0)), tr, flags=re.S)

        return tr

    new_tbl = re.sub(r"<hp:tr\b.*?</hp:tr>", repl_tr, tbl, flags=re.S)
    new_xml = xml[: tbl_m.start()] + new_tbl + xml[tbl_m.end():]

    # 검증 1: 15개 토큰(3행 × 5열)
    expected = [f"{p}_{s}" for p in ROW_PREFIX.values() for s in CELL_SUFFIX.values()]
    for t in expected:
        assert "{{" + t + "}}" in new_xml, f"토큰 누락: {t}"
    # 검증 2: 표 1개
    assert new_xml.count("<hp:tbl") == 1, f"표가 1개가 아님: {new_xml.count('<hp:tbl')}"
    # 검증 3: placeholder 예시 잔존 없음
    for ph in ["○○연락소", "△△연락소", "□□연락소", "670,000", "540,000"]:
        assert ph not in new_xml, f"placeholder 잔존: {ph}"
    # 검증 4: XML 태그 균형
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
    print(f"토큰 {len(expected)}개 OK, 표 1개 OK, placeholder 정리 OK, XML well-formed OK")


if __name__ == "__main__":
    main()
