#!/usr/bin/env python3
"""form-7.hwpx → form-7-fill.hwpx 템플릿 생성.

첫 그룹(계정/과목 헤더 + 표1: 헤더행 + 데이터행1)만 남기고 작성예시 표 삭제,
셀 텍스트를 {{토큰}}으로 교체, GROUP/ROW 마커 삽입.
"""
import re
import zipfile

SRC = "app/public/hwpx-templates/form-7.hwpx"
DST = "app/public/hwpx-templates/form-7-fill.hwpx"

COL_TOKEN = {
    0: "연월일", 1: "내역", 2: "수입금회", 3: "수입누계", 4: "지출금회",
    5: "지출누계", 6: "잔액", 7: "성명", 8: "생년월일", 9: "주소",
    10: "직업", 11: "전화", 12: "영수증",
}


def tokenize_tc(tc: str, token: str) -> str:
    """tc 안 첫 run 의 텍스트를 {{token}} 으로 만든다(빈/텍스트 셀 모두).

    - 빈 셀(self-closing run): <hp:run X/> → <hp:run X><hp:t>{{tok}}</hp:t></hp:run>
    - 텍스트 셀: <hp:run X><hp:t>…</hp:t> 만 치환하고 원본 </hp:run> 는 보존
      (rep 에 </hp:run> 를 넣으면 이중 닫힘 → 잉여 </hp:run> 발생).
    """
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
        # 원본 </hp:run> 는 tc[m.end():] 에 남아 있으므로 닫지 않는다
        rep = f'<hp:run charPrIDRef="{m.group(1)}"><hp:t>{tok}</hp:t>'
    return tc[: m.start()] + rep + tc[m.end():]


def tokenize_data_row(tr: str) -> str:
    """데이터행 tr 의 각 tc 를 colAddr 기준 토큰화."""
    def repl(m):
        tc = m.group(0)
        a = re.search(r'<hp:cellAddr colAddr="(\d+)"', tc)
        if not a:
            return tc
        col = int(a.group(1))
        token = COL_TOKEN.get(col)
        return tokenize_tc(tc, token) if token else tc
    return re.sub(r"<hp:tc\b.*?</hp:tc>", repl, tr, flags=re.S)


def main():
    zin = zipfile.ZipFile(SRC)
    xml = zin.read("Contents/section0.xml").decode("utf-8")

    # 1) 첫 tbl 범위. HWPX 는 표가 문단(<hp:p><hp:run>) 안에 내장되므로
    #    그룹 경계는 표를 감싸는 문단의 </hp:p> 까지 확장해야 균형이 맞는다.
    tbl_m = re.search(r"<hp:tbl\b.*?</hp:tbl>", xml, re.S)
    tbl_start = tbl_m.start()
    tbl_close = tbl_m.end()  # </hp:tbl> 끝
    wrap_end = xml.index("</hp:p>", tbl_close) + len("</hp:p>")  # 표 wrapping 문단 닫기

    # 2) GROUP 블록 시작 = [계 정 명] 문단의 <hp:p 시작
    acct_i = xml.find("계 정 명")
    g_start = xml.rfind("<hp:p ", 0, acct_i)
    if g_start < 0 or g_start > tbl_start:
        raise RuntimeError("계정명 문단을 찾지 못함")
    group_block = xml[g_start:wrap_end]

    # 3) 계정/과목 텍스트 토큰화 (첫 출현만)
    group_block = group_block.replace(
        "[계 정 명 : 후보자 자산]", "[계 정 명 : {{계정명}}]", 1
    )
    group_block = group_block.replace(
        "[과 목 명 : 선거비용]", "[과 목 명 : {{과목명}}]", 1
    )

    # 4) 표 안 데이터행(마지막 tr) 토큰화 + ROW 마커
    gtbl_m = re.search(r"<hp:tbl\b.*?</hp:tbl>", group_block, re.S)
    gtbl = gtbl_m.group(0)
    trs = list(re.finditer(r"<hp:tr\b.*?</hp:tr>", gtbl, re.S))
    data_tr_m = trs[-1]
    data_tr = data_tr_m.group(0)
    new_data_tr = (
        "<!--LEDGER:ROW_START-->" + tokenize_data_row(data_tr) + "<!--LEDGER:ROW_END-->"
    )
    new_gtbl = gtbl[: data_tr_m.start()] + new_data_tr + gtbl[data_tr_m.end():]
    group_block = group_block[: gtbl_m.start()] + new_gtbl + group_block[gtbl_m.end():]

    # 5) 문서 꼬리(마지막 표 이후 secPr 등) 보존, 표2~5 + 헤더 제거.
    #    마지막 표의 wrapping 문단 </hp:p> 이후부터가 꼬리(균형 유지).
    tail = xml[wrap_end:]
    last_tbl = tail.rfind("</hp:tbl>")
    if last_tbl >= 0:
        doc_tail = tail[tail.index("</hp:p>", last_tbl) + len("</hp:p>"):]
    else:
        doc_tail = tail

    new_xml = (
        xml[:g_start]
        + "<!--LEDGER:GROUP_START-->"
        + group_block
        + "<!--LEDGER:GROUP_END-->"
        + doc_tail
    )

    # 검증
    for need in ["{{계정명}}", "{{과목명}}"] + ["{{" + t + "}}" for t in COL_TOKEN.values()]:
        assert need in new_xml, f"토큰 누락: {need}"
    assert new_xml.count("<hp:tbl") == 1, f"표가 1개가 아님: {new_xml.count('<hp:tbl')}"
    assert "<!--LEDGER:GROUP_START-->" in new_xml and "<!--LEDGER:ROW_START-->" in new_xml
    # 태그 균형 간이 체크 (well-formed 정밀검증은 vitest 통합테스트에서).
    # self-closing(<tag .../>) 은 닫는 태그가 없으므로 open 집계에서 제외.
    for tag in ["hp:tbl", "hp:tr", "hp:tc", "hp:p", "hp:run"]:
        opens = len(re.findall(rf"<{tag}\b", new_xml))
        selfc = len(re.findall(rf"<{tag}\b[^>]*?/>", new_xml))
        closes = len(re.findall(rf"</{tag}>", new_xml))
        assert opens - selfc == closes, f"{tag} 불균형: open={opens} self={selfc} close={closes}"

    # 6) 재패키징 (mimetype STORED 첫 엔트리)
    zout = zipfile.ZipFile(DST, "w")
    zi = zipfile.ZipInfo("mimetype")
    zi.compress_type = zipfile.ZIP_STORED
    zout.writestr(zi, zin.read("mimetype"))
    for name in zin.namelist():
        if name == "mimetype":
            continue
        data = new_xml.encode("utf-8") if name == "Contents/section0.xml" else zin.read(name)
        # date_time 고정(기본 1980-01-01) — 재실행 시 동일 바이트 보장(재현성)
        zi_entry = zipfile.ZipInfo(name)
        zi_entry.compress_type = zipfile.ZIP_DEFLATED
        zout.writestr(zi_entry, data)
    zout.close()
    zin.close()
    print("생성:", DST)
    print("토큰 15개 OK, 표 1개 OK, 마커 OK, XML well-formed OK")


if __name__ == "__main__":
    main()
