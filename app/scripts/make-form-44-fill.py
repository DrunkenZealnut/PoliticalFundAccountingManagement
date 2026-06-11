#!/usr/bin/env python3
"""form-44.hwpx → form-44-fill.hwpx 템플릿 생성.

서식 44 점자형 선거공보 등 부담비용 지급청구서 (순수 토큰-채움, dataFill 없음).
※ 양식 구조는 사용자 제공 RAG/점자형 선거공보 등 부담비용 지급청구서.hwpx 기준
   (머리: 선거명·소속정당명·후보자명 / 금액열: 계·점자인쇄비·한글인쇄료·운반비·수당).
- 머리글(본문 문단): 선거명/소속정당명/후보자명 샘플값 → {{토큰}} 정확 치환(각 1회).
- 표0 작성·제출수량: 데이터행(rowAddr 2) 7셀 → 수량 토큰(cellAddr 기준).
- 표1 청구금액: 데이터(rowAddr 1~5 × colAddr 1~5) 25셀 → 금액 토큰.
- 표2 수령계좌: 데이터행(rowAddr 1) 4셀 → 수령_* 토큰 4종.
- 표3 청구인 직인란: 미변경(성명·직인 손기입 boilerplate 유지, 서식 43 선례).
- 푸터 ○○선거관리위원회 → {{선관위명}}선거관리위원회.

총 40 토큰. generic POST /api/hwpx/generate 가 채운다. (make-form-43-fill.py 패턴)
"""
import re
import zipfile

SRC = "app/public/hwpx-templates/form-44.hwpx"
DST = "app/public/hwpx-templates/form-44-fill.hwpx"

# 표0 작성·제출수량: (rowAddr, colAddr) -> 토큰
QTY = {
    (2, 0): "점자공보_부수", (2, 1): "점자공보_매수", (2, 2): "점자공보_총매수",
    (2, 3): "점자공약서_부수", (2, 4): "점자공약서_매수", (2, 5): "점자공약서_총매수",
    (2, 6): "저장매체_개수",
}
# 표1 청구금액: (rowAddr 1~5 × colAddr 1~5) -> 금액_<행>_<열>
AMT_ROW = {1: "공보", 2: "공약서", 3: "저장매체", 4: "활동보조인", 5: "계"}
AMT_COL = {1: "계", 2: "점자인쇄비", 3: "한글인쇄료", 4: "운반비", 5: "수당"}
AMT = {(r, c): f"금액_{rn}_{cn}" for r, rn in AMT_ROW.items() for c, cn in AMT_COL.items()}
# 표2 수령계좌: (rowAddr, colAddr) -> 토큰
ACC = {(1, 0): "수령_예금주", (1, 1): "수령_금융기관", (1, 2): "수령_계좌번호", (1, 3): "수령_비고"}

# 표 종류별 (rowAddr, colAddr) -> 토큰. 세 표의 좌표 공간이 겹치므로 table_kind 로 먼저 분기.
CELL_TOKENS = {"qty": QTY, "amt": AMT, "acc": ACC}

# 머리글/푸터 본문 텍스트 정확 치환(각 1회).
# 머리 선거명 칸은 구체 선거명(예: ○○구의회 의원선거)이 들어가는 자리라 수동 입력
# 토큰 `선거명_상세` 를 쓴다 — 공유 REG 의 `선거명`(const 총선거명)과 분리.
# (총선거명 "제9회 전국동시지방선거"는 푸터 청구 문구에 양식 고정으로 이미 존재)
TEXT_REPLACEMENTS = [
    ("동대문구의회 의원선거", "{{선거명_상세}}"),
    ("진보당", "{{소속정당명}}"),
    ("오준석", "{{후보자명}}"),
    ("○○선거관리위원회", "{{선관위명}}선거관리위원회"),
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


def table_kind(tbl: str):
    """표 본문으로 어느 표인지 식별."""
    if "작성·제출" in tbl and "저장매체" in tbl:
        return "qty"
    if "점자인쇄비" in tbl:
        return "amt"
    if "예금주" in tbl and "금융기관명" in tbl:
        return "acc"
    return None  # 표3(직인란) 등 미변경


def main():
    zin = zipfile.ZipFile(SRC)
    xml = zin.read("Contents/section0.xml").decode("utf-8")

    def repl_tbl(m):
        tbl = m.group(0)
        kind = table_kind(tbl)
        if not kind:
            return tbl

        def repl_tc(mm):
            tc = mm.group(0)
            ca = re.search(r'<hp:cellAddr colAddr="(\d+)" rowAddr="(\d+)"', tc)
            if not ca:
                return tc
            col, row = int(ca.group(1)), int(ca.group(2))
            token = CELL_TOKENS[kind].get((row, col))
            return tokenize_tc(tc, token) if token else tc

        return re.sub(r"<hp:tc\b.*?</hp:tc>", repl_tc, tbl, flags=re.S)

    new_xml = re.sub(r"<hp:tbl\b.*?</hp:tbl>", repl_tbl, xml, flags=re.S)

    # 머리글/푸터 텍스트 토큰화(정확 1회)
    for src, dst in TEXT_REPLACEMENTS:
        cnt = new_xml.count(src)
        assert cnt == 1, f"본문 치환 대상 {cnt}회(1 기대): {src!r}"
        new_xml = new_xml.replace(src, dst)

    # 검증 1: 기대 토큰 전수 존재
    expected = (
        list(QTY.values())
        + list(AMT.values())
        + list(ACC.values())
        + ["선거명_상세", "소속정당명", "후보자명", "선관위명"]
    )
    for t in expected:
        assert "{{" + t + "}}" in new_xml, f"토큰 누락: {t}"
    # 검증 2: 머리글 예시값 잔존 없음
    for ph in ["동대문구의회 의원선거", "진보당", "오준석"]:
        assert ph not in new_xml, f"예시값 잔존: {ph}"
    # 검증 3: 표 4개 유지
    assert new_xml.count("<hp:tbl") == 4, f"표 {new_xml.count('<hp:tbl')}개(4 기대)"
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
    print(f"토큰 {len(expected)}개 OK (수량7 + 금액25 + 수령4 + 머리4), 표 4개 유지, XML well-formed OK")


if __name__ == "__main__":
    main()
