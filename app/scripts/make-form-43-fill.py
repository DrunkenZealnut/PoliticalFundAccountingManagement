#!/usr/bin/env python3
"""form-43.hwpx → form-43-fill.hwpx 템플릿 생성.

서식 43 선거비용 보전청구서.
(1) 청구내역 표(첫 hp:tbl): 자금원 4행(후보자자산/후원회기부금/정당의지원금/합계)
    × 장소 열 → 사무소(colAddr 1)·합계(colAddr 6) 셀을 {{행_열}} 토큰화(8개).
    연락소 열(colAddr 2~5)의 예시값은 비워 수기 작성용 빈칸으로(옵션 A).
    표1(청구인 서명란)은 미변경(○○○ 보일러플레이트 유지).
(2) 본문 텍스트: 선거명/선거구명/후보자명/보전청구총액/수령계좌/선관위명 토큰화.
reimbursement-claim-builder(claimTableTokens/claimTotalTokens) + route 가 채운다.

표 데이터행 rowAddr: 2=후보자자산, 3=후원회기부금, 4=정당의지원금, 5=합계.
금액 셀 colAddr: 1=선거사무소, 6=합계 (2~5=연락소).
"""
import re
import zipfile

SRC = "app/public/hwpx-templates/form-43.hwpx"
DST = "app/public/hwpx-templates/form-43-fill.hwpx"

ROW_PREFIX = {2: "후보자자산", 3: "후원회기부금", 4: "정당의지원금", 5: "합계"}
CELL_SUFFIX = {1: "사무소", 6: "합계"}
BRANCH_COLS = {2, 3, 4, 5}  # 연락소 열 → 빈칸

# 본문 텍스트 정확 치환(각각 정확히 1회). 원문 → 토큰 삽입.
TEXT_REPLACEMENTS = [
    ("1. 선 거 명 : ", "1. 선 거 명 : {{선거명}}"),
    ("2. 선거구명 : ", "2. 선거구명 : {{선거구명}}"),
    ("3. 후보자명 : ", "3. 후보자명 : {{후보자명}}"),
    (
        "5. 보전청구 총액 : 금이천오백만원(￦25,000,000)",
        "5. 보전청구 총액 : 금{{보전청구총액_한글}}원(￦{{보전청구총액_숫자}})",
    ),
    (
        "6. 수령계좌명 : ○○은행(예금주명 : ○○○) 계좌번호 : 123-34-56789",
        "6. 수령계좌명 : {{수령_금융기관}}(예금주명 : {{수령_예금주}}) 계좌번호 : {{수령_계좌번호}}",
    ),
    ("○○○선거관리위원회", "{{선관위명}}선거관리위원회"),
]


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


def clear_cell(tc: str) -> str:
    """셀 안 모든 <hp:t> 텍스트를 비운다(예시값 제거, 구조 유지)."""
    return re.sub(r"<hp:t>.*?</hp:t>", "<hp:t></hp:t>", tc, flags=re.S)


def main():
    zin = zipfile.ZipFile(SRC)
    xml = zin.read("Contents/section0.xml").decode("utf-8")

    # (1) 청구내역 표(첫 hp:tbl) 토큰화
    tbl_m = re.search(r"<hp:tbl\b.*?</hp:tbl>", xml, re.S)
    if not tbl_m:
        raise RuntimeError(f"표를 찾을 수 없습니다: {SRC}")
    tbl = tbl_m.group(0)

    def repl_tr(m):
        tr = m.group(0)
        a = re.search(r'<hp:cellAddr colAddr="\d+" rowAddr="(\d+)"', tr)
        if not a:
            return tr
        row = int(a.group(1))
        prefix = ROW_PREFIX.get(row)
        if not prefix:
            return tr  # 헤더행 등 미변경

        def repl_tc(mm):
            tc = mm.group(0)
            ca = re.search(r'<hp:cellAddr colAddr="(\d+)"', tc)
            col = int(ca.group(1)) if ca else -1
            suf = CELL_SUFFIX.get(col)
            if suf:
                return tokenize_tc(tc, f"{prefix}_{suf}")
            if col in BRANCH_COLS:
                return clear_cell(tc)  # 연락소 열 빈칸
            return tc  # 구분명 셀(col 0) 등 미변경

        return re.sub(r"<hp:tc\b.*?</hp:tc>", repl_tc, tr, flags=re.S)

    new_tbl = re.sub(r"<hp:tr\b.*?</hp:tr>", repl_tr, tbl, flags=re.S)
    new_xml = xml[: tbl_m.start()] + new_tbl + xml[tbl_m.end():]

    # (2) 본문 텍스트 토큰화(정확 1회 치환)
    for src, dst in TEXT_REPLACEMENTS:
        cnt = new_xml.count(src)
        assert cnt == 1, f"본문 치환 대상 {cnt}회(1 기대): {src!r}"
        new_xml = new_xml.replace(src, dst)

    # 검증 1: 표 토큰 8개 + 본문 토큰 9개
    table_tokens = [f"{p}_{s}" for p in ROW_PREFIX.values() for s in CELL_SUFFIX.values()]
    text_tokens = [
        "선거명", "선거구명", "후보자명", "보전청구총액_한글", "보전청구총액_숫자",
        "수령_금융기관", "수령_예금주", "수령_계좌번호", "선관위명",
    ]
    for t in table_tokens + text_tokens:
        assert "{{" + t + "}}" in new_xml, f"토큰 누락: {t}"
    # 검증 2: 예시값 잔존 없음
    for ph in ["15,000,000", "10,000,000", "25,000,000", "○○은행", "123-34-56789", "이천오백만"]:
        assert ph not in new_xml, f"예시값 잔존: {ph}"
    # 검증 3: 표 2개 유지(청구내역 + 서명란)
    assert new_xml.count("<hp:tbl") == 2, f"표 개수 {new_xml.count('<hp:tbl')}(2 기대)"
    # 검증 4: XML 태그 균형
    for tag in ["hp:tbl", "hp:tr", "hp:tc", "hp:p", "hp:run"]:
        opens = len(re.findall(rf"<{tag}\b", new_xml))
        selfc = len(re.findall(rf"<{tag}\b[^>]*?/>", new_xml))
        closes = len(re.findall(rf"</{tag}>", new_xml))
        assert opens - selfc == closes, f"{tag} 불균형: open={opens} self={selfc} close={closes}"

    # 재패키징(mimetype STORED 첫 엔트리)
    zout = zipfile.ZipFile(DST, "w")
    zi = zipfile.ZipInfo("mimetype")
    zi.compress_type = zipfile.ZIP_STORED
    zout.writestr(zi, zin.read("mimetype"))
    for name in zin.namelist():
        if name == "mimetype":
            continue
        data = new_xml.encode("utf-8") if name == "Contents/section0.xml" else zin.read(name)
        e = zipfile.ZipInfo(name)
        e.compress_type = zipfile.ZIP_DEFLATED
        zout.writestr(e, data)
    zout.close()
    zin.close()
    print("생성:", DST)
    print(f"표토큰 {len(table_tokens)}개 + 본문토큰 {len(text_tokens)}개 OK, 표 2개 유지, XML well-formed OK")


if __name__ == "__main__":
    main()
