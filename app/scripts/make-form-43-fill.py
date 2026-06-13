#!/usr/bin/env python3
"""form-43.hwpx → form-43-fill.hwpx 템플릿 생성 (청구내역 표 축 재구성).

서식 43 선거비용 보전청구서. 공식 별지 서식 표 구조로 **재구성**:
  행(세로) = 장소: 선거사무소 / ○○선거연락소×4 / 합계
  열(가로) = 자금원: 후보자자산 / 후원회기부금 / 보조금 / 보조금외 / (합계) / 비고

(과거 form-43.hwpx 표는 행=자금원/열=장소로 전치되어 있었음 — 공식과 불일치.
 reimbursement-claim-table-transpose-fix 에서 교정.)

(1) 첫 hp:tbl(청구내역)을 7열×8행 새 표로 통째 교체.
    데이터 토큰 10개: 사무소 행 5(후보자자산/후원회기부금/보조금/보조금외/합계),
    합계 행 5. 연락소 4행은 빈칸(옵션 A, 수기 작성).
    셀 스타일(subList/borderFill)은 원본 표의 라벨/금액/헤더 셀을 재사용.
(2) 표1(청구인 서명란, 2번째 hp:tbl)은 미변경.
(3) 본문 텍스트: 선거명/선거구명/후보자명/보전청구총액/수령계좌/선관위명 토큰화.

reimbursement-claim-builder(claimTableTokens/claimTotalTokens) + aggregator 가 채운다.
열폭 합 = 39320(원본 보존): 구분 5685 + 자금원 4×6362 + 합계 6362 + 비고 1825.
"""
import re
import zipfile

SRC = "app/public/hwpx-templates/form-43.hwpx"
DST = "app/public/hwpx-templates/form-43-fill.hwpx"

# 열 폭(HWPUNIT)
W_GUBUN = 5685
W_FUND = 6362   # 후보자자산/후원회기부금/보조금/보조금외/합계
W_BIGO = 1825
H_DATA = 1665
H_HDR_TOP = 1665     # row0 청구액 셀 높이
H_HDR_SUB = 1935     # row1 자금원 서브헤더 높이
H_HDR_MERGE = H_HDR_TOP + H_HDR_SUB  # 세로병합 헤더(구분/합계/비고) = 3600

FUND_COLS = ["후보자자산", "후원회기부금", "보조금", "보조금외"]


def cell_templates(tbl: str) -> dict:
    """원본 표에서 라벨/금액/헤더 셀의 (borderFill, subList)를 추출해 재사용."""
    out = {}
    for tr in re.findall(r"<hp:tr\b.*?</hp:tr>", tbl, re.S):
        for tc in re.findall(r"<hp:tc\b.*?</hp:tc>", tr, re.S):
            a = re.search(r'<hp:cellAddr colAddr="(\d+)" rowAddr="(\d+)"', tc)
            r, c = int(a.group(2)), int(a.group(1))
            bf = re.search(r'borderFillIDRef="(\d+)"', tc).group(1)
            sub = tc[tc.find("<hp:subList"):tc.find("</hp:subList>") + len("</hp:subList>")]
            out[(r, c)] = (bf, sub)
    return {
        "LABEL": out[(2, 0)],      # 좌측 구분 라벨
        "AMOUNT": out[(2, 1)],     # 우측정렬 금액
        "HDR_MERGE": out[(0, 0)],  # 세로병합 헤더(구분)
        "HDR_SPAN": out[(0, 1)],   # 가로병합 헤더(청구액)
        "HDR_SUB": out[(1, 1)],    # 자금원 서브헤더
        "BIGO": out[(2, 7)],       # 비고(빈)
    }


def set_text(sub: str, text: str, width: int) -> str:
    """subList 첫 <hp:t> 텍스트 교체 + lineseg horzsize 갱신."""
    esc = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    if "<hp:t>" in sub:
        sub = re.sub(r"<hp:t>.*?</hp:t>", f"<hp:t>{esc}</hp:t>", sub, count=1, flags=re.S)
    else:  # self-closing run(빈 셀)
        sub = re.sub(r'(<hp:run charPrIDRef="\d+")\s*/>',
                     rf"\1><hp:t>{esc}</hp:t></hp:run>", sub, count=1)
    sub = re.sub(r'horzsize="\d+"', f'horzsize="{width}"', sub)
    return sub


def make_cell(tmpl, text, col, row, cspan, rspan, width, height, header):
    bf, sub = tmpl
    sub = set_text(sub, text, width)
    return (
        f'<hp:tc name="" header="{header}" hasMargin="0" protect="0" editable="0" dirty="0" '
        f'borderFillIDRef="{bf}">{sub}'
        f'<hp:cellAddr colAddr="{col}" rowAddr="{row}"/>'
        f'<hp:cellSpan colSpan="{cspan}" rowSpan="{rspan}"/>'
        f'<hp:cellSz width="{width}" height="{height}"/>'
        f'<hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc>'
    )


def build_table(open_tag: str, prelude: str, T: dict) -> str:
    rows = []

    # row0: 구분(1x2) | 청구액(4x1) | 합계(1x2) | 비고(1x2)
    r0 = [
        make_cell(T["HDR_MERGE"], "구  분", 0, 0, 1, 2, W_GUBUN, H_HDR_MERGE, 1),
        make_cell(T["HDR_SPAN"], "청  구  액", 1, 0, 4, 1, W_FUND * 4, H_HDR_TOP, 1),
        make_cell(T["HDR_MERGE"], "합계", 5, 0, 1, 2, W_FUND, H_HDR_MERGE, 1),
        make_cell(T["HDR_MERGE"], "비고", 6, 0, 1, 2, W_BIGO, H_HDR_MERGE, 1),
    ]
    rows.append("<hp:tr>" + "".join(r0) + "</hp:tr>")

    # row1: 자금원 4개 서브헤더(col1~4)
    r1 = [
        make_cell(T["HDR_SUB"], name, 1 + i, 1, 1, 1, W_FUND, H_HDR_SUB, 1)
        for i, name in enumerate(FUND_COLS)
    ]
    rows.append("<hp:tr>" + "".join(r1) + "</hp:tr>")

    def data_row(rowAddr, label, token_prefix=None):
        tcs = [make_cell(T["LABEL"], label, 0, rowAddr, 1, 1, W_GUBUN, H_DATA, 0)]
        # 자금원 4열
        for i, name in enumerate(FUND_COLS):
            txt = "{{" + f"{token_prefix}_{name}" + "}}" if token_prefix else ""
            tcs.append(make_cell(T["AMOUNT"], txt, 1 + i, rowAddr, 1, 1, W_FUND, H_DATA, 0))
        # 합계 열
        txt = "{{" + f"{token_prefix}_합계" + "}}" if token_prefix else ""
        tcs.append(make_cell(T["AMOUNT"], txt, 5, rowAddr, 1, 1, W_FUND, H_DATA, 0))
        # 비고
        tcs.append(make_cell(T["BIGO"], "", 6, rowAddr, 1, 1, W_BIGO, H_DATA, 0))
        return "<hp:tr>" + "".join(tcs) + "</hp:tr>"

    rows.append(data_row(2, "선거사무소", "사무소"))      # 옵션 A: 전액
    for k in range(4):
        rows.append(data_row(3 + k, "○○선거연락소", None))  # 연락소 빈칸
    rows.append(data_row(7, "합  계", "합계"))

    total_h = H_HDR_MERGE + 6 * H_DATA  # 헤더 + 데이터 6행
    new_sz = re.sub(r'height="\d+"', f'height="{total_h}"', prelude, count=1) \
        if 'height="' in prelude else prelude
    new_open = re.sub(r'rowCnt="\d+"', 'rowCnt="8"', open_tag)
    new_open = re.sub(r'colCnt="\d+"', 'colCnt="7"', new_open)
    return new_open + new_sz + "".join(rows) + "</hp:tbl>"


# 본문 텍스트 정확 치환(각각 정확히 1회).
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


def main():
    zin = zipfile.ZipFile(SRC)
    xml = zin.read("Contents/section0.xml").decode("utf-8")

    tbl_m = re.search(r"<hp:tbl\b.*?</hp:tbl>", xml, re.S)
    if not tbl_m:
        raise RuntimeError(f"표를 찾을 수 없습니다: {SRC}")
    tbl = tbl_m.group(0)
    open_tag = re.search(r"<hp:tbl\b[^>]*>", tbl).group(0)
    prelude = tbl[len(open_tag):tbl.find("<hp:tr>")]
    T = cell_templates(tbl)

    new_tbl = build_table(open_tag, prelude, T)
    new_xml = xml[: tbl_m.start()] + new_tbl + xml[tbl_m.end():]

    # 본문 텍스트 토큰화(정확 1회 치환)
    for src, dst in TEXT_REPLACEMENTS:
        cnt = new_xml.count(src)
        assert cnt == 1, f"본문 치환 대상 {cnt}회(1 기대): {src!r}"
        new_xml = new_xml.replace(src, dst)

    # 검증 1: 표 토큰 10개 + 본문 토큰 9개
    table_tokens = [f"{p}_{c}" for p in ("사무소", "합계") for c in FUND_COLS + ["합계"]]
    text_tokens = [
        "선거명", "선거구명", "후보자명", "보전청구총액_한글", "보전청구총액_숫자",
        "수령_금융기관", "수령_예금주", "수령_계좌번호", "선관위명",
    ]
    for t in table_tokens + text_tokens:
        assert "{{" + t + "}}" in new_xml, f"토큰 누락: {t}"
    assert len(table_tokens) == 10, f"표 토큰 {len(table_tokens)}(10 기대)"
    # 검증 2: 예시값 잔존 없음
    for ph in ["15,000,000", "10,000,000", "25,000,000", "○○은행", "123-34-56789", "이천오백만"]:
        assert ph not in new_xml, f"예시값 잔존: {ph}"
    # 검증 3: 표 2개 유지(청구내역 + 서명란)
    assert new_xml.count("<hp:tbl") == 2, f"표 개수 {new_xml.count('<hp:tbl')}(2 기대)"
    # 검증 4: 새 표 차원
    assert 'rowCnt="8"' in new_tbl and 'colCnt="7"' in new_tbl, "표 차원 7x8 아님"
    # 검증 5: 자금원 헤더가 열에 위치(서브헤더 행)
    for name in FUND_COLS:
        assert f"<hp:t>{name}</hp:t>" in new_xml, f"자금원 헤더 누락: {name}"
    # 검증 6: XML 태그 균형
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
    print(f"표토큰 {len(table_tokens)}개 + 본문토큰 {len(text_tokens)}개 OK, 표 2개 유지, 7x8 재구성, XML well-formed OK")


if __name__ == "__main__":
    main()
