# Changelog

All notable changes to this project will be documented in this file.

## [0.5.0.0] - 2026-06-08

### Added

- (예비)후보자 **회계보고서 3종**(선관위 서식 22-1·22-3·22-4)을 빈 양식 대신 **입력된 데이터로 자동 채워** 한글파일(.hwpx)로 내려받을 수 있습니다. 제출서류 화면에서 서식을 선택하고 "데이터로 회계보고서 생성"을 누르면 됩니다.
  - **서식 22-1 수입·지출보고서**: 자금원 구분(자산·후원회기부금·정당지원금[보조금·보조금외])별로 수입과 지출(선거비용/선거비용외)을 집계하고 소계·잔액·합계를 자동 산출한 총괄표를 채웁니다.
  - **서식 22-3 재산명세서**: 재산 데이터를 구분(토지·건물·주식/유가증권·비품·현금/예금·그밖의재산)별 명세와 소계·합계로 채우며, 데이터가 없는 구분은 "해당없음"으로 양식 그대로 표기합니다.
  - **서식 22-4 수입·지출부**: 계정·과목별 수입·지출 상세를 거래상대방 정보(성명·생년월일·주소·직업·전화)와 함께 행으로 채웁니다.
  - 공식 양식 레이아웃(표·여백·폰트)을 그대로 보존합니다. (선거비용 지출내역 집계표인 서식 22-2는 이번 범위에서 제외)

### Changed

- HWPX 생성 코어에 `transformSection`을 추가해 템플릿 압축 해제를 1회로 줄이고, 토큰 치환 헬퍼(`replaceTokens`)를 회계장부·회계보고서 생성이 공유합니다(기존 서식 동작 불변).
- 재산 구분 코드(`ESTATE_TYPES`)를 공용 모듈로 분리해 재산관리 화면과 재산명세서 생성이 함께 사용합니다.

## [0.4.0.0] - 2026-06-08

### Added

- 선관위 제출서류 서식 7 "(예비)후보자 정치자금 수입계정별 회계장부(수입·지출부)"를 빈 양식 대신 **입력된 수입·지출 데이터로 자동 채워** 한글파일(.hwpx)로 내려받을 수 있습니다. 서식 7 선택 후 "수입 데이터로 회계장부 생성"을 누르면 계정·과목별로 정리된 공식 양식이 즉시 생성됩니다.
  - 계정·과목 조합마다 표를 나누고, **수입과 지출을 같은 표에 일자순으로 함께** 기록합니다(동일 자금원 기준).
  - 그룹 내 수입누계·지출누계와 **잔액(수입누계−지출누계)**을 자동 계산합니다.
  - 각 행에 연월일·내역·수입금액·지출금액·누계·잔액·거래상대방(성명·생년월일·주소·직업·전화)·영수증번호가 채워집니다.
  - 공식 form-7 레이아웃(표·여백·폰트)을 그대로 보존합니다.

### Changed

- 서식 입력 패널이 데이터 채움 서식(`dataFill`)을 인식해, 토큰 입력란 대신 데이터 생성 버튼을 노출합니다.
- HWPX 생성 코어에서 재패키징 로직(`repackageSection`)을 분리해 토큰 치환 서식과 회계장부 생성이 공유합니다(기존 서식 동작 불변).

## [0.3.0.0] - 2026-06-07

### Added

- 선관위 제출서류 메뉴에 공식 서식 24종을 다운로드용으로 추가(회계실무 작성예시 추출). 서식을 선택하면 한글(.hwpx) 빈 양식을 내려받아 직접 작성할 수 있습니다.
  - 회계장부: 후보자/후원회 수입계정별 회계장부, 회계장부 마감
  - 지급명세서: 선거사무관계자 수당·실비 지급명세서
  - 증빙정리: 영수증 등 증빙서류 첩부 및 정리
  - 회계보고서: (예비)후보자 회계보고서 4종, 후원회 회계보고서 11종
  - 정치자금영수증: 발급신청서, 발행·반납대장
  - 보전·청구: 선거비용 보전청구서, 점자형선거공보 등 부담비용 지급청구서
- 빈 양식 서식은 입력란 없이 안내문구와 함께 바로 다운로드되도록 입력 패널이 자동 전환됩니다.

### Changed

- 서식 카탈로그가 조직 타입(후보자/후원회)에 따라 노출 서식을 자동 필터링합니다.

## [0.2.0.0] - 2026-06-06

### Added

- 선관위 제출서류 HWPX 생성: 서식을 선택하면 사용기관 정보가 자동으로 채워지고, 빈 항목을 입력한 뒤 한글(.hwpx) 파일로 내려받을 수 있습니다. 제9회 지방선거 6종 서식 지원(정치자금 수입·지출 인계·인수서, 회계책임자 선임신고서·취임동의서, 예금계좌 신고서, 후원회 등록신청서·취임동의서).
- 조직 타입(후보자/후원회)에 따라 노출할 서식을 자동으로 필터링.
- 토큰 치환 HWPX 생성 코어: `{{토큰}}`을 입력값으로 치환하고 mimetype을 STORED(무압축) 첫 엔트리로 유지해 한글에서 정상적으로 열립니다. XML 특수문자 escape로 문서 파손·인젝션 방지.
- 서식 정의 ↔ 템플릿 토큰 정합성을 빌드타임 테스트로 검증(`_token-manifest.json` drift 가드 포함).

### Security

- HWPX 생성 API: 입력값 배열 거부, 필수 항목·입력 길이 서버 검증(쪽수 드리프트 + DoS 완화), 정의된 토큰만 화이트리스트 치환.

## [0.1.1.0] - 2026-04-05

### Added

- FAQ browser stays visible after clicking items, with a collapse/expand toggle so users can browse more questions while reading answers.
- Duplicate FAQ prevention: clicking a previously asked FAQ scrolls to the existing answer with a yellow highlight instead of adding a duplicate.
- FAQ messages tagged with `source: "faq"` to distinguish from manually typed questions, preventing false duplicate matches.
- Test infrastructure: vitest + @testing-library/react with 19 tests covering FAQ navigation, duplicate detection, collapse toggle, and chat input.

### Fixed

- FAQ collapse state now resets when clearing messages, preventing stale collapsed state after "대화 초기화".
- Highlight timeout properly cleaned up on component unmount via useRef, preventing resource leaks.

## [0.1.0] - Initial Release

- Political fund accounting management system with chatbot FAQ integration.
