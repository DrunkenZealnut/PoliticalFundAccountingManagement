interface HelpText {
  title: string;
  description: string;
}

export const HELP_TEXTS: Record<string, HelpText> = {
  // 공통 버튼
  "btn.new": { title: "신규입력", description: "새로운 자료를 입력합니다. 기존 자료 수정/조회 중에 새 자료를 입력하려면 이 버튼을 클릭하세요." },
  "btn.save": { title: "저장", description: "신규 또는 수정한 내용을 저장합니다." },
  "btn.delete": { title: "삭제", description: "선택한 자료를 삭제합니다. 수입/지출내역이 등록된 수입지출처는 삭제할 수 없습니다." },
  "btn.search": { title: "조회", description: "입력한 조건에 따라 자료를 검색합니다. 일부 값만 입력해도 검색됩니다." },
  "btn.reset": { title: "화면초기화", description: "입력한 검색 조건을 모두 지우고 기본 조회 화면으로 되돌아갑니다." },
  "btn.cancel": { title: "취소", description: "현재 작업을 취소합니다." },
  "btn.excel": { title: "엑셀", description: "현재 화면의 자료를 엑셀 파일로 다운로드합니다." },
  "btn.print": { title: "출력", description: "현재 화면의 자료를 프린터로 출력합니다." },
  "btn.undo": { title: "복구", description: "수정/삭제한 자료를 이전 상태로 되돌립니다. 로그인 중에만 가능하며, 로그아웃 후에는 복구할 수 없습니다." },
  "btn.sort-save": { title: "정렬저장", description: "같은 일자 내의 자료 순서를 변경합니다. 드래그&드롭으로 순서를 조정한 후 반드시 이 버튼을 클릭하세요." },
  "btn.multi-select": { title: "다중선택", description: "체크박스를 사용하여 여러 항목을 선택할 수 있습니다. 선택 후 삭제 등 일괄 작업이 가능합니다." },
  "btn.end": { title: "종료", description: "현재 화면을 닫고 메인 화면으로 돌아갑니다." },

  // 수입내역관리
  "income.account": { title: "계정", description: "(예비)후보자: 후보자등자산, 후원회기부금, 보조금, 보조금외지원금 / 후원회: 수입" },
  "income.subject": { title: "과목", description: "▸ 선거비용: 후보자 등록일부터 선거일까지 해당 선거에 직접 소요되는 비용 (선거사무소 설치, 선거벽보, 공약서, 선거공보, 현수막, 신문광고, 방송연설 등 정치자금법 제49조에 열거된 비용)\n▸ 선거비용외 정치자금: 선거비용에 해당하지 않는 통상적 정치활동 비용 (사무실 임차료, 인건비, 통신비, 교통비, 회의비 등 일상적 정치활동에 소요되는 비용)" },
  "income.date": { title: "수입일자", description: "수입이 발생한 날짜를 입력합니다. 당해 회계기간 내의 날짜만 입력 가능합니다." },
  "income.amount": { title: "수입금액", description: "수입 금액을 입력합니다. 후원금 반환 시 마이너스(-) 금액을 입력하세요." },
  "income.provider": { title: "수입제공자", description: "🔍 버튼으로 기존 등록된 수입지출처를 검색하거나, [수입제공자 등록]으로 새로 등록할 수 있습니다." },
  "income.content": { title: "수입내역", description: "수입에 대한 설명을 입력합니다. 당비/기명후원금/익명후원금 과목은 자동으로 입력됩니다." },
  "income.receipt-yn": { title: "증빙서첨부", description: "영수증 등 증빙서류의 첨부 여부를 체크합니다." },
  "income.receipt-no": { title: "증빙서번호", description: "증빙서류의 일련번호를 입력합니다. [영수증일괄입력]으로 일괄 부여할 수도 있습니다." },
  "income.receipt-batch": { title: "영수증일괄입력", description: "증빙서첨부가 '첨부(Y)'이면서 증빙서번호가 비어 있는 모든 수입내역에 대해, 기존 최대 번호의 다음 번호부터 순차적으로 영수증 번호를 일괄 부여합니다. 부여 순서는 수입일자 → 정렬순서 기준입니다. 실행 전 대상 건수와 시작 번호를 확인하는 팝업이 표시됩니다." },
  "income.book-print": { title: "수입부", description: "전체 또는 계정별로 조회된 수입내역에 대한 수입부를 프린터 출력 또는 엑셀 다운로드합니다." },
  "income.summary": { title: "수입액/지출액/잔액", description: "현재 사용기관의 전체 수입액 합계, 지출액 합계, 잔액(수입-지출)을 표시합니다." },

  // 지출내역관리
  "expense.exp-type": { title: "지출유형", description: "(예비)후보자는 대분류→중분류→소분류를 필수로 선택합니다. 후원회는 선택하지 않습니다." },
  "expense.pay-method": { title: "지출방법", description: "계좌입금, 카드, 현금, 수표, 신용카드, 체크카드, 미지급, 기타 중 선택합니다." },
  "expense.target": { title: "지출대상자", description: "🔍 버튼으로 기존 등록된 수입지출처를 검색하거나, [지출대상자 등록]으로 새로 등록할 수 있습니다." },
  "expense.detail": { title: "지출상세내역", description: "지출에 대한 상세 설명을 입력합니다." },
  "expense.receipt-gen": { title: "영수증일괄생성", description: "증빙서첨부(Y)인 지출내역에 영수증 번호를 자동 생성하여 일괄 부여합니다." },
  "expense.receipt-del": { title: "영수증일괄제거", description: "모든 증빙서 번호를 제거합니다. 이 작업은 복구할 수 없습니다." },
  "expense.resolution": { title: "지출결의서", description: "선택한 지출내역의 지출결의서를 엑셀 형태로 출력합니다." },
  "expense.book-print": { title: "지출부", description: "전체 또는 계정/과목별 지출부 내역을 프린터 출력 또는 엑셀 다운로드합니다." },

  // 수입지출처관리
  "customer.type": { title: "수입/지출처 구분", description: "개인, 사업자, 후원회, 중앙당, 시도당 등 수입지출 상대방의 유형을 선택합니다." },
  "customer.name": { title: "성명(명칭)", description: "수입/지출 상대방의 이름 또는 법인/단체명을 입력합니다." },
  "customer.reg-num": { title: "생년월일/사업자번호", description: "개인은 생년월일(YYYYMMDD), 사업자는 사업자등록번호를 입력합니다." },
  "customer.addr-search": { title: "주소검색", description: "우편번호를 검색하여 주소를 자동 입력합니다. 상세주소는 직접 입력하세요." },
  "customer.history": { title: "이력관리", description: "주소, 전화번호 변경 이력을 확인할 수 있습니다." },

  // 사용기관관리
  "organ.type": { title: "사용기관 구분", description: "(예비)후보자, 후원회 등 사용기관의 유형을 선택합니다. 유형에 따라 사용 가능한 메뉴가 달라집니다." },
  "organ.acc-period": { title: "당해 회계기간", description: "회계보고 대상 기간입니다. 수입/지출 일자는 이 기간 내에서만 입력 가능합니다." },
  "organ.pre-period": { title: "이전 회계기간", description: "별도 수정이 필요하지 않습니다." },
  "organ.password": { title: "비밀번호", description: "최소 4자 이상입니다. 한/영/숫자/특수문자 모두 사용 가능하나, 느낌표(!)와 따옴표(')는 사용할 수 없습니다." },
  "organ.hint": { title: "비밀번호확인질문/답변", description: "비밀번호 분실 시 찾기에 사용됩니다. 로그인을 위해 반드시 기재하세요." },

  // 재산내역관리
  "estate.type": { title: "재산구분", description: "토지, 건물, 주식/유가증권, 비품, 현금및예금, 그밖의재산, 차입금 중 선택합니다." },
  "estate.amount": { title: "가액", description: "재산의 금액입니다. 차입금은 (+) 금액으로 입력하면 자동으로 (-) 처리됩니다. 변제 시 (-) 금액을 입력합니다." },

  // 일괄등록
  "batch.validate": { title: "저장 전 자료확인", description: "엑셀파일에 오류가 없는지 점검합니다. 오류가 있으면 저장할 수 없으며, 오류 내용을 엑셀로 다운로드할 수 있습니다." },
  "batch.template": { title: "엑셀 양식", description: "일괄등록용 엑셀 양식을 다운로드합니다. 양식에 담긴 유의사항을 삭제하지 마세요." },

  // 보고관리
  "report.prev-year": { title: "전년도 자료", description: "Check 시 사용기관관리에서 설정한 이전 회계기간 데이터가 포함됩니다." },
  "report.cover": { title: "표지선택", description: "수입/지출부 표지, 계정 표지, 과목 표지를 선택하여 출력합니다." },
  "report.batch-print": { title: "보고서 일괄출력", description: "정치자금 수입지출 보고사항을 한번에 모두 출력합니다. (권장)" },
  "report.settlement": { title: "결산", description: "해당 기간의 수입, 지출, 재산내역으로 결산을 수행합니다. 잔액과 재산(현금및예금) 금액이 다르면 경고가 나타납니다." },
  "report.reimbursement": { title: "보전비용", description: "선거비용 보전 신청 대상 지출내역을 체크한 후 저장합니다. 저장한 내용은 로그아웃 이후에도 유지됩니다." },

  // 시스템관리
  "system.backup": { title: "백업", description: "현재 운영 데이터를 백업합니다. 로그인한 사용기관 자료만 백업됩니다." },
  "system.restore": { title: "복구", description: "백업 파일을 선택하여 복구합니다. 복구 시 운영DB의 모든 자료가 선택한 백업으로 변경됩니다." },
  "system.reset": { title: "자료초기화", description: "설정한 기간 범위의 수입/지출내역을 일괄 삭제합니다. 삭제된 자료는 복구할 수 없습니다." },
  "system.code-manage": { title: "코드관리", description: "공통코드 버전 확인 및 엑셀파일로 코드를 등록합니다. 등록 후 로그아웃→재로그인해야 적용됩니다." },

  // 도움말 토글
  "help.toggle": { title: "초보자 모드 ON/OFF", description: "초보자 모드를 켜면 도움말 툴팁, 업무순서 안내, 페이지 가이드가 모두 표시됩니다. 익숙해지면 끄세요." },

  // 대시보드
  "dashboard.income": { title: "총 수입액", description: "선택한 사용기관의 전체 수입 금액 합계입니다." },
  "dashboard.expense": { title: "총 지출액", description: "선택한 사용기관의 전체 지출 금액 합계입니다." },
  "dashboard.balance": { title: "잔액", description: "수입액에서 지출액을 뺀 금액입니다. 결산 시 재산(현금및예금)과 일치해야 합니다." },
  "dashboard.workflow": { title: "업무 진행 현황", description: "회계 업무의 전체 흐름을 보여줍니다. 사용기관 등록 → 거래처 → 수입/지출 → 결산 순서로 진행하세요." },
  "dashboard.quick-actions": { title: "바로가기", description: "자주 사용하는 기능으로 빠르게 이동합니다." },

  // 마법사
  "wizard.card-select": { title: "거래 유형 선택", description: "거래 종류에 맞는 카드를 선택하면 복잡한 계정·과목을 시스템이 자동 설정합니다." },
  "wizard.search": { title: "키워드 검색", description: "어떤 카드를 골라야 할지 모르겠다면, '현수막', '명함' 등 키워드를 입력해보세요." },
  "wizard.step-indicator": { title: "진행 단계", description: "3단계만 거치면 등록이 완료됩니다: ① 유형 선택 → ② 세부 입력 → ③ 확인 및 저장" },
  "wizard.auto-settings": { title: "자동 설정값", description: "시스템이 자동으로 설정한 계정·과목·지출유형입니다. 필요하면 수정할 수 있습니다." },
  "wizard.mode-toggle": { title: "수입/지출 전환", description: "지출(기본) 또는 수입 모드를 선택합니다. 모드에 따라 사용 가능한 카드가 달라집니다." },

  // 보고관리
  "report.income-book": { title: "수입부", description: "계정·과목별 수입내역을 정리한 공식 서식입니다." },
  "report.expense-book": { title: "지출부", description: "계정·과목별 지출내역을 정리한 공식 서식입니다." },
  "report.total-summary": { title: "수입지출 총괄표", description: "수입과 지출의 전체 현황을 한눈에 보여주는 총괄표입니다." },
  "settlement.period": { title: "결산기간", description: "결산할 회계기간의 시작일과 종료일을 설정합니다. 사용기관관리의 당해 회계기간을 참조하세요." },
  "settlement.estate-check": { title: "재산 일치 확인", description: "수입지출 잔액과 재산(현금및예금) 금액이 일치해야 합니다. 불일치 시 경고가 표시됩니다." },
  "audit.opinion": { title: "감사의견서", description: "감사인이 작성하는 회계 감사 의견서입니다. 후원회와 정당에서 사용합니다." },
  "submit.file-gen": { title: "제출파일 생성", description: "선관위에 제출할 데이터 파일을 생성합니다. 결산 완료 후 사용하세요." },
  "aggregate.method": { title: "취합방법", description: "시도당·정책연구소 등 하위 기관의 데이터를 중앙당에 취합합니다." },

  // 재산내역
  "estate.kind": { title: "종류", description: "재산의 구체적인 종류를 입력합니다. 예: '정기예금', '사무용 컴퓨터' 등." },
  "estate.qty": { title: "수량", description: "재산의 수량입니다. 기본값은 1입니다." },
  "estate.content": { title: "내용", description: "재산에 대한 상세 설명입니다. 예: '○○은행 정기예금 1년', '사무실 임대보증금' 등." },
  "estate.debt-note": { title: "차입금 안내", description: "차입금은 양(+) 금액으로 입력하면 자동으로 음(-) 처리됩니다. 변제 시에는 음(-) 금액을 입력합니다." },

  // 시스템
  "reset.period": { title: "초기화 기간", description: "삭제할 수입/지출내역의 일자 범위를 설정합니다. 범위 밖의 데이터는 영향받지 않습니다." },
  "reset.warning": { title: "초기화 주의사항", description: "삭제된 자료는 복구할 수 없습니다. 반드시 백업 후 진행하세요." },
  "codes.version": { title: "코드 버전", description: "공통코드의 버전 정보입니다. 코드 등록 후 로그아웃→재로그인해야 적용됩니다." },

  // 초보자 모드
  "beginner.toggle": { title: "초보자 모드", description: "초보자 모드를 켜면 업무순서 안내, 페이지 가이드, 도움말 툴팁이 모두 표시됩니다." },
  "beginner.workflow": { title: "업무순서 안내", description: "회계 업무는 순서대로 진행합니다. 현재 단계를 확인하고 다음 단계로 이동하세요." },
  "beginner.page-guide": { title: "페이지 가이드", description: "각 화면의 사용법을 간단히 안내합니다. 접기 버튼으로 숨길 수 있습니다." },

  // 기타
  "document-register.ocr": { title: "AI 자동 인식", description: "업로드한 영수증·계약서 이미지에서 날짜, 금액, 거래처, 내역을 AI가 자동으로 읽어냅니다." },
  "batch-import.template-note": { title: "엑셀 양식 안내", description: "양식 내의 유의사항 시트와 컬럼 헤더를 삭제하지 마세요. 검증 시 오류가 발생합니다." },
};
