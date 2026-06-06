# Changelog

All notable changes to this project will be documented in this file.

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
