# 영수증/주문계약서 업로드 → 자동등록 기능 계획

## 개요
영수증, 주문계약서 등 증빙서류 이미지를 업로드하면 AI(Gemini Vision)가 내용을 자동 인식하여 수입/지출 내역을 등록하는 기능.

## 기술 스택
- **OCR/파싱**: Google Generative AI (Gemini 2.5 Flash) — 이미 `@google/generative-ai` 설치됨
- **파일 업로드**: FormData + Next.js API Route (기존 SQLite import 패턴 재사용)
- **데이터 저장**: 기존 `/api/acc-book` action: "insert" 패턴 활용

## 핵심 흐름

```
사용자 → 증빙서류 이미지/PDF 업로드
  → API Route에서 Gemini Vision으로 텍스트 추출
  → 구조화된 데이터 반환 (날짜, 금액, 거래처, 내역 등)
  → 사용자 확인/수정 화면 표시
  → 확인 시 acc_book + customer 자동 등록
```

## 구현 파일

### 1. API Route: `/api/document-parse/route.ts`
- POST: FormData (file + orgId + incmSecCd)
- Gemini Vision에 이미지 전송, 구조화된 JSON 응답 요청
- 추출 대상 필드:
  - `date` (거래일자)
  - `amount` (금액)
  - `provider_name` (거래처명/성명)
  - `provider_regNum` (사업자번호/생년월일)
  - `provider_addr` (주소)
  - `content` (내역/품목)
  - `receiptNo` (영수증번호)
  - `payMethod` (결제수단: 카드/현금/계좌이체)
- 신뢰도 점수 함께 반환

### 2. 페이지: `/dashboard/document-register/page.tsx`
**UI 구성:**
- 상단: 수입/지출 탭 선택
- 파일 업로드 영역 (드래그앤드롭 + 클릭)
  - 지원 형식: JPG, PNG, PDF
  - 다중 파일 업로드 지원 (최대 10건)
- 파싱 결과 미리보기/편집 테이블
  - AI 추출값 표시 (신뢰도 낮으면 노란색 강조)
  - 계정/과목 드롭다운 (CodeSelect 재사용)
  - 거래처 검색/등록 (CustomerSearchDialog 재사용)
  - 금액, 날짜, 내역 수정 가능
- 하단: 자료확인 → 저장 버튼

### 3. Gemini Vision 프롬프트 설계
```
이 영수증/계약서 이미지에서 다음 정보를 JSON으로 추출하세요:
- date: 거래일자 (YYYYMMDD)
- amount: 총 금액 (숫자만)
- provider_name: 거래처명 또는 성명
- provider_regNum: 사업자등록번호 또는 생년월일
- provider_addr: 주소
- content: 거래 내역/품목명
- receiptNo: 영수증 번호
- payMethod: 결제수단 (카드/현금/계좌이체/수표)
- items: [{name, qty, unitPrice, amount}] (품목 상세, 있는 경우)
```

## 계정/과목 자동 매핑 로직
- 지출의 경우: content 키워드 기반 자동 추천
  - "인쇄" → 인쇄물 관련 과목
  - "임대", "사무소" → 사무소 관련
  - "차량", "유류" → 차량 관련
- 수입의 경우: 기본 계정 선택 (사용자 확인 필수)

## 기존 코드 재사용
- `CustomerSearchDialog` — 거래처 검색/등록
- `CodeSelect` — 계정/과목 선택
- `useCodeValues()` — 코드값 조회
- `useAuth()` — orgId, orgSecCd 등
- `/api/acc-book` action: "insert" — 최종 저장
- `/api/customers` POST — 거래처 자동 등록

## 네비게이션
- 사이드바 메뉴 추가: "증빙서류 자동등록" (수입/지출 메뉴 그룹 하위)

## 제약사항
- Gemini API 호출 비용: 이미지당 약 $0.001~0.003
- 파일 크기 제한: 10MB/건
- 인식 정확도: 한국어 영수증 ~90%, 사용자 확인 필수
- PDF는 첫 페이지만 처리 (multi-page는 향후)
