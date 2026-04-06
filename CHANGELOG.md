# Changelog

All notable changes to this project will be documented in this file.

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
