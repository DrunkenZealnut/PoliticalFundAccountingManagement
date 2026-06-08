#!/usr/bin/env python3
"""form-22-4.hwpx → form-22-4-fill.hwpx 템플릿 생성.

서식 22-4 정치자금 수입·지출부 = 서식 7과 동일 레이아웃 + 비고 컬럼(c13).
계정/과목 헤더 문단 + 표1(헤더2행 + 데이터행1)만 남기고 예시 데이터행 삭제,
셀 텍스트를 {{토큰}}으로 교체, LEDGER GROUP/ROW 마커 삽입.
→ income-ledger 의 owpml-table(renderIncomeLedgerSection)로 렌더된다.
"""
import re
import zipfile

SRC = "app/public/hwpx-templates/form-22-4.hwpx"
DST = "app/public/hwpx-templates/form-22-4-fill.hwpx"
COLCNT = 14

COL_TOKEN = {
    0: "연월일", 1: "내역", 2: "수입금회", 3: "수입누계", 4: "지출금회",
    5: "지출누계", 6: "잔액", 7: "성명", 8: "생년월일", 9: "주소",
    10: "직업", 11: "전화", 12: "영수증", 13: "비고",
}


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
        # 원본 </hp:run> 는 tc[m.end():] 에 남아 있으므로 닫지 않는다(이중 닫힘 방지)
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

    # 1) 첫 tbl + 표를 감싸는 문단 </hp:p> 까지(태그 균형)
    tbl_m = re.search(r"<hp:tbl\b.*?</hp:tbl>", xml, re.S)
    if not tbl_m:
        raise RuntimeError(f"템플릿에서 <hp:tbl>을 찾을 수 없습니다: {SRC}")
    tbl_close = tbl_m.end()
    wrap_end = xml.index("</hp:p>", tbl_close) + len("</hp:p>")

    # 2) GROUP 시작 = [계 정 명] 문단의 <hp:p 시작
    acct_i = xml.find("계 정 명")
    if acct_i < 0:
        raise RuntimeError("템플릿에서 '계 정 명' 텍스트를 찾지 못함")
    g_start = xml.rfind("<hp:p ", 0, acct_i)
    if g_start < 0:
        raise RuntimeError("계정명 문단을 찾지 못함")
    group_block = xml[g_start:wrap_end]

    # 3) 계정/과목 텍스트 토큰화 (대괄호 없음 — 서식 7과 다름)
    group_block = group_block.replace("계 정 명 : 후보자 자산", "계 정 명 : {{계정명}}", 1)
    group_block = group_block.replace("과 목 명 : 선거비용", "과 목 명 : {{과목명}}", 1)

    # 4) 표 안 데이터행(=14 tc) 처리: 첫 데이터행 토큰화+ROW마커, 예시 나머지 삭제
    gtbl_m = re.search(r"<hp:tbl\b.*?</hp:tbl>", group_block, re.S)
    if not gtbl_m:
        raise RuntimeError("group_block에서 <hp:tbl>을 찾을 수 없습니다")
    gtbl = gtbl_m.group(0)
    trs = list(re.finditer(r"<hp:tr\b.*?</hp:tr>", gtbl, re.S))
    data_idx = [i for i, m in enumerate(trs) if len(re.findall(r"<hp:tc\b", m.group(0))) == COLCNT]
    if not data_idx:
        raise RuntimeError("데이터행(14 tc)을 찾지 못함")
    first_data = data_idx[0]

    parts = []
    for i, m in enumerate(trs):
        tr = m.group(0)
        if i == first_data:
            parts.append("<!--LEDGER:ROW_START-->" + tokenize_data_row(tr) + "<!--LEDGER:ROW_END-->")
        elif i in data_idx:
            continue  # 예시 데이터행 삭제
        else:
            parts.append(tr)  # 헤더행 유지
    gbody = gtbl[: trs[0].start()] + "".join(parts) + gtbl[trs[-1].end():]
    # rowCnt = 헤더행수 + 데이터행1
    header_cnt = len(trs) - len(data_idx)
    gbody = re.sub(
        r'(<hp:tbl\b[^>]*\browCnt=")\d+(")',
        lambda mm: mm.group(1) + str(header_cnt + 1) + mm.group(2),
        gbody, count=1,
    )
    group_block = group_block[: gtbl_m.start()] + gbody + group_block[gtbl_m.end():]

    # 5) GROUP 마커 삽입 (표 1개이므로 꼬리는 wrap_end 이후 전체)
    new_xml = (
        xml[:g_start]
        + "<!--LEDGER:GROUP_START-->"
        + group_block
        + "<!--LEDGER:GROUP_END-->"
        + xml[wrap_end:]
    )

    # 검증
    for need in ["{{계정명}}", "{{과목명}}"] + ["{{" + t + "}}" for t in COL_TOKEN.values()]:
        assert need in new_xml, f"토큰 누락: {need}"
    assert new_xml.count("<hp:tbl") == 1, f"표가 1개가 아님: {new_xml.count('<hp:tbl')}"
    assert "<!--LEDGER:GROUP_START-->" in new_xml and "<!--LEDGER:ROW_START-->" in new_xml
    for tag in ["hp:tbl", "hp:tr", "hp:tc", "hp:p", "hp:run"]:
        opens = len(re.findall(rf"<{tag}\b", new_xml))
        selfc = len(re.findall(rf"<{tag}\b[^>]*?/>", new_xml))
        closes = len(re.findall(rf"</{tag}>", new_xml))
        assert opens - selfc == closes, f"{tag} 불균형: open={opens} self={selfc} close={closes}"

    # 6) 재패키징 (mimetype STORED 첫 엔트리, date_time 고정 재현성)
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
    print(f"토큰 {len(COL_TOKEN) + 2}개 OK, 표 1개 OK, 마커 OK, XML well-formed OK")


if __name__ == "__main__":
    main()
