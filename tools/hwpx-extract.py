#!/usr/bin/env python3
"""작성예시 HWPX에서 대상 서식을 개별 standalone .hwpx 로 슬라이싱 추출."""
import zipfile, re, os, sys, copy
from lxml import etree

REF = "RAG/1. 제9회 지방선거 정치자금 회계실무_작성예시.hwpx"
OUT_DIR = sys.argv[1] if len(sys.argv) > 1 else "/tmp/hwpx_forms"
os.makedirs(OUT_DIR, exist_ok=True)

HP = "http://www.hancom.co.kr/hwpml/2011/paragraph"
P = f"{{{HP}}}p"
T = f"{{{HP}}}t"

# 대상 서식: id -> (section file, 라벨)
TARGETS = [
    ("7",  "section1", "(예비)후보자 정치자금 수입계정별 회계장부"),
    ("8",  "section1", "후원회 정치자금 수입계정별 회계장부"),
    ("14", "section4", "선거사무관계자 수당·실비 지급명세서"),
    ("17", "section6", "영수증 등 증빙서류 첩부 및 정리"),
    ("20", "section7", "회계장부 마감"),
    ("22-1", "section8", "(예비)후보자 회계보고서 제출문서"),
    ("22-2", "section8", "(예비)후보자 회계보고서 첨부서류(재산명세서)"),
    ("22-3", "section8", "(예비)후보자 회계보고서 첨부서류(비품·소모품)"),
    ("22-4", "section9", "(예비)후보자 회계보고서 첨부서류"),
    ("23-1", "section10", "후원회 회계보고서 제출문서"),
    ("23-2", "section10", "후원회 회계보고서 첨부서류(재산명세서)"),
    ("23-3", "section10", "후원회 회계보고서 첨부서류(비품·소모품)"),
    ("23-4", "section10", "후원회 회계보고서 첨부서류(수입명세서)"),
    ("23-5", "section10", "후원회 회계보고서 첨부서류(지출명세서)"),
    ("23-6", "section10", "후원회 회계보고서 첨부서류(영수증)"),
    ("23-7", "section10", "후원회 회계보고서 첨부서류"),
    ("23-8", "section10", "후원회 회계보고서 첨부서류"),
    ("23-9", "section10", "후원회 회계보고서 첨부서류"),
    ("23-10", "section10", "후원회 회계보고서 첨부서류"),
    ("23-11", "section10", "후원회 회계보고서 첨부서류"),
    ("37-2", "section10", "정치자금영수증 발급신청서"),
    ("38", "section10", "정치자금영수증 발행·반납대장"),
    ("43", "section10", "선거비용 보전청구서"),
    ("44", "section10", "점자형선거공보 등 부담비용 지급청구서"),
]

z = zipfile.ZipFile(REF)
names = z.namelist()

# content.hpf: 섹션 매니페스트/스파인을 section0 하나로
hpf = z.read('Contents/content.hpf').decode('utf-8')
hpf = re.sub(r'<opf:item[^>]*href="Contents/section(?:[1-9]|10)\.xml"[^>]*/>', '', hpf)
hpf = re.sub(r'<opf:itemref[^>]*idref="section(?:[1-9]|10)"[^>]*/>', '', hpf)
hpf_b = hpf.encode('utf-8')

MARK_RE = re.compile(r'^\[작성예시\s*([0-9]+(?:-[0-9]+)?)')

sec_cache = {}
def parse_section(secfile):
    if secfile in sec_cache: return sec_cache[secfile]
    root = etree.fromstring(z.read(f'Contents/{secfile}.xml'))
    ps = [c for c in root if c.tag == P]
    markers = []
    for i, p in enumerate(ps):
        txt = "".join(p.itertext()).strip()
        m = MARK_RE.match(txt)
        if m:
            markers.append((i, m.group(1)))
    sec_cache[secfile] = (root, ps, markers)
    return sec_cache[secfile]

def clean_secpr_para(p0):
    c = copy.deepcopy(p0)
    for t in c.iter(T):
        t.text = ""
    return c

def build_section0(root, ps, markers, form_id):
    idxs = [i for i, n in markers]
    nums = [n for i, n in markers]
    pos = nums.index(form_id)
    start = idxs[pos]
    end = idxs[pos+1] if pos+1 < len(idxs) else len(ps)
    secpr_para = clean_secpr_para(ps[0])
    content = ps[start+1:end]
    new_root = etree.Element(root.tag, nsmap=root.nsmap)
    for k, v in root.attrib.items():
        new_root.set(k, v)
    new_root.append(secpr_para)
    for p in content:
        new_root.append(copy.deepcopy(p))
    return etree.tostring(new_root, xml_declaration=True, encoding='UTF-8', standalone=True)

results = []
for form_id, secfile, label in TARGETS:
    root, ps, markers = parse_section(secfile)
    nums = [n for i, n in markers]
    if form_id not in nums:
        print(f"  !! {form_id}: 마커 없음 in {secfile} (보유: {nums})")
        continue
    sec0 = build_section0(root, ps, markers, form_id)
    out = os.path.join(OUT_DIR, f"form-{form_id}.hwpx")
    with zipfile.ZipFile(out, 'w') as o:
        o.writestr(zipfile.ZipInfo('mimetype'), z.read('mimetype'), compress_type=zipfile.ZIP_STORED)
        for n in names:
            if n == 'mimetype': continue
            if re.match(r'Contents/section(?:[1-9]|10)\.xml$', n): continue
            if n == 'Contents/section0.xml':
                data = sec0
            elif n == 'Contents/content.hpf':
                data = hpf_b
            else:
                data = z.read(n)
            o.writestr(n, data, compress_type=zipfile.ZIP_DEFLATED)
    ntbl = sec0.count(b'<hp:tbl ')
    npar = sec0.count(b'<hp:p ')
    sz = os.path.getsize(out)
    results.append((form_id, label, secfile, npar, ntbl, sz))
    print(f"  form-{form_id}.hwpx  표{ntbl} 문단{npar}  {sz:,}B  [{secfile}] {label}")

print(f"\n총 {len(results)}개 생성 -> {OUT_DIR}")
