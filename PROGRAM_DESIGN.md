# 정치자금 회계관리 프로그램 설계서

> **최종 수정일**: 2026-03-23
> **문서 버전**: v1.0 Final (최종 점검 완료)
> **용도**: ralph-loop 프롬프트 및 개발 가이드
> **근거 자료**: 정치자금회계관리프로그램 도움말 v1.3(76p), 사용자매뉴얼 후보자및후원회용(57p), 후원회설립가이드북(73p), 실데이터(Fund_Data_1.db, 후원회 엑셀 2종, 보고문서 PDF 4종)

---

## 목차
1. [프로젝트 개요](#1-프로젝트-개요) - 목적, 기술 스택, 외부 서비스
2. [데이터베이스 스키마](#2-데이터베이스-스키마) - ERD, 코드 체계, 계정관계
3. [기능 설계](#3-기능-설계) - 메뉴 구조, 화면별 상세 기능
4. [핵심 비즈니스 로직](#4-핵심-비즈니스-로직) - 계정매핑, 한도체크, 잔액계산
5. [API 설계](#5-api-설계) - Supabase 클라이언트, REST API, 엑셀 입출력
6. [페이지 구조](#6-페이지-구조) - Next.js App Router
7. [주요 컴포넌트](#7-주요-컴포넌트) - 공통 컴포넌트, 우편번호 검색
8. [데이터 흐름](#8-데이터-흐름) - 수입등록, 백업/복구
9. [보안 고려사항](#9-보안-고려사항) - RLS, 인증, API키 보호
10. [구현 우선순위](#10-구현-우선순위) - Phase 1~5
11. [SQLite ↔ Supabase 마이그레이션](#11-sqlite--supabase-마이그레이션)
12. [파일 구조 참조](#12-파일-구조-참조-기존-시스템)
13. 부록 A~E: 실데이터, DDL, 체크리스트, E2E 테스트 (154건)

---

## 1. 프로젝트 개요

### 1.1 목적
중앙선거관리위원회의 정치자금 회계관리 시스템을 웹 기반으로 재구현한다. 기존 Windows 데스크톱 프로그램(SQLite + Delphi 추정)의 데이터 구조를 Supabase(PostgreSQL)로 마이그레이션하여, 수입/지출/재산 내역의 입력, 조회, 수정, 삭제 및 회계보고서 출력을 지원하는 크로스 플랫폼 웹 프로그램을 개발한다.

### 1.2 기존 시스템 분석 요약
- **원본 프로그램**: 중앙선거관리위원회 정치자금 회계관리 프로그램 v2.0~v2.6.1 (SQ Technologies 개발)
- **데이터베이스**: SQLite 3 (Fund_Master.db, Fund_Data_1.db, Fund_Data_2.db)
- **대상 사용기관**: 중앙당, 시도당, 정책연구소, 정당선거사무소, 국회의원, (예비)후보자, 경선후보자, 후원회
- **주요 업무**: 사용기관 관리 → 수입지출처 관리 → 수입/지출 내역관리 → 재산내역관리 → 결산/보고서 출력
- **참고 자료**: 정치자금회계관리프로그램 도움말.pdf, 제9회 지방선거 사용자 매뉴얼 (예비)후보자 및 그 후원회용.pdf

### 1.3 기술 스택
| 구분 | 기술 | 이유 |
|------|------|------|
| Frontend | Next.js 16 (App Router) + React 19 | SSR/SSG, 파일 기반 라우팅 |
| UI | shadcn/ui + Tailwind CSS | 데이터 테이블, 폼 컴포넌트 풍부 |
| Backend | Next.js API Routes + Supabase Client | API Routes에서 서버사이드 Supabase 호출 |
| Database | **Supabase (PostgreSQL)** | 클라우드 DB, RLS, 실시간 구독, Auth 내장 |
| ORM/Client | @supabase/supabase-js + @supabase/ssr | 타입 안전한 DB 접근 |
| 인증 | Supabase Auth | 이메일/비밀번호 기반, 세션 관리 내장 |
| 엑셀 입출력 | exceljs | 템플릿 기반 엑셀 읽기/쓰기 (병합셀, 서식 유지) |
| PDF 출력 | jsPDF + html2canvas | 보고서 PDF 출력 |
| SQLite 변환 | sql.js (WASM) | .db 파일 내보내기/가져오기 (선관위 제출용) |
| 상태관리 | Zustand | 경량, 간결 |

### 1.4 외부 서비스 연결 정보
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>

# 우정사업본부 우편번호 검색 API
EPOST_API_KEY=<your-epost-api-key>

# Supabase Service Role Key (서버사이드 전용, RLS 우회)
SUPABASE_SERVICE_ROLE_KEY=<서버에서만 사용, .env.local에 설정>
```

### 1.5 배포 환경

#### Production (Vercel)
```
URL: https://political-fund-accounting-managemen.vercel.app
플랫폼: Vercel (Hobby Plan)
GitHub: https://github.com/DrunkenZealnut/PoliticalFundAccountingManagement
브랜치: main

빌드 설정:
  - Framework: Next.js (자동 감지)
  - Root Directory: app/ (Vercel CLI로 app 디렉토리에서 배포)
  - Build Command: next build (기본값)
  - Output Directory: .next (기본값)
  - Node.js: 20.x

환경변수 (Vercel Dashboard → Settings → Environment Variables):
  - NEXT_PUBLIC_SUPABASE_URL        (Production)
  - NEXT_PUBLIC_SUPABASE_ANON_KEY   (Production)
  - SUPABASE_SERVICE_ROLE_KEY       (Production, Sensitive)
  - EPOST_API_KEY                   (Production)

배포 방법:
  1. Vercel CLI: cd app && npx vercel --prod
  2. Git Push: main 브랜치 push 시 자동 배포 (Vercel Git Integration 설정 시)
```

#### Development (로컬)
```
URL: http://localhost:3010
실행: cd /tmp/pfund-app && npm run dev -- --port 3010
주의: Turbopack이 한글 경로에서 panic → /tmp/pfund-app에 복사 후 실행
환경변수: app/.env.local (git 제외)
```

#### 주의사항
```
1. .env.local은 git에 포함되지 않음 → 신규 환경 구축 시 수동 생성 필요
2. SUPABASE_SERVICE_ROLE_KEY는 절대 클라이언트에 노출 금지 (NEXT_PUBLIC_ 접두사 불가)
3. Vercel 배포 시 sql.js WASM 파일은 node_modules에서 자동 로드됨
4. 우편번호 검색 API는 HTTP (not HTTPS) 사용 — Vercel 서버사이드에서 호출
```

---

## 2. 데이터베이스 스키마

### 2.1 Supabase 프로젝트 구조
```
Supabase Project: ukviuatpsjvpdsklgnph
├── Database (PostgreSQL 15)
│   ├── public schema          # 모든 테이블
│   └── auth schema            # Supabase Auth (사용자 인증)
├── Auth                       # 이메일/비밀번호 인증
├── Storage                    # 백업 파일, 엑셀 양식 보관
│   ├── backups/               # DB 스냅샷 (JSON export)
│   └── templates/             # 보고서 엑셀 양식
└── Edge Functions (선택)       # 복잡한 보고서 생성 로직
```

> **기존 SQLite → Supabase 마이그레이션**: 기존 Fund_Master.db의 데이터를
> PostgreSQL 테이블로 변환하여 Supabase에 적재한다. (부록 C 참조)

### 2.2 핵심 테이블 ERD

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  CODESET    │────<│  CODEVALUE   │>────│   ACC_REL    │
│  (코드분류)  │     │  (코드값)     │     │ (계정관계)    │
│─────────────│     │──────────────│     │──────────────│
│ CS_ID (PK)  │     │ CV_ID (PK)   │     │ ACC_REL_ID   │
│ CS_NAME     │     │ CS_ID (FK)   │     │ ORG_SEC_CD   │
│ CS_ACTIVEFLAG│    │ CV_NAME      │     │ INCM_SEC_CD  │
│ CS_COMMENT  │     │ CV_ORDER     │     │ ACC_SEC_CD   │
└─────────────┘     │ CV_ETC1~10   │     │ ITEM_SEC_CD  │
                    └──────────────┘     │ EXP_SEC_CD   │
                           │             │ INPUT_YN     │
                           │             │ ACC_ORDER    │
                    ┌──────┴──────┐      └──────────────┘
                    │             │
              ┌─────┴─────┐ ┌────┴──────┐
              │  ORGAN    │ │ CUSTOMER  │
              │ (사용기관)  │ │(수입지출처) │
              │───────────│ │───────────│
              │ ORG_ID(PK)│ │CUST_ID(PK)│
              │ORG_SEC_CD │ │CUST_SEC_CD│
              │ORG_NAME   │ │NAME       │
              │REG_NUM    │ │REG_NUM    │
              │REP_NAME   │ │JOB        │
              │ACCT_NAME  │ │TEL/ADDR   │
              │ACC_FROM/TO│ │SIDO       │
              │PASSWD     │ └───────────┘
              └─────┬─────┘       │
                    │             │
              ┌─────┴─────────────┴─────┐
              │       ACC_BOOK          │
              │    (수입지출 회계장부)     │
              │─────────────────────────│
              │ ACC_BOOK_ID (PK)        │
              │ ORG_ID (FK → ORGAN)     │
              │ CUST_ID (FK → CUSTOMER) │
              │ INCM_SEC_CD  (총괄계정)  │
              │ ACC_SEC_CD   (계정구분)  │
              │ ITEM_SEC_CD  (계정과목)  │
              │ EXP_SEC_CD   (경비구분)  │
              │ ACC_DATE     (거래일자)  │
              │ CONTENT      (내역)     │
              │ ACC_AMT      (금액)     │
              │ RCP_YN       (영수증여부)│
              │ RCP_NO       (증빙번호)  │
              │ EXP_TYPE_CD  (지출유형)  │
              │ EXP_GROUP1~3 (지출분류)  │
              │ RETURN_YN    (반환여부)  │
              └─────────────────────────┘
                    │
    ┌───────────────┼───────────────┐
    │               │               │
┌───┴────┐   ┌──────┴──────┐  ┌────┴─────┐
│ACC_BOOK│   │ ACCBOOKSEND │  │  ESTATE  │
│ _BAK   │   │ (전송이력)   │  │ (재산내역)│
│(복구용) │   │─────────────│  │──────────│
│────────│   │ACC_BOOK_ID  │  │ESTATE_ID │
│BAK_ID  │   │SEND_DATE    │  │ORG_ID    │
│WORK_KIND│  └─────────────┘  │KIND/QTY  │
│(원본복사)│                   │AMT       │
└────────┘                    └──────────┘

┌────────────────┐    ┌──────────────┐    ┌──────────────┐
│  CUSTOMER_ADDR │    │   OPINION    │    │   SUM_REPT   │
│ (주소이력관리)  │    │ (감사의견서)  │    │ (총괄보고서)  │
│────────────────│    │──────────────│    │──────────────│
│CUST_ID (FK)    │    │ORG_ID (PK)  │    │SUM_REPT_ID   │
│CUST_SEQ        │    │ACC_FROM/TO  │    │ORG_ID        │
│REG_DATE        │    │AUDIT_FROM/TO│    │ACC_SEC_CD    │
│TEL/POST/ADDR   │    │OPINION      │    │COL_01~33     │
└────────────────┘    │POSITION/NAME│    │STATUS        │
                      │ESTATE_AMT   │    └──────────────┘
                      │IN/CM/BALANCE│
                      └──────────────┘

┌──────────────┐    ┌──────────────┐
│  COL_ORGAN   │    │    ALARM     │
│ (취합기관)    │    │ (알림설정)   │
│──────────────│    │──────────────│
│ORG_ID (PK)   │    │YEAR          │
│ORG_SEC_CD    │    │ORG_ID        │
│ORG_NAME      │    │TYPE          │
└──────────────┘    │CHK_YN        │
                    └──────────────┘
```

### 2.3 코드 체계 (CODESET → CODEVALUE)

| CS_ID | 코드분류명 | 주요 코드값 (CV_ID: CV_NAME) |
|-------|---------|---------------------------|
| 0 | 공통코드버전일자 | 0: 20170830 |
| 1 | **총괄계정** | 1: 수입, 2: 지출 |
| 2 | **계정구분** | 3: 보조금외, 4: 경상보조금, 5: 선거보조금, 6: 여성추천보조금, 104: 장애인추천보조금 |
| 3 | **계정과목** | 7: 전년도이월, 8: 당비, 9: 기탁금, 10: 후원회기부금, 11: 보조금, 12: 차입금, 13~18: 기타수입과목, 19: 선거비용, 20~29: 지출과목, 30~35: 재산과목 |
| 4 | **경비구분** | 39: 선거비용, 40: 기본경비, 41: 정치활동비, 42: 지원금 |
| 5 | **재산구분** | 43: 토지, 44: 건물, 45: 주식/유가증권, 46: 비품, 47: 현금/예금, 48: 그 밖의 재산, 49: 차입금 |
| 6 | **사용기관** | 50: 중앙당, 51: 정책연구소, 52: 시도당, 53: 정당선거사무소, 54: 국회의원, 90: (예비)후보자, 91~92/106~109/587~589: 후원회 유형 |
| 7 | **수입지출처구분** | 62: 사업자, 63: 개인, 89: 후원회, 88: 중앙당, 57~61: 정당기관, 103: 기타 |
| 8 | **시도구분** | 64~79, 105: 서울~제주 (17개 시도) |
| 9 | 영수증첨부여부 | 80: 첨부, 81: 미첨부 |
| 10 | 후보자계정 | 84: 후보자등 자산, 85: 후원회기부금, 82: 보조금, 83: 보조금외 지원금 |
| 11 | 후보자과목 | 86: 선거비용, 87: 선거비용외 정치자금 |
| 12 | 후원회과목 | 93~101: 전년도이월~그 밖의 경비 |
| 13 | 기부제한액 | 1회/연간 한도액 설정 |
| 14 | 익명후원금 한도 | 117: 10만원 |
| 16 | **지급방법** | 118: 계좌입금, 119: 카드, 120: 현금, 583: 수표, 584: 신용카드, 585: 체크카드, 121: 미지급, 122: 기타 |
| 17 | **지출유형** | 123~582: 대분류/중분류/소분류 코드 (사용기관별, 과목별) |
| 18 | 복구허용건수 | 562: 100건 |
| 19 | 지출결의서 출력제한 | 563: 10건 |

### 2.4 ACC_REL (계정관계 매트릭스)
사용기관 유형(ORG_SEC_CD)에 따라 어떤 총괄계정(INCM_SEC_CD) → 계정구분(ACC_SEC_CD) → 계정과목(ITEM_SEC_CD) 조합이 허용되는지, 입력 가능 여부(INPUT_YN)를 정의한다.
- 예: ORG_SEC_CD=50(중앙당), INCM_SEC_CD=1(수입), ACC_SEC_CD=3(보조금외), ITEM_SEC_CD=7(전년도이월), INPUT_YN='Y' → 중앙당 수입 보조금외 전년도이월 입력 가능

---

## 3. 기능 설계

### 3.1 메뉴 구조

```
정치자금 회계관리
├── 1. 시스템관리
│   ├── 자료 백업 및 복구
│   ├── 자료초기화
│   ├── 로그아웃/로그인
│   ├── 코드관리
│   └── 종료
├── 2. 기본자료관리
│   ├── 사용기관관리
│   ├── 수입지출처 관리
│   └── 수입지출처 일괄등록
├── 3. 정치자금관리
│   ├── 수입내역관리
│   ├── 지출내역관리
│   ├── 수입지출내역 일괄등록
│   ├── 당비영수증 출력 (정당 전용)
│   ├── 지출결의서 출력
│   └── 재산내역관리 / 재산명세서
├── 4. 보고관리
│   ├── 결산작업 (정당 전용)
│   ├── 취합작업 (정당 - 중앙당, 시도당 전용)
│   ├── 제출파일생성 (정당: .txt, 후보자/후원회: .db)
│   ├── 정당의 수입지출 총괄표 / 재산 및 수입지출 총괄표 (정당 전용)
│   ├── 지원금내역 (정당 - 중앙당, 시도당, 정당선거사무소 전용)
│   ├── 정치자금 수입지출 보고서 (국회의원, (예비)후보자)
│   ├── 정치자금 수입지출부 (국회의원, (예비)후보자)
│   ├── 정치자금 수입지출부 보전비용 ((예비)후보자 전용)
│   ├── 정치자금 수입지출 공개 ((예비)후보자 - 개인정보 마스킹)
│   ├── 후원회의 수입지출 총괄표 (후원회 전용)
│   ├── 보고서 및 과목별 수입지출부 출력 (공통)
│   ├── 후원금 기부자 명단조회 / 국세청 자료추출 (후원회 전용)
│   └── 감사의견서 등 출력 (후원회 전용)
└── 5. 도움말
```

### 3.2 사용기관별 메뉴 차이

| 기능 | 정당 (중앙/시도/정책연/선거사무소) | 국회의원/경선후보자 | (예비)후보자 | 후원회 |
|------|:---:|:---:|:---:|:---:|
| 당비영수증 출력 | O (정책연구소 제외) | - | - | - |
| 결산작업 | O | - | - | - |
| 취합작업 | O (정책연구소, 정당선거사무소 제외) | - | - | - |
| 제출파일생성 (.txt) | O (중앙당 제외) | - | - | - |
| 제출파일생성 (.db) | - | - | O | O |
| 경비구분 | O | - | - | - |
| 지출유형 (대/중/소분류) | O | O | O | - |
| 지출방법 | O | O | O | O |
| 지원금내역 | O (정책연구소 제외) | - | - | - |
| 정당의 수입지출 총괄표 | O | - | - | - |
| 정당의 재산및수입지출 총괄표 | O | - | - | - |
| 정치자금 수입지출보고서 | - | O | O | - |
| 정치자금 수입지출부 | - | O | O | - |
| 정치자금 수입지출 공개(마스킹) | - | - | O | - |
| 보전비용 | - | - | O | - |
| 후원회의 수입지출 총괄표 | - | - | - | O |
| 후원금 기부자 명단/국세청자료추출 | - | - | - | O |
| 후원내역엑셀 출력 | - | - | - | O |
| 감사의견서 출력 | O (중앙당, 시도당) | - | - | O |
| 심사의결서 출력 | - | - | - | O |
| 회계보고서 제출문서 | - | - | - | O |
| 정치후원금센터 자료 일괄등록 | - | - | - | O |

### 3.3 각 화면 상세 기능

#### 3.3.1 로그인
```
입력: 이메일(또는 사용자ID), 비밀번호
처리:
  - Supabase Auth signInWithPassword 호출
  - 로그인 성공 → user_organ 테이블에서 해당 사용자의 기관 목록 조회
  - 기관이 1개면 자동 선택, 2개 이상이면 기관 선택 화면 표시
  - 선택된 기관의 ORG_ID, ORG_SEC_CD를 세션/상태에 저장
  - 비밀번호 최소 4자 이상 (한,영,숫자,특수문자 무관, !/따옴표 사용불가)
  - 비밀번호 찾기: HINT1(질문), HINT2(답변) 일치 시 초기화
출력: 메인 화면 (사용기관 유형에 맞는 메뉴 표시)
```

#### 3.3.2 사용기관관리 (ORGAN 테이블)
```
화면: 사용기관 정보 폼 + 목록 그리드

[신규등록] - 로그인 전에만 가능
  입력 필드:
  - 사용기관 구분 (CODEVALUE CS_ID=6 드롭다운)
  - 기관명 (ORG_NAME), 등록일자 (REG_DATE)
  - 대표자명 (REP_NAME), 회계책임자 (ACCT_NAME)
  - 사업자번호/생년월일 (REG_NUM)
  - 주소 (POST, ADDR, ADDR_DETAIL) - 우체국 온라인 연계
  - 전화번호 (TEL), 팩스 (FAX)
  - 사용자ID (USERID), 비밀번호 (PASSWD)
  - 비밀번호확인질문/답변 (HINT1/HINT2)
  - 이전 회계기간 (PRE_ACC_FROM ~ PRE_ACC_TO)
  - 당해 회계기간 (ACC_FROM ~ ACC_TO)

  중복체크: 사용기관구분 + 기관명 + 사업자번호 동일 시 등록 불가

[수정/삭제] - 로그인 후에만 가능
  - 사용기관 구분은 변경 불가 (신규등록 시에만 설정)
  - 수입/지출 내역이 존재하는 사용기관은 삭제 불가

[사용기관 전환/추가] - 로그인 후
  - 대시보드 사이드바 상단 "사용기관 전환/추가" 링크
  - /select-organ 페이지에서 등록된 기관 목록 표시
  - "사용기관 신규등록" 버튼으로 추가 기관 등록 가능
  - 동일 이메일(user_id)에 여러 기관 연결 (user_organ 1:N)
  - 예: 후보자 + 후원회를 하나의 계정으로 관리
```

#### 3.3.3 수입지출처관리 (CUSTOMER 테이블)
```
화면: 수입지출처 목록 그리드 + 상세 폼

[신규등록]
  입력 필드:
  - 구분 (CUST_SEC_CD - CODEVALUE CS_ID=7 드롭다운)
  - 성명/명칭 (NAME)
  - 생년월일/사업자번호 (REG_NUM)
  - 직업 (JOB)
  - 지역/시도 (SIDO - CODEVALUE CS_ID=8)
  - 우편번호 (POST), 주소 (ADDR, ADDR_DETAIL)
  - 전화번호 (TEL), 팩스 (FAX)
  - 비고 (BIGO)

  중복체크: 구분 + 성명 + 생년월일(사업자번호)가 같으면 등록 불가
           (기존 등록된 중복자료는 허용)

[수정/삭제]
  - 수입/지출 내역이 등록된 수입지출처는 삭제 불가
  - 주소, 전화번호는 이력관리 (CUSTOMER_ADDR 테이블)

[일괄등록] - 엑셀 파일(xls, xlsx) 업로드
  - CUSTOMERTEMP 테이블로 임시 저장
  - 오류 검증 후 일괄 등록
  - 수입지출처 자료를 엑셀파일로 다운로드 가능
```

#### 3.3.4 수입내역관리 (ACC_BOOK 테이블, INCM_SEC_CD=1)
```
화면: 상단 - 입력/검색 폼, 하단 - 내역 그리드

[첫 화면]
  - 당해 회계기간 내 모든 수입내역자료 조회
  - 모든 계정의 수입액 합계, 지출액 합계, 잔액 표시

[신규입력]
  입력 필드:
  - 계정 (ACC_SEC_CD - 계정구분)
  - 과목 (ITEM_SEC_CD - 계정과목, ACC_REL에 의해 필터링)
  - 수입일자 (ACC_DATE - 회계기간 범위 내)
  - 수입제공자 (CUST_ID - 수입지출처 검색/선택 팝업)
  - 수입금액 (ACC_AMT)
  - 수입내역 (CONTENT)
  - 증빙서첨부 (RCP_YN - Y/N)
  - 증빙서번호 (RCP_NO)
  - 비고 (BIGO)

  비즈니스 규칙:
  - 과목이 '당비', '기명후원금', '익명후원금'인 경우 과목 자동 출력
  - 후원금 한도 체크 (CODEVALUE CS_ID=13, 14):
    · 익명후원금 1회 한도: 10만원
    · 후원회 연간 모금 한도: 500만원/1천만원
    · 한도 초과 시 팝업 경고 후 저장 가능
  - 반환자료는 마이너스(-) 금액 입력
  - 전년도이월 과목 미등록 시 매년 초 안내 팝업

[조회]
  검색 조건: 계정, 경비, 과목, 내역, 일자범위, 금액, 증빙서번호,
            비고, 증빙서 미첨부, 수입제공자/지출대상자
  - Like 검색 지원 (일부 값 입력 가능)
  - 수입일자From ≠ 1/1이면 누계액 표시

[수정] 그리드에서 선택 → 상단 폼에 표시 → 수정 → 저장
[삭제] 단건/다중선택 삭제 가능
[복구] Ctrl+Z - ACC_BOOK_BAK 테이블 활용, 최대 100건 (로그인 세션 내)
[정렬저장] 같은 일자 내 드래그&드롭으로 순서 변경 (ACC_SORT_NUM)
[영수증일괄입력] 증빙서번호 일괄 부여
[수입부 출력] 계정/과목별 수입부 내역 프린터/엑셀 출력
[당비영수증 출력] 납입자 조건 검색 후 일괄 인쇄 (정당 전용)
[후원내역엑셀] 후원금센터 업로드용 엑셀 다운로드 (후원회 전용)
[일자별합산] '당비' 과목은 일자별 합산, '기명후원금'은 30만원 초과금액/반환후원금 제외 합산
```

#### 3.3.5 지출내역관리 (ACC_BOOK 테이블, INCM_SEC_CD=2)
```
화면: 수입내역관리와 동일 구조

[추가 필드 - 지출 전용]
  - 경비 (EXP_SEC_CD - 경비구분, 정당/선거사무소만)
  - 지출방법 (ACC_INS_TYPE - CODEVALUE CS_ID=16)
    · 계좌입금, 카드, 현금, 수표, 신용카드, 체크카드, 미지급, 기타
  - 지출유형 (EXP_TYPE_CD - CODEVALUE CS_ID=17)
    · 대분류 > 중분류 > 소분류 (EXP_GROUP1~3_CD)
    · 사용기관별, 과목별 다름
  - 지출대상자 (CUST_ID - 수입지출처 검색)

[지출결의서 출력]
  - 계정, 경비, 과목, 지출기간 조건으로 조회
  - 소관(발의)부서, 정치자금종류 입력
  - 엑셀 일괄 출력 (다중선택, 최대 10건)

[지출부 출력] 계정/과목별 지출부 내역 프린터/엑셀 출력
```

#### 3.3.6 수입지출내역 일괄등록
```
화면: 탭 구성 - 수입내역 일괄등록 탭 / 지출내역 일괄등록 탭 / 정치후원금센터 후원금 자료 일괄등록 탭

[수입내역/지출내역 일괄등록 처리 흐름]
  1. 엑셀 파일 선택 (샘플 양식 제공)
  2. [저장 전 자료확인] - 오류 검증
     - 필수항목 누락 (* 표시 항목)
     - 데이터 형식 오류 (일자, 생년월일, 수입지출처구분 등)
     - 생년월일/사업자번호 미작성 시 9999 자동 입력
  3. 오류 있으면 저장 불가, 엑셀 다운로드로 오류 확인
  4. 오류 없으면 [저장] → 일괄 등록
     - 미등록 수입지출처 자동 등록
     - 기등록 수입지출처 정보 자동 수정

[정치후원금센터 후원금 자료 일괄등록] (후원회 전용)
  - 정치후원금센터에서 받은 후원금 자료를 일괄 등록하는 기능
  - 후원회 기관만 사용 가능
  - [저장 전 자료확인], [저장], [삭제], [일괄삭제] 기능은 수입내역 탭과 동일
  - 과목은 '기명후원금'으로 자동 입력
  - 수입내역은 '기명후원금(후원금센터)'로 자동 입력
  - 일괄등록 시 제정 수입, 과목 기명후원금으로 자동 등록
```

#### 3.3.7 재산내역관리 (ESTATE 테이블)
```
화면: 재산 구분별 입력 폼 + 목록 그리드

입력 필드:
  - 재산구분 (ESTATE_SEC_CD - CODEVALUE CS_ID=5)
    · 토지, 건물, 주식/유가증권, 비품, 현금/예금, 그 밖의 재산, 차입금
  - 종류 (KIND)
  - 수량 (QTY)
  - 내용 (CONTENT)
  - 금액 (AMT)
  - 비고 (REMARK)

[재산명세서 출력] 재산 구분별 세부내역서 출력
```

#### 3.3.8 보고관리

**결산작업 (정당 전용)**
```
- 수입/지출 데이터 마감 처리
- 전체 계정의 수입/지출/잔액 최종 확인
```

**취합작업 (정당 전용 - 중앙당, 시도당)**
```
- 하위 기관의 회계 데이터를 취합
- COL_ORGAN 테이블: 취합 대상 기관 관리
- SUM_REPT 테이블: 취합 결과 (COL_01~33 컬럼으로 금액 저장)
```

**제출파일생성**
```
사용기관별로 제출 파일 형식이 다르다:

[정당 (시도당, 정책연구소, 정당선거사무소)] → .txt 파일
  - 시도당: "사용기관명(자체분).txt" + "사용기관명(정당선거사무소취합분).txt"
  - 정책연구소/정당선거사무소: "사용기관명(자체분).txt"
  - 결산작업 미수행 시 오류 메시지
  - 정당선거사무소 취합자료 미등록 시 오류 메시지 (시도당)
  - 생성 후 저장위치와 파일명 안내

[국회의원, (예비)후보자, 후원회] → .db 파일 (SQLite)
  - Supabase 데이터를 SQLite 형식으로 변환 (sql.js WASM 활용)
  - Fund_Data_1.db / Fund_Data_2.db 형태로 다운로드
  - 테이블명/컬럼명을 원본 대문자(ACC_BOOK 등)로 복원
  - 상세: 섹션 5.9 참조

※ 중앙당은 제출파일 생성 대상이 아님 (취합만 수행)
```

**회계보고서 출력 (사용기관별)**

| 사용기관 유형 | 출력 보고서 |
|-------------|-----------|
| 정당 (중앙당, 시도당, 정책연, 선거사무소) | 재산명세서, 재산 구분별 세부내역서, 정당의 수입지출 총괄표, 정당의 재산 및 수입지출 총괄표, 수입부(계정/과목 표지 + 내역), 지출부(계정/과목 표지 + 내역), 지원금내역 |
| 국회의원, (예비)후보자, 경선후보자 | 정치자금 수입지출보고서, 재산명세서, 재산 구분별 세부내역서, 수입지출부 표지, 계정과목별 수입지출 내역, 보전비용((예비)후보자) |
| 후원회 | 재산명세서, 재산 구분별 세부내역서, 후원회의 수입지출 총괄표, 수입부(계정/과목 표지 + 내역), 지출부(계정/과목 표지 + 내역), 1회 30만원 초과 기부자 명단, 연간 300만원/500만원 초과 기부자 명단 |

**감사의견서 (OPINION 테이블)**
```
입력 필드:
  - 회계기간, 감사기간, 감사의견
  - 감사자 정보 (직위, 주소, 성명)
  - 심사기간, 수입지출기간
  - 재산/수입/지출/잔액 금액
  - 운영위원회, 운영위원 성명 (최대 5인)
  - 회계보고서 정보 (문서번호, 날짜, 기관명)
```

**후원금 기부자 명단조회 (후원회 전용)**
```
- 첫 화면: '1회 30만원 초과 기부자' 내역이 기본 조회
- 구분: 1회 30만원 초과 기부자 / 연간 300만원 초과 기부자
  · 후원회별 연간 한도액 자동 설정 (공통코드 13):
    대통령선거경선/후보자 후원회: 500만원
    국회의원/당대표경선/(예비)후보자 후원회: 300만원
- 체크박스:
  ① 전년도 자료 Check → 이전 회계기간 포함
  ② 반환자료 Check → [반환자료저장]한 자료만 조회
  ③ 반환금 Check → 수입금액이 마이너스(-)인 자료만 조회
- [반환자료저장]: 초과기부 건(+금액)과 반환등록 건(-금액)을 체크 후 저장
  → 반환처리된 자료는 건수/금액합계에 포함되지 않음
  → 반환 취소: UnCheck 후 [반환자료저장]
- [국세청 자료추출]: '국세청 자료추출' 선택 → 후원기간 입력 → [조회] → [엑셀] 다운로드
- [기부자] 검색: 특정 기부자 이름으로 검색 가능
```

**지원금내역 (정당 전용 - 중앙당, 시도당, 정당선거사무소)**
```
- 회계기간 동안의 지원금 지출 내역을 조회/출력하는 화면
- 지출 경비가 '지원금'인 내역만 대상
- 기간 입력 후 [조회] → 지원금 지출내역 화면에 표출
- 전년도 자료 Check 시 이전 회계기간 포함
- 문서번호 입력 후 [출력]/[엑셀] (문서번호는 저장되지 않고 출력에만 반영)
```

**정치자금 수입지출 공개 ((예비)후보자 전용) - 개인정보 마스킹**
```
정치자금 수입지출부 화면에서 [전송] 버튼 클릭 시:
  - 개인정보를 마스킹 처리하여 암호화 전송
  - [정보공개용] 버튼으로 삭제 가능

수입지출처 구분별 마스킹 규칙:
  [개인]
    성명: 2자리이하→전체출력/이후**, 2자리초과→한자리출력/이후**
    생년월일: '***'로 처리
    전화번호: 4자리이하→공백, 10자리이하→앞2자리/이후***,
              11자리이상→앞3자리/이후***
    주소: 공란 구분 문자 3개까지 출력/이후***
    직업: '***'로 처리
  [국회의원/(예비)후보자]
    성명: 그대로 출력
    전화번호: 좌동(개인과 동일)
  [그 외 (사업자 등)]
    전화번호: 4자리이하→공백,
              10자리이상+이동전화→앞3자리/이후***,
              이동전화 아니면→공백 출력
    주소: '-' (하이픈)으로 출력
```

#### 3.3.9 시스템관리

**자료 백업 및 복구 (Supabase 환경)**
```
[백업]
  - 사용기관별 데이터를 JSON으로 Export
  - Supabase Storage 'backups' 버킷에 저장
  - 파일명: {org_id}_{기관명}_{timestamp}.json
  - 자동 백업: 프로그램 [종료] 버튼 또는 우측[X] 클릭 시 자동 백업
  - 주의: [로그아웃/로그인] 메뉴로 전환 시에는 자동백업 되지 않음!
  - Supabase 자체 Point-in-Time Recovery (유료 플랜)도 활용 가능

[복구]
  - 백업 JSON 파일 목록에서 선택
  - 해당 기관의 기존 데이터 DELETE 후 JSON에서 INSERT
  - 트랜잭션 처리로 원자성 보장 (Supabase RPC)
```

**자료초기화**
```
- 삭제할 수입기간일 범위 설정 (시작일 ~ 종료일)
- 해당 범위의 수입내역 건수/금액, 지출내역 건수/금액 조회
- [일괄삭제] 클릭 → "삭제된 자료는 복구될 수 없습니다" 경고 팝업
- 로그인 비밀번호 입력 필요
- 삭제 후 복구 불가 (수입/지출내역 관리의 복구 기능 대상 아님)
```

**코드관리**
```
- 현재 DB에 등록된 공통코드 버전 확인 ([DB에 등록된 코드자료 조회] → [조회])
- 엑셀파일의 코드자료 불러오기:
  · [엑셀파일의 코드자료 불러오기] 선택 → [조회] → 엑셀파일 선택 → [저장]
  · 중앙선관위 홈페이지에서 배포하는 PFund2_code_yyyymmdd.xls 파일 사용
- 등록 후 로그아웃→재로그인해야 새로운 코드 적용
- 공통코드 버전일자(CS_ID=0)가 중앙선관위 배포 최종 버전이어야 함
- 코드파일은 각 사용기관마다 개별 등록 필요
- 정보목록의 코드자료를 [엑셀]로 다운로드 가능
```

---

## 4. 핵심 비즈니스 로직

### 4.1 계정-과목 매핑 (ACC_REL 기반)
```typescript
// Supabase Client를 통한 계정-과목 조합 조회
async function getAllowedItems(orgSecCd: number, incmSecCd: number) {
  /**
   * ACC_REL에서 ORG_SEC_CD, INCM_SEC_CD로 필터링하여
   * INPUT_YN='Y'인 계정구분-계정과목 조합을 반환
   */
  const { data, error } = await supabase
    .from('acc_rel')
    .select('acc_sec_cd, item_sec_cd, exp_sec_cd, acc_order')
    .eq('org_sec_cd', orgSecCd)
    .eq('incm_sec_cd', incmSecCd)
    .eq('input_yn', 'Y')
    .order('acc_order');

  return data; // [{acc_sec_cd, item_sec_cd, exp_sec_cd, acc_order}]
}
```

### 4.2 후원금 한도 체크
```typescript
async function checkDonationLimit(custId: number, orgId: number, amount: number, accDate: string) {
  /**
   * 후원회 기부금 한도 체크
   *
   * Rules:
   *   1. 익명후원금 1회 한도: codevalue cv_id=117 (10만원)
   *   2. 기명후원금 1회 초과 기부자: codevalue cv_id=102 (30만원)
   *   3. 후원회별 연간 모금 한도: codevalue cs_id=13
   *      - 연간 500만원 또는 300만원 초과 (기관 유형에 따라 다름)
   *
   * Returns: {isOverLimit: boolean, limitType: string, message: string}
   */
}
```

### 4.3 수입/지출 잔액 계산
```typescript
async function calculateBalance(orgId: number, options?: {
  accSecCd?: number;
  itemSecCd?: number;
  dateFrom?: string;
  dateTo?: string;
}) {
  /**
   * 수입액 합계, 지출액 합계, 잔액(수입-지출) 계산
   * acc_book에서 incm_sec_cd=1 → 수입, incm_sec_cd=2 → 지출
   *
   * Supabase RPC (PostgreSQL function) 또는 클라이언트 쿼리로 구현
   */
  // 방법 1: Supabase RPC (DB function)
  const { data } = await supabase.rpc('calculate_balance', {
    p_org_id: orgId,
    p_acc_sec_cd: options?.accSecCd,
    p_date_from: options?.dateFrom,
    p_date_to: options?.dateTo,
  });

  // 방법 2: 클라이언트 쿼리
  let query = supabase
    .from('acc_book')
    .select('incm_sec_cd, acc_amt')
    .eq('org_id', orgId);
  if (options?.accSecCd) query = query.eq('acc_sec_cd', options.accSecCd);
  if (options?.dateFrom) query = query.gte('acc_date', options.dateFrom);
  if (options?.dateTo) query = query.lte('acc_date', options.dateTo);
}
```

### 4.4 증빙서번호 자동 부여
```typescript
async function autoGenerateReceiptNumbers(orgId: number, bookIds: number[]) {
  /**
   * codevalue cs_id=2,3,10,12의 cv_etc 컬럼에서 영수증번호 체계를 읽어
   * 증빙서 첨부(Y) + 번호 미입력 건에 일괄 번호 부여
   * Supabase RPC로 트랜잭션 처리 권장
   */
}
```

---

## 5. API 설계

> **Supabase 접근 패턴**: 단순 CRUD는 프론트엔드에서 `@supabase/supabase-js`로 직접 호출하고,
> 복잡한 비즈니스 로직(한도 체크, 일괄등록, 보고서 생성)은 Next.js API Routes를 통해 서버사이드에서 처리한다.
> RLS(Row Level Security) 정책으로 사용기관별 데이터 격리를 보장한다.

### 5.0 Supabase 클라이언트 설정
```typescript
// lib/supabase/client.ts (브라우저용)
import { createBrowserClient } from '@supabase/ssr';
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// lib/supabase/server.ts (서버용 - API Routes, Server Components)
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
export async function createSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: (cookiesToSet) => {
      cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
    }}}
  );
}
```

### 5.1 인증 (Supabase Auth 활용)
| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/api/auth/login` | Supabase Auth signInWithPassword + organ 연결 |
| POST | `/api/auth/logout` | Supabase Auth signOut (자동 백업 트리거) |
| POST | `/api/auth/signup` | 신규 사용자 등록 (Supabase Auth + organ 생성) |
| POST | `/api/auth/find-password` | 비밀번호 찾기 (힌트 질문/답변) |
| POST | `/api/auth/switch-organ` | 로그인 유지 상태에서 사용기관 전환 |

### 5.2 사용기관 (ORGAN)
| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/organs` | 사용기관 목록 조회 |
| GET | `/api/organs/:id` | 사용기관 상세 조회 |
| POST | `/api/organs` | 사용기관 등록 |
| PUT | `/api/organs/:id` | 사용기관 수정 |
| DELETE | `/api/organs/:id` | 사용기관 삭제 |

### 5.3 수입지출처 (CUSTOMER)
| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/customers` | 수입지출처 목록 (페이징, 검색) |
| GET | `/api/customers/:id` | 수입지출처 상세 (주소 이력 포함) |
| POST | `/api/customers` | 수입지출처 등록 |
| PUT | `/api/customers/:id` | 수입지출처 수정 |
| DELETE | `/api/customers/:id` | 수입지출처 삭제 |
| POST | `/api/customers/batch` | 수입지출처 일괄등록 (엑셀) |
| GET | `/api/customers/export` | 수입지출처 엑셀 다운로드 |

### 5.4 수입/지출 내역 (ACC_BOOK)
| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/accounts` | 수입/지출 내역 조회 (필터, 페이징) |
| GET | `/api/accounts/:id` | 내역 상세 조회 |
| POST | `/api/accounts` | 내역 등록 |
| PUT | `/api/accounts/:id` | 내역 수정 |
| DELETE | `/api/accounts/:id` | 내역 삭제 (단건) |
| DELETE | `/api/accounts/batch` | 내역 다중 삭제 |
| POST | `/api/accounts/undo` | 복구 (Ctrl+Z) |
| PUT | `/api/accounts/sort` | 정렬순서 저장 |
| POST | `/api/accounts/batch-import` | 일괄등록 (엑셀) |
| PUT | `/api/accounts/batch-receipt` | 영수증번호 일괄입력 |
| GET | `/api/accounts/summary` | 수입액/지출액/잔액 합계 |
| GET | `/api/accounts/daily-summary` | 일자별 합산 |

### 5.5 재산내역 (ESTATE)
| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/estates` | 재산내역 목록 |
| POST | `/api/estates` | 재산내역 등록 |
| PUT | `/api/estates/:id` | 재산내역 수정 |
| DELETE | `/api/estates/:id` | 재산내역 삭제 |

### 5.6 코드 (CODESET/CODEVALUE)
| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/codes` | 코드분류 목록 |
| GET | `/api/codes/:csId/values` | 코드값 목록 |
| GET | `/api/codes/acc-rel` | 계정관계 매트릭스 조회 |

### 5.7 보고서 및 엑셀 입출력
| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/reports/income-book` | 수입부 데이터 |
| GET | `/api/reports/expense-book` | 지출부 데이터 |
| GET | `/api/reports/asset-statement` | 재산명세서 데이터 |
| GET | `/api/reports/summary-table` | 수입지출 총괄표 데이터 |
| GET | `/api/reports/expense-resolution` | 지출결의서 데이터 |
| GET | `/api/reports/party-receipt` | 당비영수증 데이터 |
| GET | `/api/reports/over-donors` | 초과 기부자 명단 |
| POST | `/api/reports/generate-pdf` | PDF 생성 |
| POST | `/api/reports/generate-excel` | 엑셀 생성 |
| GET | `/api/excel/template/:type` | **엑셀 템플릿 다운로드 (계정-과목별)** |
| GET | `/api/excel/export/:type` | **계정-과목별 수입지출부 엑셀 출력** |
| GET | `/api/excel/export/summary` | **정치자금 수입지출보고서 엑셀 출력** |
| POST | `/api/excel/import` | **엑셀 파일에서 수입지출 데이터 가져오기** |

### 5.7.1 엑셀 템플릿 기반 입출력 상세

> 원본 경로: `중앙선거관리위원회_정치자금회계관리2/엑셀파일/`
> 2022년 실제 선거에서 사용된 엑셀 양식을 템플릿으로 활용한다.

#### 템플릿 파일 목록 (7개)

| 파일명 | 계정(ACC_SEC_CD) | 과목(ITEM_SEC_CD) | 용도 |
|--------|:---:|:---:|------|
| 후보자산-선거비용.xlsx | 84 (후보자등자산) | 86 (선거비용) | 수입지출부 |
| 후보자산-선거비용외.xlsx | 84 (후보자등자산) | 87 (선거비용외정치자금) | 수입지출부 |
| 기부금-선거비용.xlsx | 85 (후원회기부금) | 86 (선거비용) | 수입지출부 |
| 기부금-선거비용외.xlsx | 85 (후원회기부금) | 87 (선거비용외정치자금) | 수입지출부 |
| 보조금-선거비용.xlsx | 82 (보조금) | 86 (선거비용) | 수입지출부 |
| 보조금-선거비용외.xlsx | 82 (보조금) | 87 (선거비용외정치자금) | 수입지출부 |
| 정치자금 수입지출보고서.xls | - | - | 총괄 보고서 |

#### 공통 수입지출부 템플릿 구조 (.xlsx 6개 공통)

```
Row 1   : (빈 행)
Row 2   : [A2:N2 병합] "정 치 자 금  수 입 · 지 출 부" (15pt 볼드, 가운데정렬)
Row 3   : (빈 행)
Row 4   : [A4:K4 병합] "계정(과 목)명: {계정명} ({과목명})"
Row 5-8 : 컬럼 헤더 (2단 병합 구조)
Row 9~  : 거래 데이터

컬럼 구조:
┌───┬──────┬───────────┬───────────┬────┬──────────────────────────────┬─────┬────┬────┐
│ A │  B   │  C  │  D  │  E  │  F  │  G │  H   │   I    │   J  │  K  │  L  │  M  │ N  │ O  │
├───┼──────┼─────┼─────┼─────┼─────┼────┼──────┼────────┼──────┼─────┼─────┼─────┼────┼────┤
│년 │      │ 수입액    ││ 지출액    ││    │ 수입을 제공한 자 또는 지출을 받은 자      │영수증│    │    │
│월 │ 내역 │─────┼─────│─────┼─────│잔액│──────┼────────┼──────┼─────┼─────│일련 │비고│전송│
│일 │      │금회 │누계 │금회 │누계 │    │성명  │생년월일/│ 주소 │직업 │전화 │번호 │    │    │
│   │      │     │     │     │     │    │법인명│사업자번호│      │     │번호 │     │    │    │
└───┴──────┴─────┴─────┴─────┴─────┴────┴──────┴────────┴──────┴─────┴─────┴─────┴────┴────┘

숫자 포맷: #,##0 (천단위 콤마)
날짜 포맷: mm-dd-yy
```

#### 정치자금 수입지출보고서 템플릿 구조 (.xls)
```
Row 0   : "정치자금 수입/지출보고서" (16pt 볼드)
Row 1   : 문서번호
Row 2   : 선거명, 선거구명
Row 3   : 후보자명
Row 4   : "정치자금 수입/지출액"
Row 5-6 : 컬럼 헤더 (2단)
Row 7-11: 집계 데이터

┌──────────────────┬────────┬──────────────────────────┬──────┬──────┐
│     구분         │  수입  │         지 출            │ 잔액 │ 비고 │
│                  │        │ 선거비용 │선거비용외│소계 │      │      │
├──────────────────┼────────┼─────────┼─────────┼─────┼──────┼──────┤
│ 자 산            │        │         │         │     │      │      │
│ 후원회기부금     │        │         │         │     │      │      │
│ 보조금           │        │         │         │     │      │      │
│ 보조금외지원금   │        │         │         │     │      │      │
│ 합 계            │        │         │         │     │      │      │
└──────────────────┴────────┴─────────┴─────────┴─────┴──────┴──────┘

Row 12~ : 법적 문구, 제출일, 서명란
```

#### 엑셀 출력 (DB → 엑셀) 흐름
```
1. 사용자가 계정/과목 선택 또는 "전체 보고서" 선택
2. API에서 해당 계정/과목의 acc_book 데이터 조회
3. 템플릿 파일을 base로 복사 (exceljs 또는 xlsx 라이브러리)
4. Row 4에 계정(과목)명 자동 입력
5. Row 9부터 거래 데이터 채우기:
   - A: acc_date (년월일)
   - B: content (내역)
   - C: acc_amt (수입 금회, incm_sec_cd=1일 때)
   - D: 수입 누계 (이전행 D + 현재 C)
   - E: acc_amt (지출 금회, incm_sec_cd=2일 때)
   - F: 지출 누계 (이전행 F + 현재 E)
   - G: 잔액 (D - F)
   - H: customer.name (성명/법인명)
   - I: customer.reg_num (생년월일/사업자번호)
   - J: customer.addr (주소)
   - K: customer.job (직업)
   - L: customer.tel (전화번호)
   - M: rcp_no (영수증 일련번호)
   - N: bigo (비고)
6. 엑셀 파일 다운로드

전체 보고서 출력 시:
  - 6개 수입지출부 + 1개 보고서 = 7개 파일을 ZIP으로 묶어 다운로드
  - 또는 하나의 엑셀 파일에 계정/과목별 시트로 구성
```

#### 엑셀 가져오기 (엑셀 → DB) 흐름
```
1. 사용자가 엑셀 파일 업로드 (수입지출부 템플릿 형식)
2. API에서 파일 파싱:
   a) Row 4에서 계정/과목명 자동 인식
   b) Row 9~부터 거래 데이터 추출
   c) 각 행에서 필드 매핑:
      - A → acc_date
      - B → content
      - C → acc_amt (수입, incm_sec_cd=1)
      - E → acc_amt (지출, incm_sec_cd=2)
      - H → customer.name으로 수입지출처 매칭/자동생성
      - I → customer.reg_num
      - J,K,L → customer.addr, job, tel
      - M → rcp_no
      - N → bigo
3. 검증:
   - 필수 항목 (날짜, 금액, 내역) 누락 체크
   - 날짜 형식 검증 (회계기간 범위 내)
   - 금액 형식 검증 (숫자)
   - 수입지출처 매칭: 기존 등록자 → 자동 매칭, 미등록자 → 신규 생성 확인
   - 누계/잔액 자동 재계산 (사용자 입력 누계는 무시, DB에서 재계산)
4. 오류 시: 오류 리포트 반환 (행 번호 + 오류 내용)
5. 정상 시: acc_book에 INSERT, customer 자동 등록/매칭
```

#### 템플릿 타입 매핑 (API 파라미터)
```typescript
type ExcelTemplateType =
  | 'candidate-election'        // 후보자산-선거비용
  | 'candidate-non-election'    // 후보자산-선거비용외
  | 'donation-election'         // 기부금-선거비용
  | 'donation-non-election'     // 기부금-선거비용외
  | 'subsidy-election'          // 보조금-선거비용
  | 'subsidy-non-election'      // 보조금-선거비용외
  | 'summary-report';           // 정치자금 수입지출보고서

// 계정/과목 코드 매핑
const TEMPLATE_MAP: Record<ExcelTemplateType, { accSecCd: number; itemSecCd: number }> = {
  'candidate-election':     { accSecCd: 84, itemSecCd: 86 },
  'candidate-non-election': { accSecCd: 84, itemSecCd: 87 },
  'donation-election':      { accSecCd: 85, itemSecCd: 86 },
  'donation-non-election':  { accSecCd: 85, itemSecCd: 87 },
  'subsidy-election':       { accSecCd: 82, itemSecCd: 86 },
  'subsidy-non-election':   { accSecCd: 82, itemSecCd: 87 },
};

// GET /api/excel/template/candidate-election → 빈 템플릿 다운로드
// GET /api/excel/export/candidate-election?orgId=1 → 데이터 포함 엑셀 다운로드
// GET /api/excel/export/summary?orgId=1 → 수입지출보고서 다운로드
// POST /api/excel/import (body: FormData with file) → 엑셀에서 데이터 가져오기
```

### 5.8 시스템관리
| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/api/system/backup` | 자료 백업 (JSON → Supabase Storage) |
| POST | `/api/system/restore` | 자료 복구 (JSON에서 복원) |
| GET | `/api/system/backups` | 백업 목록 조회 |
| POST | `/api/system/reset` | 자료 초기화 |
| POST | `/api/system/export-sqlite` | **SQLite .db 파일 내보내기 (선관위 제출용)** |
| GET | `/api/system/export-sqlite/download` | **생성된 .db 파일 다운로드** |
| POST | `/api/system/import-sqlite` | **SQLite .db 파일 가져오기 (기존 데이터 마이그레이션)** |

### 5.9 SQLite .db 파일 내보내기/가져오기 상세

> 선관위 제출 및 기존 시스템 호환을 위해 Supabase ↔ SQLite 양방향 변환을 지원한다.

#### 내보내기 (Supabase → SQLite .db)
```
용도:
  1. 선관위 제출용 Fund_Data_1.db / Fund_Data_2.db 생성
  2. 로컬 백업용 .db 파일 다운로드

처리 흐름:
  1. API Route에서 서버사이드 실행 (sql.js 또는 better-sqlite3 WASM 사용)
  2. 빈 SQLite DB 생성 → 원본 스키마(DDL) 적용
  3. Supabase에서 해당 org_id의 전체 데이터 SELECT
  4. snake_case → 원본 UPPER_CASE 컬럼명 변환
  5. SQLite DB에 INSERT
  6. .db 파일을 Supabase Storage에 저장 또는 브라우저로 직접 다운로드

기술 선택지:
  - sql.js (SQLite의 Emscripten WASM 빌드) → 서버리스/브라우저 환경에서 동작
  - better-sqlite3 → Node.js 서버 환경에서 네이티브 성능
  - Edge Function → Supabase 내부에서 직접 실행 가능

생성되는 .db 파일 구조:
  - 원본 프로그램과 동일한 테이블명/컬럼명 (대문자)
  - ORGAN, CUSTOMER, ACC_BOOK, ACC_REL, CODESET, CODEVALUE,
    ESTATE, OPINION, SUM_REPT, COL_ORGAN, ALARM,
    ACC_BOOK_BAK, ACCBOOKSEND, CUSTOMER_ADDR,
    CUSTOMERTEMP, CODESETTEMP, CODEVALUETEMP, ACC_REL2, info, TEST
```

#### 가져오기 (SQLite .db → Supabase)
```
용도:
  1. 기존 프로그램 사용자의 백업 .db 파일에서 데이터 복원
  2. Fund_Data_1.db 등 기존 데이터 마이그레이션

처리 흐름:
  1. 사용자가 .db 파일 업로드
  2. 서버에서 sql.js로 SQLite DB 열기
  3. 스키마 호환성 검증 (TC-MIG-001 참조)
  4. 각 테이블 데이터 추출 → UPPER_CASE → snake_case 변환
  5. Supabase 테이블에 INSERT (기존 데이터 유지 또는 덮어쓰기 옵션)
  6. 결과 리포트 반환 (이관 건수, 오류, 경고)
```

### 5.10 구현 완료 기능 상세 (2026-03-24 추가)

#### 5.10.1 SQLite .db 내보내기 (`/api/system/export-sqlite`)
```
구현:
  - sql.js WASM으로 서버사이드 SQLite DB 생성
  - wasmBinary를 node_modules에서 readFileSync로 로드 (Turbopack 호환)
  - 14개 테이블 export: ORGAN, CUSTOMER, ACC_BOOK, ESTATE, OPINION, CODESET, CODEVALUE, ACC_REL 등
  - snake_case → UPPER_CASE 컬럼명 복원 (COL_MAP 매핑)
  - 파일명: "{기관명}(자체분).db"
```

#### 5.10.2 SQLite .db 가져오기 (`/api/system/import-sqlite`)
```
구현:
  - FormData로 .db 파일 업로드, sql.js로 파싱
  - 기존 org 데이터 삭제 후 순차 import (FK 순서 준수)
  - GENERATED ALWAYS AS IDENTITY 컬럼 처리: 기존 PK 제거 후 insert, old→new ID 매핑
  - customer: 개별 insert로 cust_id 매핑 생성
  - acc_book: cust_id 리매핑 + org_id 리매핑
  - CUST_ID ≤ 0 (익명, -999 등): "익명" customer 레코드 자동 생성/매핑 (FK 위반 방지)
  - OPINION: org_id를 현재 사용기관 org_id로 리매핑 (SQLite 원본 org_id와 다를 수 있음)
  - 빈 문자열 → null 변환 (INTEGER 컬럼 호환)
  - NOT NULL 텍스트 컬럼(remark 등)은 빈 문자열 유지
  - 테이블별 import 건수/실패 건수 리포트 반환

검증 완료:
  - Fund_Data_1.db (후보자, 41건): 전체 성공
  - Fund_Data_2.db (후원회, 55건): 전체 성공 (익명 13건 포함)
```

#### 5.10.3 정당 .txt 제출파일 생성
```
구현:
  - 사용기관 유형이 "party"인 경우 텍스트 파일 생성
  - 탭 구분자 형식: [기관정보], [수입지출내역], [재산내역], [합계] 섹션
  - 중앙당(org_sec_cd=50)은 제출파일 생성 불가 (취합만)
  - 파일명: "{기관명}(자체분).txt"
```

#### 5.10.4 감사의견서/심사의결서/회계보고서 제출문서 출력
```
구현:
  - 3개 탭: 감사의견서, 심사의결서, 회계보고서 제출문서
  - 각 탭별 window.open() → print() 방식으로 A4 인쇄
  - OPINION 테이블 데이터 자동 로드 및 저장
  - 실제 선관위 제출 PDF와 동일한 포맷으로 구현 (PR #1)

  감사의견서 (감사의견.pdf 기준):
    - 테두리 박스(2px solid) 안에 전체 내용
    - 제목: "감 사 의 견 서" (밑줄)
    - 본문: 「정치자금법」 제41조제1항에 따라 실시한 YYYY년 MM월 DD일부터 ... 까지의
    - "다 음" (가운데 정렬, 글자 간격)
    - 1. 감사개요 → 가. 감사기간 / 나. 감사대상 (○ 재산상황, ○ 수입지출 내역)
    - 2. 감사의견 (법률 인용문)
    - 3. 특기사항
    - 일자 + 감사자 (직위/주소/성명 + (인))
    - 하단 주석 ①~④ (양식 설명)

  심사의결서 (심사의결서.pdf 기준):
    - 우상단 "원본대조필 (인)" 박스
    - 제목: "재산 및 수입·지출상황 등의 심사의결서"
    - 1. 의결주문 → 법률 인용 + 가. 수입·지출기간 / 나. 재산 / 다. 수입·지출내역 (○수입/○지출/○잔액)
    - 일자 + 기관명 + 예산결산위원회
    - 운영위원 5인 서명란 (직 위：운영위원 성 명：OOO (인))
    - 2. 참고사항 (가. 수입·지출내역 1부 / 나. 심사보고서 1부)
    - 하단 주석 ①~④

  제출문서:
    - 문서번호, 시행일자, 수신/발신 기관
    - 제목: "회 계 보 고 서  제 출"
    - 법적 문구 + 별첨 목록 (5개 항목)
    - 일자 + 기관명 + 회계책임자 OOO (인)
```

#### 5.10.5 후원금 기부자 조회 강화
```
구현:
  - 3개 조회 유형: 1회 30만원 초과, 연간 300만원(또는 500만원) 초과, 국세청 자료추출
  - 반환자료저장: 체크박스 선택 → acc_book.return_yn='Y' 일괄 업데이트
  - 반환취소: return_yn='N'으로 복원
  - 국세청 자료추출: 전체 기부자 목록을 엑셀(xlsx) 다운로드
  - 기부자 검색, 전년도/반환 필터
```

#### 5.10.6 결산작업 확정 및 저장
```
구현:
  - 수입/지출 합계, 계정/과목별 상세, 재산 비교 → 결산확정 버튼
  - 잔액 ≠ 재산(현금및예금) 시 확정 불가
  - 확정 시 organ.acc_from/acc_to 업데이트, opinion에 재산/수입/지출/잔액 저장
  - 결산 완료 후 제출파일생성 안내
```

#### 5.10.7 컬럼 정렬 기능 (공통)
```
구현:
  - useSort 커스텀 훅: 오름차순/내림차순 토글
  - SortTh 컴포넌트: 클릭 가능한 <th>, ▲/▼ 표시
  - 12개 목록 페이지 적용: 수입지출처, 수입내역, 지출내역, 재산내역,
    수입지출부, 후원금기부자, 지출결의서, 당비영수증, 보전비용,
    지원금내역, 백업이력, 코드관리
  - 숫자/문자열 자동 감지 정렬, 한국어 localeCompare
```

#### 5.10.8 우편번호 검색 API
```
구현:
  - 우정사업본부 OpenAPI 연동 (도로명 검색)
  - 엔드포인트: http://openapi.epost.go.kr/postal/retrieveNewAdressAreaCdService/...
  - searchSe=road (도로명/건물명/지번 검색)
  - XML 응답 파싱 (fast-xml-parser), numberParseOptions로 우편번호 앞자리 0 보존
  - 8초 타임아웃 설정
```

#### 5.10.9 RLS 우회 API 라우트 패턴
```
문제: Supabase RLS 정책이 활성화된 테이블은 브라우저의 anon key로 직접 CRUD 불가
해결: Next.js API Route에서 service_role key로 Supabase 클라이언트 생성하여 RLS 우회

적용된 API 라우트:
  - /api/codes           — 코드값/계정관계 조회 (캐시 1시간)
  - /api/customers       — 수입지출처 CRUD (GET: 목록, POST: insert/update/delete/check_used/save_addr_history)
  - /api/acc-book        — 수입지출 회계장부 CRUD + batch_insert + batch_receipt
  - /api/excel/export    — 수입부/지출부 엑셀 출력
  - /api/system/export-sqlite  — SQLite .db 내보내기
  - /api/system/import-sqlite  — SQLite .db 가져오기
  - /api/address/search  — 우편번호 검색

적용된 페이지:
  - /dashboard/customer   → /api/customers 경유 (fetch)
  - /dashboard/income     → /api/acc-book 경유 (fetch)
  - /dashboard/batch-import → /api/acc-book batch_insert 경유
  - 기타 페이지는 브라우저 Supabase 클라이언트 사용 (RLS 미적용 테이블)
```

#### 5.10.10 수입지출내역 일괄등록 API (`/api/acc-book` batch_insert)
```
구현:
  - 엑셀에서 파싱한 데이터를 JSON으로 전송
  - 각 행별 수입지출처 자동 매칭/등록 (이름 기준)
  - 익명("익명" 또는 빈 provider): "익명" customer 레코드 자동 매핑
  - 미등록 수입지출처: 자동 신규 등록 (reg_num 없으면 "9999")
  - 정치후원금센터 탭: acc_sec_cd=3, item_sec_cd=93, content="기명후원금(후원금센터)" 자동 설정
  - service_role key로 RLS 우회하여 insert
```

#### 5.10.11 사용기관 전환 및 다중 기관 관리
```
구현:
  - 사이드바 상단 "정치자금 회계관리" → /dashboard 링크
  - 기관명 + 기관구분(파란색) 표시
  - "사용기관 전환/추가" → /select-organ 페이지
  - /select-organ: 등록된 기관 목록 + "사용기관 신규등록" 버튼
  - /register-organ: 새 기관 등록 후 user_organ에 자동 매핑
  - 사용기관 구분: 로그인 후 변경 불가 (disabled, 신규등록 시에만 설정)
  - user_organ 1:N 매핑으로 하나의 이메일에서 후보자+후원회 동시 관리
```

---

## 6. 페이지 구조 (Next.js App Router)

```
app/
├── layout.tsx                    # 공통 레이아웃 (사이드바 메뉴)
├── page.tsx                      # 로그인 화면
├── (auth)/
│   └── login/page.tsx
├── (main)/                       # 로그인 후 레이아웃
│   ├── layout.tsx                # 메인 레이아웃 (사용기관별 메뉴)
│   ├── dashboard/page.tsx        # 대시보드 (수입/지출/잔액 요약)
│   ├── system/
│   │   ├── backup/page.tsx       # 백업/복구
│   │   ├── codes/page.tsx        # 코드관리
│   │   └── reset/page.tsx        # 자료초기화
│   ├── master/
│   │   ├── organ/page.tsx        # 사용기관관리
│   │   ├── customer/page.tsx     # 수입지출처관리
│   │   └── customer-batch/page.tsx # 수입지출처 일괄등록
│   ├── accounting/
│   │   ├── income/page.tsx       # 수입내역관리
│   │   ├── expense/page.tsx      # 지출내역관리
│   │   ├── batch-import/page.tsx # 수입지출내역 일괄등록
│   │   ├── estate/page.tsx       # 재산내역관리
│   │   ├── receipt/page.tsx      # 당비영수증 출력
│   │   └── resolution/page.tsx   # 지출결의서 출력
│   └── reports/
│       ├── settlement/page.tsx   # 결산작업
│       ├── aggregate/page.tsx    # 취합작업
│       ├── submit/page.tsx       # 제출파일생성
│       ├── print/page.tsx        # 보고서 출력
│       ├── audit/page.tsx        # 감사의견서
│       └── donors/page.tsx       # 후원금 기부자 조회
```

---

## 7. 주요 컴포넌트

### 7.1 공통 컴포넌트
| 컴포넌트 | 설명 |
|---------|------|
| `<CodeSelect csId={n}>` | CODEVALUE 기반 드롭다운 (코드분류 ID 전달) |
| `<CustomerSearch>` | 수입지출처 검색 팝업 (모달) |
| `<DateRangePicker>` | 회계기간 범위 날짜 선택 |
| `<AmountInput>` | 금액 입력 (3자리 콤마, 마이너스 허용) |
| `<DataGrid>` | 정보목록 그리드 (정렬, 다중선택, 드래그&드롭) |
| `<AddressSearch>` | 우편번호/주소 검색 (우정사업본부 API 연동, 아래 7.3 참조) |
| `<ReportViewer>` | 보고서 미리보기 (인쇄/PDF/엑셀 버튼) |
| `<BackupManager>` | 백업/복구 관리 UI |
| `<HelpTooltip>` | **컨텍스트 도움말 툴팁 (아래 7.4 참조)** |

### 7.2 사용기관별 조건부 렌더링
```typescript
// 사용기관 유형에 따른 메뉴/필드 표시 제어
type OrgType = 'party' | 'lawmaker' | 'candidate' | 'supporter';

function getOrgType(orgSecCd: number): OrgType {
  if ([50, 51, 52, 53, 589].includes(orgSecCd)) return 'party';
  if ([54, 106].includes(orgSecCd)) return 'lawmaker';
  if ([90].includes(orgSecCd)) return 'candidate';
  if ([91, 92, 107, 108, 109, 587, 588].includes(orgSecCd)) return 'supporter';
}

// 사용 예시
const showExpenseCategory = orgType === 'party'; // 경비구분
const showExpenseType = orgType === 'party';     // 지출유형
const showPartyReceipt = orgType === 'party';    // 당비영수증
const showDonorList = orgType === 'supporter';   // 후원금 기부자
const showReimbursement = orgType === 'candidate'; // 보전비용
```

### 7.3 우편번호 검색 (우정사업본부 API)

> 기존 프로그램은 인터넷 연결 시 우체국 자료 온라인 연계로 우편번호 검색을 지원했다.
> 웹 버전에서는 우정사업본부 공식 OpenAPI를 사용한다.

#### API 정보
| 항목 | 값 |
|------|---|
| 서비스명 | 우편번호 정보조회서비스 (새주소 기반) |
| Endpoint | `https://openapi.epost.go.kr:80/postal/retrieveNewAdressAreaCdService` |
| 인증키 | 환경변수 `EPOST_API_KEY` |
| 응답형식 | XML |
| 활용신청 | 완료 |

#### 프록시 API Route (CORS 우회 + API키 보호)
```typescript
// app/api/address/search/route.ts
// 프론트엔드에서 직접 호출하면 CORS 차단 + API키 노출되므로
// Next.js API Route를 프록시로 사용

import { NextRequest, NextResponse } from 'next/server';
import { XMLParser } from 'fast-xml-parser';

export async function GET(request: NextRequest) {
  const keyword = request.nextUrl.searchParams.get('keyword');
  const currentPage = request.nextUrl.searchParams.get('currentPage') || '1';
  const countPerPage = request.nextUrl.searchParams.get('countPerPage') || '10';

  if (!keyword || keyword.length < 2) {
    return NextResponse.json({ error: '검색어를 2자 이상 입력하세요' }, { status: 400 });
  }

  const apiKey = process.env.EPOST_API_KEY;
  const endpoint = process.env.EPOST_API_ENDPOINT;

  const url = `${endpoint}?serviceKey=${apiKey}`
    + `&searchSe=dong`           // 검색구분: dong(동/리), post(우편번호)
    + `&srchwrd=${encodeURIComponent(keyword)}`
    + `&countPerPage=${countPerPage}`
    + `&currentPage=${currentPage}`;

  const response = await fetch(url);
  const xml = await response.text();

  // XML → JSON 변환
  const parser = new XMLParser();
  const json = parser.parse(xml);

  // 응답 구조 정규화
  const body = json?.NewAddressListResponse;
  const totalCount = body?.cmmMsgHeader?.totalCount || 0;
  const items = body?.newAddressListAreaCd;

  // 배열 정규화 (1건이면 객체, 여러건이면 배열)
  const list = !items ? [] : Array.isArray(items) ? items : [items];

  return NextResponse.json({
    totalCount,
    currentPage: Number(currentPage),
    addresses: list.map((item: any) => ({
      zipNo: item.zipNo,             // 우편번호 (5자리)
      lnmAdres: item.lnmAdres,       // 도로명주소
      rnAdres: item.rnAdres,         // 지번주소
    })),
  });
}
```

#### AddressSearch 컴포넌트
```typescript
// components/AddressSearch.tsx
interface AddressResult {
  zipNo: string;      // 우편번호
  lnmAdres: string;   // 도로명주소
  rnAdres: string;     // 지번주소
}

interface AddressSearchProps {
  onSelect: (address: {
    post: string;         // 우편번호
    addr: string;         // 기본주소 (도로명)
    addr_detail: string;  // 상세주소 (사용자 입력)
  }) => void;
}

// 사용 예시
<AddressSearch onSelect={({ post, addr, addr_detail }) => {
  // CUSTOMER 또는 ORGAN의 post, addr, addr_detail 필드에 반영
  setValue('post', post);
  setValue('addr', addr);
  setValue('addr_detail', addr_detail);
}} />
```

#### 사용 화면
- **사용기관관리**: 사용기관 주소 등록/수정 시
- **수입지출처관리**: 수입지출처 주소 등록/수정 시
- **수입/지출내역관리**: 수입제공자/지출대상자 신규 등록 팝업에서

### 7.4 컨텍스트 도움말 툴팁 시스템

> 초보 사용자를 위해 모든 기능 버튼, 입력란, 메뉴에 마우스 호버 시
> 도움말 텍스트를 툴팁으로 표시한다. 이 기능은 사용자가 켜고 끌 수 있다.

#### 설계 개요

```
[ON/OFF 토글]
  - 화면 우상단 헤더에 "❓ 도움말" 토글 스위치 배치
  - 상태는 localStorage에 저장 (로그아웃/재로그인 후에도 유지)
  - 기본값: ON (최초 사용자는 도움말이 켜진 상태로 시작)

[툴팁 표시 방식]
  - 마우스 호버 시 300ms 딜레이 후 툴팁 표시
  - 툴팁 위치: 대상 요소 위 또는 아래 (화면 밖으로 넘치지 않도록 자동 조절)
  - 모바일: 롱프레스(500ms)로 표시
  - 도움말 OFF 시 모든 툴팁 비활성 (기본 HTML title 속성도 제거)
```

#### HelpTooltip 컴포넌트
```typescript
// components/HelpTooltip.tsx
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useHelpMode } from '@/stores/helpMode';

interface HelpTooltipProps {
  id: string;           // 도움말 식별자 (예: "income.account-select")
  children: React.ReactNode;
}

export function HelpTooltip({ id, children }: HelpTooltipProps) {
  const { isEnabled } = useHelpMode();
  const tooltip = HELP_TEXTS[id];

  if (!isEnabled || !tooltip) return <>{children}</>;

  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="max-w-xs text-sm">
        <p className="font-semibold">{tooltip.title}</p>
        <p className="text-muted-foreground">{tooltip.description}</p>
      </TooltipContent>
    </Tooltip>
  );
}

// stores/helpMode.ts (Zustand)
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface HelpModeState {
  isEnabled: boolean;
  toggle: () => void;
}

export const useHelpMode = create<HelpModeState>()(
  persist(
    (set) => ({
      isEnabled: true,  // 기본값: 켜짐
      toggle: () => set((s) => ({ isEnabled: !s.isEnabled })),
    }),
    { name: 'help-mode' }  // localStorage key
  )
);
```

#### 도움말 텍스트 데이터
```typescript
// lib/help-texts.ts
// 모든 도움말 텍스트를 중앙 관리 (다국어 확장 가능)

interface HelpText {
  title: string;
  description: string;
}

export const HELP_TEXTS: Record<string, HelpText> = {
  // === 공통 버튼 ===
  'btn.new':         { title: '신규입력', description: '새로운 자료를 입력합니다. 기존 자료 수정/조회 중에 새 자료를 입력하려면 이 버튼을 클릭하세요.' },
  'btn.save':        { title: '저장', description: '신규 또는 수정한 내용을 저장합니다.' },
  'btn.delete':      { title: '삭제', description: '선택한 자료를 삭제합니다. 수입/지출내역이 등록된 수입지출처는 삭제할 수 없습니다.' },
  'btn.search':      { title: '조회', description: '입력한 조건에 따라 자료를 검색합니다. 일부 값만 입력해도 검색됩니다.' },
  'btn.reset':       { title: '화면초기화', description: '입력한 검색 조건을 모두 지우고 기본 조회 화면으로 되돌아갑니다.' },
  'btn.cancel':      { title: '취소', description: '현재 작업을 취소합니다.' },
  'btn.excel':       { title: '엑셀', description: '현재 화면의 자료를 엑셀 파일로 다운로드합니다.' },
  'btn.print':       { title: '출력', description: '현재 화면의 자료를 프린터로 출력합니다.' },
  'btn.undo':        { title: '복구', description: '수정/삭제한 자료를 이전 상태로 되돌립니다. 로그인 중에만 가능하며, 로그아웃 후에는 복구할 수 없습니다.' },
  'btn.sort-save':   { title: '정렬저장', description: '같은 일자 내의 자료 순서를 변경합니다. 드래그&드롭으로 순서를 조정한 후 반드시 이 버튼을 클릭하세요.' },
  'btn.multi-select':{ title: '다중선택', description: '체크박스를 사용하여 여러 항목을 선택할 수 있습니다. 선택 후 삭제 등 일괄 작업이 가능합니다.' },
  'btn.end':         { title: '종료', description: '현재 화면을 닫고 메인 화면으로 돌아갑니다.' },

  // === 수입내역관리 ===
  'income.account':       { title: '계정', description: '수입의 계정을 선택합니다. (예비)후보자: 후보자등자산, 후원회기부금, 보조금, 보조금외지원금 / 후원회: 수입' },
  'income.subject':       { title: '과목', description: '선택한 계정에 따라 사용 가능한 과목이 자동으로 필터링됩니다.' },
  'income.date':          { title: '수입일자', description: '수입이 발생한 날짜를 입력합니다. 당해 회계기간 내의 날짜만 입력 가능합니다.' },
  'income.amount':        { title: '수입금액', description: '수입 금액을 입력합니다. 후원금 반환 시 마이너스(-) 금액을 입력하세요.' },
  'income.provider':      { title: '수입제공자', description: '🔍 버튼으로 기존 등록된 수입지출처를 검색하거나, [수입제공자 등록]으로 새로 등록할 수 있습니다.' },
  'income.content':       { title: '수입내역', description: '수입에 대한 설명을 입력합니다. 당비/기명후원금/익명후원금 과목은 자동으로 입력됩니다.' },
  'income.receipt-yn':    { title: '증빙서첨부', description: '영수증 등 증빙서류의 첨부 여부를 체크합니다.' },
  'income.receipt-no':    { title: '증빙서번호', description: '증빙서류의 일련번호를 입력합니다. [영수증일괄입력]으로 일괄 부여할 수도 있습니다.' },
  'income.receipt-batch': { title: '영수증일괄입력', description: '증빙서 첨부(Y) + 번호 미입력 건에 대해 영수증 번호를 일괄 부여합니다.' },
  'income.book-print':    { title: '수입부', description: '전체 또는 계정별로 조회된 수입내역에 대한 수입부를 프린터 출력 또는 엑셀 다운로드합니다.' },
  'income.summary':       { title: '수입액/지출액/잔액', description: '현재 사용기관의 전체 수입액 합계, 지출액 합계, 잔액(수입-지출)을 표시합니다.' },

  // === 지출내역관리 ===
  'expense.exp-type':     { title: '지출유형', description: '(예비)후보자는 대분류→중분류→소분류를 필수로 선택합니다. 후원회는 선택하지 않습니다.' },
  'expense.pay-method':   { title: '지출방법', description: '계좌입금, 카드, 현금, 수표, 신용카드, 체크카드, 미지급, 기타 중 선택합니다.' },
  'expense.target':       { title: '지출대상자', description: '🔍 버튼으로 기존 등록된 수입지출처를 검색하거나, [지출대상자 등록]으로 새로 등록할 수 있습니다.' },
  'expense.detail':       { title: '지출상세내역', description: '지출에 대한 상세 설명을 입력합니다.' },
  'expense.receipt-gen':  { title: '영수증일괄생성', description: '증빙서첨부(Y)인 지출내역에 영수증 번호를 자동 생성하여 일괄 부여합니다.' },
  'expense.receipt-del':  { title: '영수증일괄제거', description: '모든 증빙서 번호를 제거합니다. 개별 등록한 영수증번호도 모두 제거됩니다. 이 작업은 복구할 수 없습니다.' },
  'expense.resolution':   { title: '지출결의서', description: '선택한 지출내역의 지출결의서를 엑셀 형태로 출력합니다.' },
  'expense.book-print':   { title: '지출부', description: '전체 또는 계정/과목별 지출부 내역을 프린터 출력 또는 엑셀 다운로드합니다.' },

  // === 수입지출처관리 ===
  'customer.type':        { title: '수입/지출처 구분', description: '개인, 사업자, 후원회, 중앙당, 시도당 등 수입지출 상대방의 유형을 선택합니다.' },
  'customer.name':        { title: '성명(명칭)', description: '수입/지출 상대방의 이름 또는 법인/단체명을 입력합니다.' },
  'customer.reg-num':     { title: '생년월일/사업자번호', description: '개인은 생년월일(YYYY-MM-DD), 사업자는 사업자등록번호를 입력합니다.' },
  'customer.addr-search': { title: '주소검색', description: '우편번호를 검색하여 주소를 자동 입력합니다. 상세주소는 직접 입력하세요.' },
  'customer.history':     { title: '이력관리', description: '주소, 전화번호 변경 이력을 확인할 수 있습니다.' },

  // === 사용기관관리 ===
  'organ.type':           { title: '사용기관 구분', description: '(예비)후보자, 후원회 등 사용기관의 유형을 선택합니다. 유형에 따라 사용 가능한 메뉴가 달라집니다.' },
  'organ.acc-period':     { title: '당해 회계기간', description: '회계보고 대상 기간입니다. 수입/지출 일자는 이 기간 내에서만 입력 가능합니다.' },
  'organ.pre-period':     { title: '이전 회계기간', description: '별도 수정이 필요하지 않습니다.' },
  'organ.password':       { title: '비밀번호', description: '최소 4자 이상입니다. 한/영/숫자/특수문자 모두 사용 가능하나, 느낌표(!)와 따옴표(\')는 사용할 수 없습니다.' },
  'organ.hint':           { title: '비밀번호확인질문/답변', description: '비밀번호 분실 시 찾기에 사용됩니다. 로그인을 위해 반드시 기재하세요.' },

  // === 재산내역관리 ===
  'estate.type':          { title: '재산구분', description: '토지, 건물, 주식/유가증권, 비품, 현금및예금, 그밖의재산, 차입금 중 선택합니다.' },
  'estate.amount':        { title: '가액', description: '재산의 금액입니다. 차입금은 (+) 금액으로 입력하면 자동으로 (-) 처리됩니다. 변제 시 (-) 금액을 입력합니다.' },

  // === 일괄등록 ===
  'batch.validate':       { title: '저장 전 자료확인', description: '엑셀파일에 오류가 없는지 점검합니다. 오류가 있으면 저장할 수 없으며, 오류 내용을 엑셀로 다운로드할 수 있습니다.' },
  'batch.template':       { title: '엑셀 양식', description: '일괄등록용 엑셀 양식을 다운로드합니다. 양식에 담긴 유의사항을 삭제하지 마세요.' },

  // === 보고관리 ===
  'report.prev-year':     { title: '전년도 자료', description: 'Check 시 사용기관관리에서 설정한 이전 회계기간 데이터가 포함됩니다.' },
  'report.cover':         { title: '표지선택', description: '수입/지출부 표지, 계정 표지, 과목 표지를 선택하여 출력합니다. 별도 안내가 없으면 모두 체크하세요.' },
  'report.batch-print':   { title: '보고서 일괄출력', description: '정치자금 수입지출 보고사항을 한번에 모두 출력합니다. (권장)' },
  'report.settlement':    { title: '결산', description: '해당 기간의 수입, 지출, 재산내역으로 결산을 수행합니다. 잔액과 재산(현금및예금) 금액이 다르면 경고가 나타납니다.' },
  'report.reimbursement': { title: '보전비용', description: '선거비용 보전 신청 대상 지출내역을 체크한 후 저장합니다. 저장한 내용은 로그아웃 이후에도 유지됩니다.' },

  // === 시스템관리 ===
  'system.backup':        { title: '백업', description: '현재 운영 데이터를 백업합니다. 로그인한 사용기관 자료만 백업됩니다.' },
  'system.restore':       { title: '복구', description: '백업 파일을 선택하여 복구합니다. 복구 시 운영DB의 모든 자료가 선택한 백업으로 변경됩니다. 다른 사용기관 자료를 선택하지 않도록 주의하세요.' },
  'system.reset':         { title: '자료초기화', description: '설정한 기간 범위의 수입/지출내역을 일괄 삭제합니다. 삭제된 자료는 복구할 수 없습니다. 로그인 비밀번호 확인이 필요합니다.' },
  'system.code-manage':   { title: '코드관리', description: '공통코드 버전 확인 및 엑셀파일로 코드를 등록합니다. 등록 후 로그아웃→재로그인해야 적용됩니다.' },

  // === 도움말 토글 ===
  'help.toggle':          { title: '도움말 ON/OFF', description: '모든 버튼과 입력란에 마우스를 올리면 사용법이 표시됩니다. 익숙해지면 끄세요.' },
};
```

#### 사용 예시
```tsx
// 수입내역관리 화면에서의 사용 예시
<HelpTooltip id="income.account">
  <CodeSelect csId={10} label="계정" value={accSecCd} onChange={setAccSecCd} />
</HelpTooltip>

<HelpTooltip id="income.amount">
  <AmountInput label="수입금액" value={amount} onChange={setAmount} />
</HelpTooltip>

<HelpTooltip id="btn.save">
  <Button onClick={handleSave}>저장</Button>
</HelpTooltip>

// 헤더의 도움말 토글 스위치
function HeaderHelpToggle() {
  const { isEnabled, toggle } = useHelpMode();
  return (
    <HelpTooltip id="help.toggle">
      <div className="flex items-center gap-2">
        <span className="text-sm">❓ 도움말</span>
        <Switch checked={isEnabled} onCheckedChange={toggle} />
      </div>
    </HelpTooltip>
  );
}
```

#### 도움말 데이터 관리 원칙
```
1. 모든 도움말 텍스트는 lib/help-texts.ts에 중앙 관리
2. 키 명명 규칙: "{화면}.{요소}" (예: income.account, btn.save)
3. 공통 버튼(btn.*)은 모든 화면에서 재사용
4. 화면별 도움말은 해당 화면 접두어 사용 (income.*, expense.*, customer.* 등)
5. 도움말 텍스트는 사용자 매뉴얼 기반으로 작성 (Help PDF 참조)
6. 향후 다국어 지원 시 i18n 키로 확장 가능
```

---

## 8. 데이터 흐름

### 8.1 수입내역 등록 흐름
```
사용자 입력
    │
    ▼
[프론트엔드 검증]
  - 필수 필드 체크
  - 금액 형식 체크
  - 날짜 범위 (회계기간 내) 체크
    │
    ▼
[API 호출] POST /api/accounts
    │
    ▼
[백엔드 검증]
  - ACC_REL 매트릭스 검증 (허용된 계정-과목 조합인지)
  - 후원금 한도 체크 (해당 시)
  - 수입지출처 존재 확인
    │
    ├── 경고 (한도 초과 등) → 확인 팝업 → 재요청
    │
    ▼
[Supabase DB 저장]
  - acc_book INSERT (supabase.from('acc_book').insert())
  - acc_book_bak INSERT (복구용 스냅샷)
  - acc_sort_num 자동 부여
  - RLS 정책이 org_id 기반 접근 제어 자동 적용
    │
    ▼
[응답] → 그리드 갱신 + 합계 갱신
```

### 8.2 백업/복구 흐름 (Supabase)
```
[백업]
사용자 → 백업 요청 → API Route 호출
  → Supabase에서 해당 org_id의 모든 테이블 데이터 SELECT
  → JSON으로 직렬화
  → Supabase Storage 'backups/' 버킷에 업로드
  → backup_history 테이블에 메타 정보 기록

[복구]
사용자 → 백업 목록에서 선택 → 확인 팝업
  → Supabase Storage에서 JSON 다운로드
  → Supabase RPC로 트랜잭션 실행:
     1) 해당 org_id의 기존 데이터 DELETE
     2) JSON 데이터 INSERT
  → 화면 새로고침
```

---

## 9. 보안 고려사항

| 항목 | 구현 방안 |
|------|---------|
| 인증 | Supabase Auth (이메일/비밀번호), JWT 자동 관리 |
| 세션 관리 | Supabase Auth 세션 (httpOnly 쿠키, @supabase/ssr) |
| 데이터 격리 (RLS) | Row Level Security 정책으로 org_id 기반 접근 제어 |
| 개인정보 마스킹 | 주민등록번호, 사업자번호 화면 표시 시 일부 마스킹 |
| SQL Injection 방지 | Supabase Client의 Parameterized Query 자동 적용 |
| API 키 보호 | ANON_KEY는 프론트엔드 노출 가능 (RLS가 보호), SERVICE_ROLE_KEY는 서버에서만 사용 |
| 자동 백업 | 로그아웃 시 API Route에서 백업 트리거 |

### 9.1 RLS (Row Level Security) 정책
```sql
-- 사용자가 자신이 속한 기관의 데이터만 접근 가능
-- auth.uid()로 현재 로그인 사용자 식별 → user_organ 매핑 테이블로 org_id 확인

-- 예시: acc_book 테이블 RLS
ALTER TABLE acc_book ENABLE ROW LEVEL SECURITY;

CREATE POLICY "사용기관별 데이터 접근"
ON acc_book FOR ALL
USING (
  org_id IN (
    SELECT org_id FROM user_organ
    WHERE user_id = auth.uid()
  )
);

-- 동일 패턴을 customer, estate, opinion, customer_addr 등에 적용
```

---

## 10. 구현 우선순위

### Phase 1: 기반 구축
1. 프로젝트 셋업 (Next.js 15 + Supabase + Tailwind + shadcn/ui)
2. Supabase PostgreSQL 스키마 생성 (부록 C DDL 실행)
3. 기존 SQLite 데이터 → Supabase 마이그레이션 스크립트 (2022년 실데이터)
4. Supabase Auth 설정 + RLS 정책 적용
5. 로그인/로그아웃 (Supabase Auth + user_organ 연결)
6. 코드 조회 (codeset/codevalue) + 계정관계(acc_rel) 로딩

### Phase 2: 기본자료관리
7. 사용기관관리 (CRUD + 회계기간 설정)
8. 수입지출처관리 (CRUD + 검색 + 주소이력)
9. 수입지출처 일괄등록 (엑셀 업로드)
10. 우편번호 검색 API 연동 (우정사업본부 OpenAPI)

### Phase 3: 핵심 회계기능
11. 수입내역관리 (CRUD + 검색 + 합계 + 수입제공자 검색 팝업)
12. 지출내역관리 (CRUD + 지출유형3단계 + 지출방법 + 지출대상자)
13. 복구 기능 (acc_book_bak, 세션 내 Undo)
14. 수입지출내역 일괄등록 (엑셀 업로드 + 오류 검증)
15. 재산내역관리 (CRUD + 차입금/변제)
16. 엑셀 템플릿 가져오기/내보내기 (계정-과목별 수입지출부)

### Phase 4: 보고서/출력
17. 계정-과목별 수입부/지출부 엑셀 출력 (7개 템플릿 기반)
18. 정치자금 수입지출보고서 엑셀 출력
19. 보고서 및 과목별 수입지출부 일괄출력 (ZIP)
20. 지출결의서 출력 (엑셀)
21. 재산명세서 출력
22. 감사의견서/심사의결서 출력 (후원회)
23. 후원금 기부자 조회 (1회 30만원/연간 300만원 초과)
24. 당비영수증 출력 (정당 전용)
25. 보전비용 출력 ((예비)후보자 전용)

### Phase 5: 시스템관리/고급기능
26. 자료 백업/복구 (JSON export → Supabase Storage)
27. SQLite .db 파일 내보내기 (선관위 제출용, sql.js WASM)
28. SQLite .db 파일 가져오기 (기존 백업 복원)
29. 결산작업, 취합작업 (정당 전용)
30. 자료초기화, 코드관리
31. 후원금 국세청 자료추출
23. 코드관리 (변경/배포)

---

## 11. SQLite → Supabase 마이그레이션

### 11.1 주의사항
1. **테이블명/컬럼명**: SQLite의 대문자 → PostgreSQL snake_case로 변환 (예: ACC_BOOK → acc_book)
2. **날짜 형식**: CHAR(8) ('20220428') → PostgreSQL DATE 타입 또는 CHAR(8) 유지 (기존 호환)
3. **금액**: NUMERIC(15,0) → BIGINT 또는 NUMERIC(15,0) 유지
4. **자동 증가 PK**: SQLite INTEGER PRIMARY KEY → PostgreSQL BIGINT GENERATED ALWAYS AS IDENTITY
5. **인코딩**: 기존 INI 파일이 EUC-KR → UTF-8 변환 필요
6. **비밀번호**: 기존 해시값은 Supabase Auth로 전환 (신규 사용자는 Supabase Auth 사용)
7. **TEMP 테이블**: 일괄등록용 임시 테이블은 Supabase에서 unlogged table 또는 임시 JSON으로 처리
8. **user_organ 매핑 테이블 추가**: Supabase Auth 사용자 ↔ organ 연결 (1:N, 한 사용자가 여러 기관 관리)

### 11.2 마이그레이션 스크립트 흐름
```
1. SQLite DB 읽기 (better-sqlite3 / Node.js 스크립트)
2. 각 테이블 데이터를 JSON으로 추출
3. 테이블명/컬럼명 snake_case 변환
4. Supabase에 PostgreSQL DDL 실행 (부록 C)
5. JSON 데이터를 Supabase INSERT (supabase.from().insert())
6. RLS 정책 적용
7. 검증: 레코드 수 비교
```

### 11.3 2022년 실제 선거 데이터 (Fund_Data_1.db)

> **중요**: 이 데이터는 제9회 전국동시지방선거(2022년) 당시 실제 사용된 회계 데이터이다.
> 프로그램이 v2.0(2022) → v2.6.1(2025)로 업데이트되어 스키마가 변경되었을 수 있으므로,
> 마이그레이션 시 **스키마 호환성 검증을 먼저 수행**한 뒤 데이터를 적재한다.

#### 데이터 요약
| 항목 | 내용 |
|------|------|
| **사용기관** | 오준석후보 (ORG_ID=1, (예비)후보자, 생년월일: 19850228) |
| **회계기간** | 2022-04-19 ~ 2022-06-21 |
| **수입지출처** | 26건 (개인 3건, 사업자 19건, (예비)후보자 1건, 후원회 1건, 시도당 1건, 익명 1건) |
| **수입내역** | 13건, 합계 17,699,055원 |
| **지출내역** | 28건, 합계 14,796,125원 |
| **잔액** | 2,902,930원 |
| **재산내역** | 1건 (현금및예금: 국민은행 2,902,930원) |
| **주소이력** | 22건 |

#### 수입 내역 상세 (계정/과목별 집계)
| 총괄 | 계정(ACC_SEC_CD) | 과목(ITEM_SEC_CD) | 금액 | 건수 |
|------|:---:|:---:|---:|---:|
| 수입 | 84 (후보자등자산) | 86 (선거비용) | 3,000,000 | 2 |
| 수입 | 84 (후보자등자산) | 87 (선거비용외정치자금) | 5,000,055 | 6 |
| 수입 | 82 (보조금) | 86 (선거비용) | 4,415,000 | 1 |
| 수입 | 85 (후원회기부금) | 86 (선거비용) | 3,948,700 | 3 |
| 수입 | 85 (후원회기부금) | 87 (선거비용외정치자금) | 1,335,300 | 1 |

#### 지출 내역 상세 (계정/과목별 집계)
| 총괄 | 계정(ACC_SEC_CD) | 과목(ITEM_SEC_CD) | 금액 | 건수 |
|------|:---:|:---:|---:|---:|
| 지출 | 84 (후보자등자산) | 86 (선거비용) | 99,325 | 2 |
| 지출 | 84 (후보자등자산) | 87 (선거비용외정치자금) | 4,997,800 | 4 |
| 지출 | 82 (보조금) | 86 (선거비용) | 4,415,000 | 7 |
| 지출 | 85 (후원회기부금) | 86 (선거비용) | 3,948,700 | 9 |
| 지출 | 85 (후원회기부금) | 87 (선거비용외정치자금) | 1,335,300 | 6 |

#### 검증 포인트
```
수입 합계: 17,699,055원
지출 합계: 14,796,125원
잔액:       2,902,930원 (= 수입 - 지출)
재산(현금및예금): 2,902,930원 (= 잔액과 일치해야 함)
```

#### 특이 데이터 (엣지케이스)
- **마이너스 수입**: ACC_BOOK_ID=48, 금액=-500,000 (계좌입금오류 반환처리)
- **보조금 수입→지출 대칭**: 보조금(82) 선거비용 수입 4,415,000 = 지출 4,415,000 (전액 사용)
- **예금이자 소액 수입**: ACC_BOOK_ID=42, 금액=55원
- **다양한 지출유형**: 인쇄물, 선거사무소, 소품, 전화메시지, 납부금, 예비후보자공약집 등

---

## 12. 파일 구조 참조 (기존 시스템)

```
중앙선거관리위원회_정치자금회계관리2/
├── Conf.ini                    # 선거명, 선거구명 설정
├── sqlite3.dll                 # SQLite 엔진
├── Data/                       # 운영 DB
│   ├── Fund_Master.db          # 마스터 (현재 사용)
│   ├── Fund_Data_1.db          # 제출용 복사본
│   └── Fund_Data_2.db          # 제출용 복사본
├── Backup/                     # 사용자 백업 (데이터)
├── Backup_Master/              # 사용자 백업 (마스터)
├── User/                       # 사용자별 INI 설정
│   └── {기관명}.ini            # 기관별 설정 (경로, 대표자, 비밀번호 등)
├── Excel/                      # 프로그램 내장 보고서 양식 (12개)
│   ├── 회계보고서.xls
│   ├── 지출결의서.xls
│   ├── 정치자금 수입지출보고서.xls
│   └── ... (12개 양식)
├── 엑셀파일/                    # ★ 계정-과목별 수입지출부 템플릿 (7개, 가져오기/내보내기용)
│   ├── 후보자산-선거비용.xlsx           # ACC_SEC=84, ITEM_SEC=86
│   ├── 후보자산-선거비용외.xlsx         # ACC_SEC=84, ITEM_SEC=87
│   ├── 기부금-선거비용.xlsx             # ACC_SEC=85, ITEM_SEC=86
│   ├── 기부금-선거비용외.xlsx           # ACC_SEC=85, ITEM_SEC=87
│   ├── 보조금-선거비용.xlsx             # ACC_SEC=82, ITEM_SEC=86
│   ├── 보조금-선거비용외.xlsx           # ACC_SEC=82, ITEM_SEC=87
│   └── 정치자금 수입지출보고서.xls      # 총괄 보고서
├── Help/                       # 도움말 PDF
│   ├── 정치자금회계관리프로그램 도움말.pdf
│   ├── 제9회_지방선거_사용자_매뉴얼_(예비)후보자_및_그_후원회용.pdf
│   └── (최종)제9회_전국동시지방선거_선거비용보전안내서.pdf
├── 후원회/                       # ★ 후원회 전용 자료 (일괄등록 템플릿, 보고문서 원본, 가이드북)
│   ├── 수입자일괄등록(회계관리프로그램).xlsx    # 기명후원금 일괄등록 양식 (16컬럼, 23건 실데이터)
│   ├── 익명수입자일괄등록(회계관리프로그램).xlsx # 익명후원금 일괄등록 양식 (16컬럼, 15건 실데이터)
│   ├── 감사의견.pdf                           # 감사의견서 작성 예시 (2022년 실데이터)
│   ├── 심사의결서.pdf                         # 심사의결서 작성 예시 (수입5,290,000/지출5,290,000/잔액0)
│   ├── 제출문서.pdf                           # 제출용 보고 문서 모음 (재산명세서, 수입지출총괄표, 수입부 등)
│   ├── 후원회등록서류(검수용).pdf              # 후원회 등록 신청서류 양식
│   └── 제9회_전국동시지방선거후원회설립가이드북(최종).pdf  # 후원회 설립/운영 전체 가이드
└── 자료전환/                    # 이전 버전 데이터 변환 도구
    ├── DataConv.exe
    └── Child/
```

---

## 부록 A: ORGAN 테이블 실제 데이터 예시

| 필드 | 값 |
|------|---|
| ORG_ID | 1 |
| ORG_SEC_CD | 90 ((예비)후보자) |
| ORG_NAME | 오준석후보 |
| REG_NUM | 19850228 |
| REG_DATE | 20220428 |
| POST | 02441 |
| ADDR | 서울특별시 동대문구 휘경로 14 (이문동) |
| ADDR_DETAIL | 2층 |
| TEL | 0260811700 |
| REP_NAME | 곽호준 |
| ACCT_NAME | 오준석 |
| COMM | 동대문구선거관리위원회 |
| USERID | ohjunsuk |
| ACC_FROM | 20220419 |
| ACC_TO | 20220621 |

## 부록 B: Excel 양식 파일 목록

| 파일명 | 용도 |
|--------|------|
| 회계보고서.xls | 회계보고서 출력 양식 |
| 회계보고서2.xls | 회계보고서 출력 양식 (대체) |
| 정치자금 수입지출보고서.xls | 수입지출보고서 양식 |
| 정당의 수입지출총괄표.xls | 정당용 총괄표 |
| 정당의 재산 및 수입지출총괄표.xls | 정당용 재산+총괄표 |
| 후원회의 수입지출총괄표.xls | 후원회용 총괄표 |
| 지출결의서.xls | 지출결의서 양식 |
| 감사의견서.xls | 감사의견서 양식 |
| 심사의결서.xls | 심사의결서 양식 |
| 국세청 자료추출.xls | 국세청 제출용 양식 |
| NEC리포트양식-결산작업.xlsx | 결산작업 양식 |
| NEC리포트양식-정당의 수입지출총괄표.xlsx | NEC 리포트 양식 |

## 부록 C: Supabase PostgreSQL DDL

```sql
-- ============================================================
-- 정치자금 회계관리 시스템 - Supabase PostgreSQL 스키마
-- SQLite → PostgreSQL 변환
-- ============================================================

-- 0. Supabase Auth 사용자 ↔ 사용기관 매핑
CREATE TABLE user_organ (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id BIGINT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, org_id)
);

-- 1. 코드분류 (CODESET)
CREATE TABLE codeset (
  cs_id INTEGER PRIMARY KEY,
  cs_name VARCHAR(30),
  cs_activeflag VARCHAR(5),
  cs_comment VARCHAR(255)
);

-- 2. 코드값 (CODEVALUE)
CREATE TABLE codevalue (
  cv_id INTEGER PRIMARY KEY,
  cs_id INTEGER NOT NULL REFERENCES codeset(cs_id),
  cv_name VARCHAR(30) NOT NULL,
  cv_order INTEGER NOT NULL,
  cv_comment VARCHAR(255),
  cv_etc VARCHAR(50),
  cv_etc2 VARCHAR(50),
  cv_etc3 VARCHAR(50),
  cv_etc4 VARCHAR(50),
  cv_etc5 VARCHAR(50),
  cv_etc6 VARCHAR(50),
  cv_etc7 VARCHAR(50),
  cv_etc8 VARCHAR(50),
  cv_etc9 VARCHAR(50),
  cv_etc10 VARCHAR(50)
);

-- 3. 사용기관 (ORGAN)
CREATE TABLE organ (
  org_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_sec_cd INTEGER NOT NULL REFERENCES codevalue(cv_id),
  org_name VARCHAR(100) NOT NULL,
  reg_num VARCHAR(13) NOT NULL,
  reg_date CHAR(8),
  post VARCHAR(6),
  addr VARCHAR(100),
  addr_detail VARCHAR(100),
  tel VARCHAR(20),
  fax VARCHAR(20),
  rep_name VARCHAR(50),
  acct_name VARCHAR(50),
  comm VARCHAR(50),
  userid VARCHAR(20),
  passwd VARCHAR(100),  -- Supabase Auth로 대체, 레거시 호환용
  hint1 VARCHAR(50),
  hint2 VARCHAR(50),
  org_order INTEGER,
  pre_acc_from CHAR(8),
  pre_acc_to CHAR(8),
  acc_from CHAR(8),
  acc_to CHAR(8),
  code_date CHAR(8)
);

-- user_organ FK 추가
ALTER TABLE user_organ
  ADD CONSTRAINT user_organ_fk_org FOREIGN KEY (org_id) REFERENCES organ(org_id);

-- 4. 수입지출처 (CUSTOMER)
CREATE TABLE customer (
  cust_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cust_sec_cd INTEGER NOT NULL REFERENCES codevalue(cv_id),
  reg_num VARCHAR(15),
  name VARCHAR(50),
  job VARCHAR(30),
  tel VARCHAR(20),
  sido INTEGER,
  post VARCHAR(7),
  addr VARCHAR(100),
  addr_detail VARCHAR(100),
  fax VARCHAR(20),
  bigo VARCHAR(50),
  reg_date VARCHAR(8),
  cust_order INTEGER
);

-- 5. 수입지출처 주소이력 (CUSTOMER_ADDR)
CREATE TABLE customer_addr (
  cust_id BIGINT NOT NULL REFERENCES customer(cust_id),
  cust_seq INTEGER NOT NULL,
  reg_date VARCHAR(8),
  tel VARCHAR(20),
  post VARCHAR(7),
  addr VARCHAR(100),
  addr_detail VARCHAR(100),
  PRIMARY KEY (cust_id, cust_seq)
);

-- 6. 계정관계 (ACC_REL)
CREATE TABLE acc_rel (
  acc_rel_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_sec_cd INTEGER NOT NULL REFERENCES codevalue(cv_id),
  incm_sec_cd INTEGER NOT NULL,
  acc_sec_cd INTEGER NOT NULL,
  item_sec_cd INTEGER NOT NULL,
  exp_sec_cd INTEGER NOT NULL,
  input_yn CHAR(1) NOT NULL,
  acc_order INTEGER NOT NULL
);

-- 7. 계정관계2 (ACC_REL2) - 확장용
CREATE TABLE acc_rel2 (
  acc_rel_id BIGINT NOT NULL PRIMARY KEY,
  org_sec_cd INTEGER NOT NULL REFERENCES codevalue(cv_id),
  incm_sec_cd INTEGER NOT NULL,
  acc_sec_cd INTEGER NOT NULL,
  item_sec_cd INTEGER NOT NULL,
  exp_sec_cd INTEGER NOT NULL,
  input_yn CHAR(1) NOT NULL,
  acc_order INTEGER NOT NULL
);

-- 8. 수입지출 회계장부 (ACC_BOOK) - 핵심 테이블
CREATE TABLE acc_book (
  acc_book_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL REFERENCES organ(org_id),
  incm_sec_cd INTEGER NOT NULL,      -- 1=수입, 2=지출
  acc_sec_cd INTEGER NOT NULL,        -- 계정구분
  item_sec_cd INTEGER NOT NULL,       -- 계정과목
  exp_sec_cd INTEGER NOT NULL,        -- 경비구분
  cust_id BIGINT NOT NULL REFERENCES customer(cust_id),
  acc_date CHAR(8) NOT NULL,          -- 거래일자 YYYYMMDD
  content VARCHAR(100) NOT NULL,      -- 내역
  acc_amt NUMERIC(15,0) NOT NULL,     -- 금액
  rcp_yn CHAR(1) NOT NULL,            -- 영수증 첨부 여부
  rcp_no VARCHAR(30),                 -- 증빙서번호
  rcp_no2 INTEGER DEFAULT 0,
  tel VARCHAR(20),
  post VARCHAR(7),
  addr VARCHAR(100),
  addr_detail VARCHAR(100),
  acc_sort_num INTEGER,               -- 정렬순서
  reg_date CHAR(8),
  acc_ins_type CHAR(2),               -- 지출방법 (계좌입금,카드,현금 등)
  acc_print_ok CHAR(1) DEFAULT 'N',
  bigo VARCHAR(100),
  bigo2 VARCHAR(100),
  return_yn CHAR(1) DEFAULT 'N',      -- 반환여부
  exp_type_cd INTEGER DEFAULT -1,     -- 지출유형
  exp_group1_cd VARCHAR(40),          -- 지출유형 대분류
  exp_group2_cd VARCHAR(40),          -- 지출유형 중분류
  exp_group3_cd VARCHAR(40)           -- 지출유형 소분류
);

-- 인덱스
CREATE INDEX idx_acc_book_org ON acc_book(org_id);
CREATE INDEX idx_acc_book_date ON acc_book(acc_date);
CREATE INDEX idx_acc_book_incm ON acc_book(incm_sec_cd);
CREATE INDEX idx_acc_book_org_date ON acc_book(org_id, acc_date);

-- 9. 회계장부 백업 (ACC_BOOK_BAK) - 복구(Undo)용
CREATE TABLE acc_book_bak (
  bak_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  work_kind INTEGER NOT NULL,         -- 작업종류 (수정/삭제)
  acc_book_id BIGINT NOT NULL,
  org_id BIGINT NOT NULL,
  incm_sec_cd INTEGER NOT NULL,
  acc_sec_cd INTEGER NOT NULL,
  item_sec_cd INTEGER NOT NULL,
  exp_sec_cd INTEGER NOT NULL,
  cust_id BIGINT NOT NULL,
  acc_date CHAR(8) NOT NULL,
  content VARCHAR(100) NOT NULL,
  acc_amt NUMERIC(15,0) NOT NULL,
  rcp_yn CHAR(1) NOT NULL,
  rcp_no VARCHAR(30),
  rcp_no2 INTEGER DEFAULT 0,
  tel VARCHAR(20),
  post VARCHAR(7),
  addr VARCHAR(100),
  addr_detail VARCHAR(100),
  acc_sort_num INTEGER,
  reg_date CHAR(8),
  acc_ins_type CHAR(2),
  acc_print_ok CHAR(1),
  bigo VARCHAR(100),
  bigo2 VARCHAR(100),
  return_yn CHAR(1),
  exp_type_cd INTEGER DEFAULT -1,
  exp_group1_cd VARCHAR(40),
  exp_group2_cd VARCHAR(40),
  exp_group3_cd VARCHAR(40)
);

-- 10. 전송이력 (ACCBOOKSEND)
CREATE TABLE accbooksend (
  acc_book_id BIGINT NOT NULL,
  send_date CHAR(8)
);

-- 11. 재산내역 (ESTATE)
CREATE TABLE estate (
  estate_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL REFERENCES organ(org_id),
  estate_sec_cd INTEGER NOT NULL REFERENCES codevalue(cv_id),
  kind VARCHAR(50) NOT NULL,
  qty INTEGER NOT NULL,
  content VARCHAR(100) NOT NULL,
  amt NUMERIC(15,0) NOT NULL,
  remark VARCHAR(100) NOT NULL,
  reg_date VARCHAR(8),
  estate_order INTEGER DEFAULT 0
);

-- 12. 감사의견서 (OPINION)
CREATE TABLE opinion (
  org_id BIGINT PRIMARY KEY REFERENCES organ(org_id),
  acc_from CHAR(8),
  acc_to CHAR(8),
  audit_from CHAR(8),
  audit_to CHAR(8),
  opinion VARCHAR(100),
  print_01 CHAR(8),
  position VARCHAR(50),
  addr VARCHAR(50),
  name VARCHAR(50),
  judge_from CHAR(8),
  judge_to CHAR(8),
  incm_from CHAR(8),
  incm_to CHAR(8),
  estate_amt NUMERIC(15,0),
  in_amt NUMERIC(15,0),
  cm_amt NUMERIC(15,0),
  balance_amt NUMERIC(15,0),
  print_02 CHAR(8),
  comm_desc VARCHAR(50),
  comm_name01 VARCHAR(50),
  comm_name02 VARCHAR(50),
  comm_name03 VARCHAR(50),
  comm_name04 VARCHAR(50),
  comm_name05 VARCHAR(50),
  acc_title VARCHAR(50),
  acc_docy CHAR(4),
  acc_docnum CHAR(4),
  acc_fdate CHAR(8),
  acc_comm VARCHAR(20),
  acc_torgnm VARCHAR(50),
  acc_borgnm VARCHAR(50),
  acc_repnm VARCHAR(20)
);

-- 13. 취합기관 (COL_ORGAN)
CREATE TABLE col_organ (
  org_id BIGINT PRIMARY KEY,
  org_sec_cd INTEGER NOT NULL REFERENCES codevalue(cv_id),
  org_name VARCHAR(50) NOT NULL
);

-- 14. 총괄보고서 (SUM_REPT)
CREATE TABLE sum_rept (
  sum_rept_id BIGINT PRIMARY KEY,
  org_id BIGINT,
  acc_sec_cd INTEGER REFERENCES codevalue(cv_id),
  org_sec_cd INTEGER,
  org_name VARCHAR(50),
  col_01 NUMERIC(15,0), col_02 NUMERIC(15,0), col_03 NUMERIC(15,0),
  col_04 NUMERIC(15,0), col_05 NUMERIC(15,0), col_06 NUMERIC(15,0),
  col_07 NUMERIC(15,0), col_08 NUMERIC(15,0), col_09 NUMERIC(15,0),
  col_10 NUMERIC(15,0), col_11 NUMERIC(15,0), col_12 NUMERIC(15,0),
  col_13 NUMERIC(15,0), col_14 NUMERIC(15,0), col_15 NUMERIC(15,0),
  col_16 NUMERIC(15,0), col_17 NUMERIC(15,0), col_18 NUMERIC(15,0),
  col_19 NUMERIC(15,0), col_20 NUMERIC(15,0), col_21 NUMERIC(15,0),
  col_22 NUMERIC(15,0), col_23 NUMERIC(15,0), col_24 NUMERIC(15,0),
  col_25 NUMERIC(15,0), col_26 NUMERIC(15,0), col_27 NUMERIC(15,0),
  col_28 NUMERIC(15,0), col_29 NUMERIC(15,0), col_30 NUMERIC(15,0),
  col_31 NUMERIC(15,0), col_32 NUMERIC(15,0), col_33 NUMERIC(15,0),
  status VARCHAR(1)
);

-- 15. 알림 (ALARM)
CREATE TABLE alarm (
  year CHAR(4),
  org_id BIGINT,
  type INTEGER,
  chk_yn CHAR(1),
  PRIMARY KEY (year, org_id, chk_yn)
);

-- 16. 백업 이력 (신규 - Supabase 환경용)
CREATE TABLE backup_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL REFERENCES organ(org_id),
  org_name VARCHAR(100),
  backup_type VARCHAR(20) NOT NULL,  -- 'manual', 'auto_logout', 'auto_exit'
  file_path TEXT NOT NULL,            -- Supabase Storage 경로
  file_size BIGINT,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- ============================================================
-- RLS 정책 (Row Level Security)
-- ============================================================

ALTER TABLE acc_book ENABLE ROW LEVEL SECURITY;
ALTER TABLE acc_book_bak ENABLE ROW LEVEL SECURITY;
ALTER TABLE estate ENABLE ROW LEVEL SECURITY;
ALTER TABLE opinion ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_history ENABLE ROW LEVEL SECURITY;

-- acc_book: 사용자가 속한 기관의 데이터만 접근
CREATE POLICY "acc_book_org_access" ON acc_book FOR ALL USING (
  org_id IN (SELECT org_id FROM user_organ WHERE user_id = auth.uid())
);

CREATE POLICY "acc_book_bak_org_access" ON acc_book_bak FOR ALL USING (
  org_id IN (SELECT org_id FROM user_organ WHERE user_id = auth.uid())
);

CREATE POLICY "estate_org_access" ON estate FOR ALL USING (
  org_id IN (SELECT org_id FROM user_organ WHERE user_id = auth.uid())
);

CREATE POLICY "opinion_org_access" ON opinion FOR ALL USING (
  org_id IN (SELECT org_id FROM user_organ WHERE user_id = auth.uid())
);

CREATE POLICY "backup_history_access" ON backup_history FOR ALL USING (
  org_id IN (SELECT org_id FROM user_organ WHERE user_id = auth.uid())
);

-- codeset, codevalue, acc_rel: 모든 인증 사용자 읽기 가능
ALTER TABLE codeset ENABLE ROW LEVEL SECURITY;
ALTER TABLE codevalue ENABLE ROW LEVEL SECURITY;
ALTER TABLE acc_rel ENABLE ROW LEVEL SECURITY;

CREATE POLICY "codeset_read" ON codeset FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "codevalue_read" ON codevalue FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "acc_rel_read" ON acc_rel FOR SELECT USING (auth.uid() IS NOT NULL);

-- organ: 자신이 속한 기관만 수정, 전체 목록은 조회 가능
ALTER TABLE organ ENABLE ROW LEVEL SECURITY;
CREATE POLICY "organ_read" ON organ FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "organ_write" ON organ FOR UPDATE USING (
  org_id IN (SELECT org_id FROM user_organ WHERE user_id = auth.uid())
);

-- customer: 모든 인증 사용자 접근 가능 (공유 자원)
ALTER TABLE customer ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customer_access" ON customer FOR ALL USING (auth.uid() IS NOT NULL);

-- ============================================================
-- 유용한 PostgreSQL Functions (Supabase RPC)
-- ============================================================

-- 수입/지출 잔액 계산 함수
CREATE OR REPLACE FUNCTION calculate_balance(
  p_org_id BIGINT,
  p_acc_sec_cd INTEGER DEFAULT NULL,
  p_date_from CHAR(8) DEFAULT NULL,
  p_date_to CHAR(8) DEFAULT NULL
)
RETURNS TABLE(income_total NUMERIC, expense_total NUMERIC, balance NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(CASE WHEN incm_sec_cd = 1 THEN acc_amt ELSE 0 END), 0) AS income_total,
    COALESCE(SUM(CASE WHEN incm_sec_cd = 2 THEN acc_amt ELSE 0 END), 0) AS expense_total,
    COALESCE(SUM(CASE WHEN incm_sec_cd = 1 THEN acc_amt ELSE -acc_amt END), 0) AS balance
  FROM acc_book
  WHERE org_id = p_org_id
    AND (p_acc_sec_cd IS NULL OR acc_sec_cd = p_acc_sec_cd)
    AND (p_date_from IS NULL OR acc_date >= p_date_from)
    AND (p_date_to IS NULL OR acc_date <= p_date_to);
END;
$$;

-- 백업 데이터 Export 함수
CREATE OR REPLACE FUNCTION export_org_data(p_org_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'organ', (SELECT to_jsonb(o) FROM organ o WHERE org_id = p_org_id),
    'acc_book', (SELECT jsonb_agg(to_jsonb(a)) FROM acc_book a WHERE org_id = p_org_id),
    'estate', (SELECT jsonb_agg(to_jsonb(e)) FROM estate e WHERE org_id = p_org_id),
    'opinion', (SELECT to_jsonb(op) FROM opinion op WHERE org_id = p_org_id),
    'exported_at', now()
  ) INTO result;
  RETURN result;
END;
$$;
```

## 부록 D: Supabase 프로젝트 초기 설정 체크리스트

| 단계 | 작업 | 상태 |
|------|------|------|
| 1 | Supabase Dashboard에서 위 DDL 실행 (SQL Editor) | |
| 2 | Auth → Settings → Email Auth 활성화 | |
| 3 | Storage → 'backups' 버킷 생성 (private) | |
| 4 | Storage → 'templates' 버킷 생성 (public) → Excel 양식 업로드 | |
| 5 | SQLite 마이그레이션 스크립트 실행 (codeset, codevalue, acc_rel 데이터) | |
| 6 | 기존 organ 데이터 마이그레이션 | |
| 7 | 테스트 사용자 생성 (Auth) + user_organ 매핑 | |
| 8 | RLS 정책 테스트 (다른 기관 데이터 접근 차단 확인) | |

---

## 부록 E: E2E 테스트 명세서

> 출처: 제9회 지방선거 정치자금 회계관리 프로그램 사용자 매뉴얼 (예비)후보자 및 그 후원회용
> 모든 테스트는 (예비)후보자 + 후원회 두 가지 사용기관 유형으로 수행한다.

**테스트 총 123건 요약:**

| 섹션 | 범위 | 건수 |
|------|------|:---:|
| E.1 인증/사용기관 등록 | TC-AUTH-001~008 | 8 |
| E.2 수입지출처 관리 | TC-CUST-001~011 | 11 |
| E.3 수입내역 관리 | TC-INC-001~016 | 16 |
| E.4 지출내역 관리 | TC-EXP-001~013 | 13 |
| E.5 수입지출내역 일괄등록 | TC-BATCH-001~006 | 6 |
| E.6 재산내역 관리 | TC-ASSET-001~005 | 5 |
| E.7 보고서 - (예비)후보자 | TC-RPT-C-001~004 | 4 |
| E.8 보고서 - 후원회 | TC-RPT-S-001~005 | 5 |
| E.9 지출결의서 | TC-RESOL-001 | 1 |
| E.10 시스템관리 | TC-SYS-001~005 | 5 |
| E.11 비즈니스 규칙 + 도움말 | TC-RULE-001~024 | 24 |
| E.12 전체 E2E 시나리오 | TC-E2E-001~003 | 3 |
| E.13 마이그레이션 (2022 실데이터) | TC-MIG-001~018 | 18 |
| E.14 엑셀 템플릿 입출력 | TC-XLS-001~017 | 17 |
| E.15 후원회 전용 기능 | TC-SUP-001~018 | 18 |
| E.17 신규 구현 기능 (2026-03-24) | TC-NEW-001~018 | 18 |
| | **합계** | **172** |

### E.1 인증 및 사용기관 등록

#### TC-AUTH-001: 사용기관 신규 등록 - (예비)후보자
```
전제조건: 로그인 전 상태 (사용자 인증 화면)
테스트 순서:
  1. [사용기관등록] 버튼 클릭
  2. 사용기관관리 화면에서 [신규입력] 클릭
  3. 필수 항목 입력:
     - 사용기관 구분: "(예비)후보자" 선택
     - 사용기관명: "박두산" 입력
     - 생년월일: "1975-07-07" 입력
     - 등록일자: "2026-02-25" 입력
     - 회계책임자: "김선거" 입력
     - 선거사무소명/관할위원회명 입력
     - 주소: 우편번호 검색으로 입력
     - 사용자ID: "nec1390" 입력
     - 비밀번호: 4자리 이상 입력
     - 비밀번호확인질문/답변 입력
     - 당해 회계기간: 2026-02-25 ~ 2026-12-31
  4. [저장] 클릭
  5. [종료] 클릭
기대결과:
  - 사용자 인증 화면에 "박두산" 기관명 표시
  - 해당 ID/비밀번호로 로그인 가능
  - 비밀번호는 최소 4자 이상 (한,영,숫자,특수문자 무관)
  - 느낌표(!), 따옴표(') 는 사용불가
```

#### TC-AUTH-002: 사용기관 신규 등록 - 후원회
```
전제조건: 로그인 전 상태
테스트 순서:
  1. [사용기관등록] 클릭 → [신규입력]
  2. 사용기관 구분: "(예비)후보자후원회" 선택
  3. 사용기관명: 후원회명 입력
  4. 사업자번호 입력
  5. 나머지 필수 항목 입력 후 [저장]
기대결과:
  - 후원회 전용 메뉴 (후원금 기부자 조회, 감사의견서 등) 활성화 확인
  - (예비)후보자 전용 메뉴 (보전비용 등) 비활성화 확인
```

#### TC-AUTH-003: 동일 프로그램에서 다중 사용기관 추가
```
전제조건: 이미 1개 사용기관이 등록된 상태
테스트 순서:
  1. 사용자 인증 화면에서 [사용기관등록] 클릭
  2. 반드시 [신규입력] 먼저 클릭
  3. 새로운 사용기관(후원회 등) 정보 입력 후 [저장]
기대결과:
  - 사용자 인증 화면 목록에 2개 기관 표시
  - 각 기관별 별도 ID/비밀번호로 로그인 가능
```

#### TC-AUTH-004: 로그인 성공
```
전제조건: 사용기관 등록 완료
테스트 순서:
  1. 사용자 인증 화면에서 아이디 입력
  2. 비밀번호 입력
  3. [로그인] 클릭
기대결과:
  - 메인 화면 진입
  - 사용기관 유형에 맞는 메뉴 표시
  - (예비)후보자: 시스템관리, 기본자료관리, 정치자금관리, 보고관리, 도움말
  - 후원회: 위 + 후원금 기부자 조회, 감사의견서 등 출력 메뉴 추가
```

#### TC-AUTH-005: 로그인 실패 - 잘못된 비밀번호
```
테스트 순서:
  1. 올바른 아이디 + 잘못된 비밀번호 입력
  2. [로그인] 클릭
기대결과:
  - 오류 메시지 표시
  - 메인 화면 진입 불가
```

#### TC-AUTH-006: 비밀번호 찾기
```
테스트 순서:
  1. [비밀번호 찾기] 클릭
  2. 등록 시 설정한 질문에 대한 답변 입력
기대결과:
  - 답변 일치 시 비밀번호 초기화 가능
  - 답변 불일치 시 오류 메시지
```

#### TC-AUTH-007: 사용기관 정보 수정
```
전제조건: 로그인 완료
테스트 순서:
  1. 기본자료관리 → 사용기관관리
  2. 회계책임자, 주소, 전화번호 등 수정
  3. [저장] → 로그아웃 → 재로그인
기대결과:
  - 수정사항 반영을 위해 로그아웃 후 재로그인 필요
  - 이전 회계기간은 별도 수정 불요
```

#### TC-AUTH-008: 사용기관 삭제 제약
```
전제조건: 수입/지출 내역이 존재하는 사용기관
테스트 순서:
  1. 해당 사용기관 삭제 시도
기대결과:
  - 수입/지출 내역이 등록된 사용기관은 삭제 불가 메시지 표시
```

---

### E.2 수입지출처 관리

#### TC-CUST-001: 수입지출처 신규 등록
```
전제조건: 로그인 완료
테스트 순서:
  1. 기본자료관리 → 수입지출처관리 (또는 메인 아이콘 클릭)
  2. 메뉴 접속 시 기본적으로 신규자료 입력 기능 제공
  3. 구분 선택 (개인/사업자/(예비)후보자 등)
  4. 성명(명칭) 입력
  5. 생년월일/사업자번호 입력
  6. 직업, 지역(시도), 주소, 전화번호 입력
     - 인터넷 연결 시 우편번호 검색 가능
  7. [저장] 클릭
기대결과:
  - 조회화면(그리드)에 수입지출처 등록됨
  - 같은 구분 + 성명 + 생년월일 중복 등록 불가
```

#### TC-CUST-002: 수입지출처 수정 - 성명/생년월일
```
전제조건: 수입지출처 1건 이상 등록
테스트 순서:
  1. 조회 화면에서 수정할 수입지출처 선택 (파란색으로 변함)
  2. 성명, 사업자번호 등 항목 수정
  3. [저장] 클릭 → 수정확인 메시지 확인
기대결과:
  - 수정된 내용 반영
  - 해당 수입지출처로 등록된 수입/지출내역도 수정된 내용으로 자동 변경
```

#### TC-CUST-003: 수입지출처 수정 - 주소/전화번호 (이력관리)
```
테스트 순서:
  1. 조회 화면에서 수입지출처 선택
  2. [수정] 버튼 클릭
  3. 주소, 전화번호 변경 후 [저장] → 수정확인 메시지
기대결과:
  - 최종 등록정보는 이력 관리 화면에서 확인 가능
  - 이전 주소/전화번호 이력 보존 (customer_addr 테이블)
```

#### TC-CUST-004: 수입지출처 삭제 - 성공
```
테스트 순서:
  1. 수입/지출 내역이 없는 수입지출처 선택
  2. [삭제] 클릭
기대결과:
  - 정상 삭제
```

#### TC-CUST-005: 수입지출처 삭제 - 실패 (내역 존재)
```
테스트 순서:
  1. 수입 또는 지출내역이 등록된 수입지출처 선택
  2. [삭제] 클릭
기대결과:
  - "수입 또는 지출내역이 등록된 수입지출처는 삭제 불가" 메시지
```

#### TC-CUST-006: 수입지출처 조회 정렬
```
테스트 순서:
  1. 조회 화면 제목줄 항목별 클릭
기대결과:
  - 오름차순/내림차순으로 정렬 전환
```

#### TC-CUST-007: 수입지출처 엑셀 다운로드
```
테스트 순서:
  1. [엑셀] 버튼 클릭
기대결과:
  - 수입지출처 자료를 엑셀파일로 다운로드
```

#### TC-CUST-008: 수입지출처 일괄등록 - 성공
```
테스트 순서:
  1. 기본자료관리 → 수입지출처 일괄등록
  2. 엑셀 파일 선택 (돋보기 아이콘)
  3. [저장 전 자료확인] 클릭 → 오류 없음 확인
  4. [저장] 클릭
기대결과:
  - 신규 수입지출처 자료 등록
  - 기 등록된 수입지출처는 엑셀파일 내용으로 수정
```

#### TC-CUST-009: 수입지출처 일괄등록 - 오류 처리
```
테스트 순서:
  1. 필수항목 누락 또는 형식 오류가 있는 엑셀 파일 선택
  2. [저장 전 자료확인] 클릭
기대결과:
  - 오류 내용 표시 (번호, 오류내용, 구분, 수입지출대상자, 생년월일, 전화번호)
  - 오류 자료가 있는 경우 [저장] 불가
  - 오류 내용을 [엑셀] 파일로 다운로드 가능
  - 한 건이라도 오류가 있으면 일괄등록 불가
```

#### TC-CUST-010: 수입지출처 일괄등록 - 삭제 기능
```
테스트 순서:
  1. 일괄등록 후 조회한 자료에서 한 건 [삭제]
  2. 조회한 모든 자료를 [일괄삭제]
기대결과:
  - 단건/일괄 삭제 정상 동작
  - 수입/지출 내역이 등록된 수입지출처는 삭제 불가
```

#### TC-CUST-011: 다중 사용기관 간 수입지출처 공유
```
전제조건: 사용기관 2개 이상 등록
테스트 순서:
  1. 사용기관A에서 수입지출처 엑셀 다운로드
  2. 새로운 사용기관B 등록 후 로그인
  3. 수입지출처 일괄등록으로 엑셀 업로드
기대결과:
  - 다른 사용기관의 수입지출처 자료를 일괄등록으로 공유 가능
  - 엑셀 다운로드 시 제목과 번호(노란색 부분) 지우고 일괄등록
```

---

### E.3 수입내역 관리

#### TC-INC-001: 수입내역 신규 등록 - (예비)후보자
```
전제조건: 로그인((예비)후보자), 수입지출처 등록 완료
테스트 순서:
  1. 정치자금관리 → 수입내역관리 (메뉴 또는 아이콘)
  2. 메뉴 접속 시 기본적으로 신규입력 기능 제공
  3. 기존자료 수정/조회 중 새 자료 입력 시 [신규입력] 클릭
  4. 입력 항목:
     - 계정: "후보자등자산" 선택
     - 과목: "선거비용" 선택
     - 수입일자: 회계기간 내 날짜 입력
     - 수입금액: 5,000,000 입력
     - 수입제공자: 🔍 버튼으로 기존 등록 수입지출처 검색/선택
     - 수입내역: "선거비용" 입력
     - 증빙서첨부: 체크
     - 증빙서번호 입력
  5. [저장] 클릭
기대결과:
  - 하단 정보목록(그리드)에 수입내역 등록
  - 우측 상단: 수입액 합계, 지출액 합계, 잔액 갱신
  - (예비)후보자 계정: 후보자등자산, 후원회기부금, 보조금, 보조금외지원금
  - (예비)후보자 과목: 선거비용, 선거비용외정치자금
```

#### TC-INC-002: 수입내역 신규 등록 - 후원회
```
전제조건: 로그인(후원회)
테스트 순서:
  1. 수입내역관리 진입
  2. 입력 항목:
     - 계정: "수입" (후원회는 계정 '수입' 고정)
     - 과목: "기명후원금" 선택
     - 수입일자, 수입금액, 수입제공자 입력
     - 수입내역: "기명후원금" (과목이 당비/기명후원금/익명후원금이면 자동출력)
  3. [저장] 클릭
기대결과:
  - 후원회 계정: 수입
  - 후원회 과목: 전년도이월, 기명후원금, 익명후원금, 그 밖의 수입
```

#### TC-INC-003: 수입제공자 검색 및 선택 (기존 등록)
```
테스트 순서:
  1. 수입제공자 🔍 버튼 클릭
  2. 입력한 수입제공자가 1건 → 화면에 바로 조회
  3. 여러 건일 경우 → 검색 팝업 나타남
  4. 화살표 ↑↓로 이동 가능
  5. 선택방법: Enter Key, 마우스 클릭+[선택], 마우스 더블클릭
기대결과:
  - 선택한 수입지출처 정보 자동 입력
  - 구분이나 수입지출처명 입력 후 [조회]로 재검색 가능
```

#### TC-INC-004: 수입제공자 신규 등록 (팝업)
```
테스트 순서:
  1. 수입제공자에 미등록 이름 입력
  2. 등록을 유도하는 팝업 표시
  3. [수입제공자 등록] 버튼 클릭 → 수입지출처 관리 팝업
  4. 정보 입력 후 등록
기대결과:
  - 팝업에서 수입지출처 등록 후 자동 선택
```

#### TC-INC-005: 후원금 반환 처리 - 후원회
```
전제조건: 기명후원금 수입내역 존재
테스트 순서:
  1. 기명후원금 과목 선택
  2. 수입금액에 마이너스(-) 금액 입력 (예: -2,000,000)
  3. 수입제공자: 반드시 기존 등록된 수입제공자를 조회하여 선택
  4. 수입내역에 "후원금 반환(후원한 일자)" 등 입력
  5. [저장]
기대결과:
  - 팝업: "당해년도 후원금은 감 처리, 지난해 후원금은 그밖의 경비에서 지출처리하시기 바랍니다. 계속 저장하시겠습니까?" → [예]
  - 반환자료(마이너스 금액) 정상 등록
  - 주의: 생년월일 등 인적사항이 다르면 동명이인으로 처리되어 반환내역 미반영
```

#### TC-INC-006: 수입내역 수정
```
테스트 순서:
  1. 조회된 화면에서 수정할 수입내역 항목 선택 (파란색)
  2. 상단 항목에서 내역 수정 (계정, 과목, 수입일자, 수입금액, 수입내역, 수입제공자 등 모두 수정 가능)
  3. [저장] 클릭
기대결과:
  - 조회 화면에서 최종적으로 수정된 수입내역 확인
```

#### TC-INC-007: 수입내역 단건 삭제
```
테스트 순서:
  1. 수입내역 항목 선택
  2. [삭제] 클릭
기대결과:
  - 해당 내역 삭제
```

#### TC-INC-008: 수입내역 다중 삭제
```
테스트 순서:
  1. 다중선택 체크박스(□) 활성화
  2. 삭제할 여러 수입내역 체크
  3. [삭제] 클릭
기대결과:
  - 체크한 여러 건 한꺼번에 삭제
```

#### TC-INC-009: 수입내역 복구 (Undo)
```
테스트 순서:
  1. 수입내역 수정 또는 삭제 수행
  2. [복구] 버튼 클릭
기대결과:
  - 수정/삭제하기 전 상태로 되돌림
  - 복구 가능 대상: 단 건 수정 및 삭제, 다중 삭제, 영수증일괄입력 처리 건
  - 복구 불가 대상: 자료초기화에서 삭제한 자료, 수입지출내역 일괄등록에서 삭제한 자료
  - 유의사항: 로그인하는 동안 수정/삭제한 자료만 복구 가능 (로그아웃 후 불가)
```

#### TC-INC-010: 수입내역 조회 (검색)
```
테스트 순서:
  1. 상단 조회 조건 입력:
     - 계정, 과목 선택
     - 수입일자 범위 설정
     - 수입금액 범위 설정
     - 수입제공자 검색 (일부 값 입력해도 Like 검색)
     - 수입내역, 증빙서번호, 비고: 일부 값만 입력해도 검색
  2. [조회] 클릭
기대결과:
  - 조건에 맞는 수입내역 조회
  - 수입일자From이 1/1일이 아니면 첫 행에 '누계액' 표시
```

#### TC-INC-011: 화면초기화
```
테스트 순서:
  1. 각종 조회 조건 입력한 상태에서 [화면초기화] 클릭
기대결과:
  - 각 항목에 입력한 값을 지운 상태, 즉 기존의 조회 기능 화면으로 되돌아감
```

#### TC-INC-012: 수입내역 정렬저장
```
테스트 순서:
  1. 같은 수입일자 내의 수입내역 항목 선택
  2. 드래그 앤 드롭으로 위치 변경
  3. [정렬저장] 클릭
기대결과:
  - 변경된 순서대로 수입내역 확정
  - 같은 수입일자 내 자료의 순서만 변경 가능
  - 활용: 같은 일자의 통장 계좌거래 내역 순서와 동일하게 맞추기
```

#### TC-INC-013: 영수증일괄입력 (수입)
```
테스트 순서:
  1. [영수증일괄입력] 버튼 클릭 → 해당 수입건 선택 (파란색 표시)
  2. 증빙번호 칸을 클릭하여 수기로 하나 또는 여러 개를 입력
  3. [영수증일괄입력 저장] 클릭
기대결과:
  - 선택한 수입내역의 증빙서번호 일괄 저장
```

#### TC-INC-014: 수입부 출력
```
테스트 순서:
  1. [수입부] 버튼 클릭
  2. 수입부 출력 팝업 확인
  3. [수입부출력] 클릭 → 프린터 출력
  4. [수입부엑셀] 클릭 → 엑셀 다운로드
기대결과:
  - 전체 또는 각 계정별로 조회된 수입내역에 대한 수입부 출력/다운로드
  - 당비, 기명후원금 일자별합산 체크 시: 일자별 합산 목록
```

#### TC-INC-015: 수입액/지출액/잔액 합계 표시
```
테스트 순서:
  1. 수입내역관리 화면 진입
기대결과:
  - 화면 우측 상단에 수입액 합계, 지출액 합계, 잔액 표시
  - (예비)후보자: 계정 및 과목의 수입금액 합계, 지출금액 합계, 잔액
  - 후원회: 계정의 수입금액 합계, 지출금액 합계, 잔액
  - 지출액이 수입액보다 많을 수 없으므로 과목간 수입액 조정 필요 시 안내
```

#### TC-INC-016: 후원내역엑셀 (후원회 전용)
```
전제조건: 후원회 로그인, 기명후원금 과목 조회
테스트 순서:
  1. 과목이 '기명후원금'인 경우에만 [후원내역엑셀] 버튼 활성화
  2. 클릭 → 엑셀 다운로드
기대결과:
  - 후원금센터 업로드용 엑셀파일 다운로드
  - 직업분류 항목은 수기로 작성하여 등록
```

---

### E.4 지출내역 관리

#### TC-EXP-001: 지출내역 신규 등록 - (예비)후보자
```
전제조건: 로그인((예비)후보자)
테스트 순서:
  1. 정치자금관리 → 지출내역관리
  2. 메뉴 접속 시 기본적으로 신규자료 입력 기능 제공
  3. 입력 항목:
     - 계정: "후보자등자산" 선택
     - 과목: "선거비용" 선택
     - 지출일자 입력
     - 지출유형: 대분류 → 중분류 → 소분류 선택 (필수)
       예) 인쇄물 → 인쇄비 → 선거벽보/기획/도안료
     - 지출상세내역: "후보자 선거운동 명함 인쇄" 입력
     - 지출금액: 500,000 입력
     - 지출방법: "계좌입금" 선택
     - 지출대상자: 🔍로 검색/선택 또는 [지출대상자 등록]으로 신규 등록
     - 증빙서첨부, 증빙서번호 입력
  4. [저장]
기대결과:
  - 지출내역 등록, 잔액 갱신
  - (예비)후보자 계정: 후보자등자산, 후원회기부금, 보조금, 보조금외지원금
  - (예비)후보자 과목: 선거비용, 선거비용외정치자금
  - 선거비용/선거비용외정치자금 구분은 지출유형(대,중,소)으로 확인
```

#### TC-EXP-002: 지출내역 신규 등록 - 후원회
```
전제조건: 로그인(후원회)
테스트 순서:
  1. 지출내역관리 진입
  2. 입력:
     - 계정: "지출" (후원회는 '지출' 고정)
     - 과목: "기부금" 선택
     - 지출유형: 선택하지 않음 (후원회는 지출유형 미선택)
     - 나머지 항목 입력
  3. [저장]
기대결과:
  - 후원회 계정: 지출
  - 후원회 과목: 기부금, 후원금모금경비, 인건비, 사무소설치운영비, 그 밖의 경비
  - 지출유형의 각 탭은 선택하지 않음
```

#### TC-EXP-003: 지출대상자 입력 (기존 등록)
```
테스트 순서:
  1. 지출대상자 🔍 클릭
  2. 1건이면 바로 조회, 여러건이면 검색 팝업
  3. 선택 (Enter/클릭+선택/더블클릭)
기대결과:
  - 지출대상자 정보 자동 입력
  - 구분이나 수입지출처명 입력 후 [조회]로 재검색 가능
```

#### TC-EXP-004: 지출대상자 신규 등록 (팝업)
```
테스트 순서:
  1. [지출대상자 등록] 클릭 → 수입지출처 관리 팝업
  2. 정보 입력 후 등록
기대결과:
  - 팝업에서 등록 후 지출대상자로 자동 선택
```

#### TC-EXP-005: 지출내역 수정
```
테스트 순서:
  1. 조회 화면에서 수정할 지출내역 선택 (파란색)
  2. 항목 수정 (계정, 과목, 지출일자, 지출유형, 지출금액, 지출대상자 등 모두 수정 가능)
  3. [저장]
기대결과:
  - 수정된 지출내역 반영
```

#### TC-EXP-006: 지출내역 다중 삭제
```
테스트 순서:
  1. 다중선택 체크박스 활성화
  2. 삭제할 여러 지출내역 체크
  3. [삭제]
기대결과:
  - 체크한 여러 건 한꺼번에 삭제
```

#### TC-EXP-007: 지출내역 정렬저장
```
테스트 순서:
  1. 같은 지출일자 내의 지출내역 항목 드래그 앤 드롭
  2. [정렬저장] 클릭
기대결과:
  - 변경된 순서 확정
  - 같은 지출일자 내 자료 순서만 변경 가능
```

#### TC-EXP-008: 영수증 일괄생성 (지출)
```
테스트 순서:
  1. [영수증일괄생성] 버튼 클릭
기대결과:
  - 증빙서첨부(Y)로 체크한 지출내역에 대해 영수증 번호 자동 생성하여 일괄 부여 및 저장
```

#### TC-EXP-009: 영수증 일괄제거 (지출)
```
테스트 순서:
  1. [영수증일괄제거] 버튼 클릭
기대결과:
  - 정보목록 내 증빙서 번호 모두 제거되고 자동 저장
  - 개별 등록한 영수증번호도 모두 제거
  - 지출내역 복구 시 영수증일괄생성 또는 제거 처리: 복구 불가
```

#### TC-EXP-010: 지출내역 복구 (Undo)
```
테스트 순서:
  1. 지출내역 수정/삭제 후 [복구] 클릭
기대결과:
  - 이전 상태로 되돌림
  - 복구 가능: 단건 수정/삭제, 다중 삭제
  - 복구 불가: 영수증일괄생성 또는 제거, 자료초기화 삭제, 일괄등록 삭제
  - 로그인 세션 내에서만 복구 가능
```

#### TC-EXP-011: 지출부 출력
```
테스트 순서:
  1. [지출부] 버튼 클릭
  2. 지출부 출력 팝업 → [지출부출력] 또는 [지출부엑셀]
기대결과:
  - 전체 또는 계정/과목별 지출부 내역 프린터/엑셀 출력
```

#### TC-EXP-012: 지출결의서 출력 (지출내역관리 화면)
```
테스트 순서:
  1. [지출결의서] 버튼 클릭
  2. 지출결의서 출력 팝업 → 엑셀 형태로 출력
기대결과:
  - 하나 또는 여러 지출 건의 지출결의서를 엑셀 출력
```

#### TC-EXP-013: 지출액이 수입액 초과 불가 검증
```
테스트 순서:
  1. 특정 계정/과목의 수입액이 500만원인 상태에서
  2. 같은 계정/과목으로 600만원 지출 시도
기대결과:
  - 계정별/과목별로 지출액이 수입액보다 많을 수 없다는 경고 또는 제한
  - 필요시 과목간 수입액을 조정하여 수정
```

---

### E.5 수입지출내역 일괄등록

#### TC-BATCH-001: 수입내역 일괄등록 - 성공
```
테스트 순서:
  1. 정치자금관리 → 수입지출내역 일괄등록
  2. [수입내역] 탭 선택
  3. 일괄등록일자 설정
  4. [엑셀] 파일 찾기 (돋보기) → 수입내역 엑셀 선택
  5. [저장 전 자료확인] 클릭 → 오류 없음 확인
  6. [저장] 클릭
기대결과:
  - 수입내역 일괄 등록 완료
  - 수입지출처도 같이 일괄등록되므로 별도 등록 불필요
  - 엑셀파일 작성 시 유의사항 준수 필요
```

#### TC-BATCH-002: 지출내역 일괄등록 - 성공
```
테스트 순서:
  1. [지출내역] 탭 선택
  2. 동일 흐름으로 엑셀 선택 → 자료확인 → 저장
기대결과:
  - 지출내역 일괄 등록 완료
```

#### TC-BATCH-003: 일괄등록 - 오류 처리
```
테스트 순서:
  1. 필수입력항목 누락, 데이터형식 오류, 결과값 오류 등이 있는 엑셀 파일
  2. [저장 전 자료확인] 클릭
기대결과:
  - 오류건수 표시, 오류 내용 표시
  - 오류 자료가 있으면 [저장] 불가
  - [엑셀] 버튼으로 오류 내용 엑셀 다운로드 가능
  - 오류가 없어야 일괄등록 가능
```

#### TC-BATCH-004: 일괄등록 - 돋보기 조회
```
테스트 순서:
  1. 일괄등록일자 입력하고 돋보기 클릭
기대결과:
  - 일괄등록한 자료 조회 가능
```

#### TC-BATCH-005: 일괄등록 - 삭제/일괄삭제
```
테스트 순서:
  1. 수입 또는 지출내역 탭에서 자료 선택 후 [삭제]
  2. [일괄삭제] 클릭 시 조회목록 내 모든 자료 삭제
기대결과:
  - 단건/일괄 삭제 동작
```

#### TC-BATCH-006: 일괄등록 양식 다운로드
```
테스트 순서:
  1. [엑셀] 버튼 클릭 (자료 없는 상태)
기대결과:
  - 일괄등록 양식의 엑셀파일 다운로드 가능
  - 양식에 담긴 유의사항을 삭제하지 말아야 함 (삭제 시 업로드 오류)
```

---

### E.6 재산내역 관리

#### TC-ASSET-001: 재산내역 신규 등록
```
테스트 순서:
  1. 보고관리 → 재산내역관리
  2. [신규입력] 클릭
  3. 재산구분 선택: 토지/건물/주식또는유가증권/비품/현금및예금/그밖의재산/차입금
  4. 재산종류, 수량, 단위, 내용, 가액, 비고 입력
  5. [저장]
기대결과:
  - 재산내역 등록, 합계수량/합계금액 갱신
```

#### TC-ASSET-002: 재산내역 - 차입금 등록
```
테스트 순서:
  1. 재산구분: "차입금" 선택
  2. (+) 금액 입력, 비고에 차입일자/차입내용/금액 기재
기대결과:
  - 차입 시 프로그램에서 자동으로 (-) 처리되어 재산명세서 등에 반영
```

#### TC-ASSET-003: 재산내역 - 차입금 변제
```
테스트 순서:
  1. 재산구분: "차입금"
  2. (-) 금액 입력, 비고에 변제일자/변제내용/금액 기재
기대결과:
  - 변제(마이너스) 정상 등록
```

#### TC-ASSET-004: 재산내역 수정/삭제
```
테스트 순서:
  1. 기존 재산내역 선택 → 수정 → [저장]
  2. 기존 재산내역 선택 → [삭제]
  3. 여러 건 선택 → [일괄삭제]
기대결과:
  - 수정/삭제/일괄삭제 정상 동작
```

#### TC-ASSET-005: 재산명세서 출력
```
테스트 순서:
  1. 보고관리 → 재산명세서
  2. 전체 재산내역 탭: 구분별 소계 및 합계 확인
  3. 개별 재산내역 탭 (토지/건물/주식 등): 상세내역 확인
  4. [재산명세서출력] 또는 [세부내역출력] 클릭
기대결과:
  - 전체 재산내역 또는 개별 세부재산내역 출력 가능
  - 기준연월일/작성연월일 설정 가능
```

---

### E.7 보고서 및 수입지출부 출력 - (예비)후보자

#### TC-RPT-C-001: 정치자금 수입지출보고서 출력
```
전제조건: (예비)후보자 로그인, 수입/지출 데이터 존재
테스트 순서:
  1. 보고관리 → 정치자금 수입지출 보고서
  2. 전년도 자금 체크/미체크, 기간 설정, 작성연월일 입력
  3. 선거명, 선거구명 직접 입력
  4. [조회] → [출력] 또는 [엑셀]
기대결과:
  - 구분별(자산/후원회기부금/보조금/보조금외지원금) 수입, 지출(선거비용/선거비용외), 잔액 표시
  - 출력 및 엑셀 다운로드 가능
```

#### TC-RPT-C-002: 정치자금 수입지출부 출력
```
테스트 순서:
  1. 보고관리 → 정치자금 수입지출부
  2. 계정 및 과목 선택
  3. [조회] → [출력] 또는 [엑셀]
기대결과:
  - 계정/과목별로 수입지출부 조회
  - 일자별 금회/누계, 지출액 금회/누계, 잔액 표시
```

#### TC-RPT-C-003: 보고서 및 과목별 수입지출부 일괄출력
```
테스트 순서:
  1. 보고관리 → 보고서 및 과목별 수입지출부 출력
  2. 수입/지출 기간, 기준연월일, 작성연월일 확인
  3. 표지선택: 수입/지출부 표지, 계정 표지, 과목 표지 체크
  4. 선거명, 선거구명, 정치자금 등 직접 입력
  5. [보고서 일괄출력] 클릭
기대결과:
  - 정치자금 수입지출 보고사항 일괄 출력 (권장 기능)
  - 표지별 개별출력도 가능
  - 계정 및 과목 선택 화면에서 선택하여 개별 출력도 가능
```

#### TC-RPT-C-004: 정치자금 수입지출부 보전비용 출력
```
전제조건: (예비)후보자 로그인
테스트 순서:
  1. 보고관리 → 정치자금 수입지출부 보전비용
  2. 기간 설정, 계정/과목 선택
  3. [조회] → 선거비용 과목 지출내역 표출
  4. 보전 대상 콤보박스 체크 또는 전체선택 후 해제
  5. [출력] 클릭 → 보전청구 명세서 미리보기 및 출력
기대결과:
  - 보전비용 대상 체크 후 [저장] 시 로그아웃 이후에도 저장 유지
  - [엑셀]로 보전청구 명세서 다운로드 가능
```

---

### E.8 보고서 및 수입지출부 출력 - 후원회

#### TC-RPT-S-001: 후원회의 수입지출 총괄표
```
전제조건: 후원회 로그인
테스트 순서:
  1. 보고관리 → 후원회의 수입지출 총괄표
  2. 전년도 자금 체크/미체크, 기간 설정, 작성연월일 입력
  3. [조회] → [출력] 또는 [엑셀]
기대결과:
  - 구분별(전회보고서 누계액, 후원금(기명/익명/소계), 그밖의수입, 합계) 수입/지출/잔액 표시
  - 지출: 기부금, 후원금모금경비, 기본경비(인건비/사무소설치운영비/소계), 그밖의경비, 합계
```

#### TC-RPT-S-002: 보고서 및 과목별 수입지출부 일괄출력 (후원회)
```
테스트 순서:
  1. 보고관리 → 보고서 및 과목별 수입지출부 출력
  2. 기간 설정, 표지 선택, 직접 입력 사항 기재
  3. [보고서 일괄출력]
기대결과:
  - 후원회 전용 보고사항 일괄 출력
  - 계정: 수입/지출
  - 과목: 전년도이월/기명후원금/익명후원금/그밖의수입 (수입), 기부금/후원금모금경비/인건비/사무소설치운영비/그밖의경비 (지출)
```

#### TC-RPT-S-003: 후원금 기부자 조회
```
전제조건: 후원회 로그인, 기명후원금 데이터 존재
테스트 순서:
  1. 보고관리 → 후원금 기부자 조회
  2. 구분 선택:
     - 1회 30만원 초과 기부자
     - 연간 300만원 초과 기부자
  3. 후원기간 설정
  4. [조회] 클릭
기대결과:
  - 조건에 맞는 초과 기부자 명단 조회 (번호, 반환, 성명, 생년월일, 주소, 직업, 금회번호, 후원일자, 금액, 내역, 비고)
  - [출력]: 후원금 기부자 명단 출력
  - [엑셀]: 엑셀 다운로드
  - [국세청자료저장]: 국세청 제출용 데이터 저장
```

#### TC-RPT-S-004: 후원금 반환자료 저장 (기부자 조회)
```
테스트 순서:
  1. 초과기부 건(+금액)과 반환 건(-금액)을 반환 □ 체크
  2. [반환자료 저장] 클릭
기대결과:
  - 해당하지 않게 된 경우 목록에서 초과기부 건과 반환 건이 제외됨
  - [출력]을 통해 확인 가능
```

#### TC-RPT-S-005: 감사의견서 등 출력
```
전제조건: 후원회 로그인
테스트 순서:
  1. 보고관리 → 감사의견서 등 출력
  2. [감사의견서] 탭:
     - 회계기간, 감사기간, 감사의견, 감사자 정보 입력
     - [저장] → [출력]
  3. [심사의결서] 탭:
     - 재산/수입/지출/잔액, 운영위원 정보 입력
     - [저장] → [출력]
  4. [회계보고서 제출문서] 탭:
     - 문서번호, 시행일자, 수신/제목/기관명 입력
     - [출력]
기대결과:
  - 각 탭별 정보 저장 및 출력 가능
  - 감사의견서, 심사의결서, 회계보고서 제출문서 각각 출력
  - 일괄출력 시 감사의견서 등은 함께 출력되지 않으므로 별도 출력 필요
```

---

### E.9 지출결의서 출력

#### TC-RESOL-001: 지출결의서 출력 (별도 메뉴)
```
테스트 순서:
  1. 정치자금관리 → 지출결의서 출력
  2. 계정, 과목, 지출기간 입력
  3. [조회] 클릭 → 지출 내역 조회
  4. 소관(발의)부서, 정치자금 종류 입력
  5. 출력할 자료 선택
  6. [엑셀] 클릭 → 엑셀 형태로 지출결의서 출력
기대결과:
  - 하나 또는 여러 지출내역의 지출결의서 일괄 출력
  - 다중선택 시 체크박스 선택 후 [엑셀] → 일괄 출력
  - [지우기]로 소관부서, 정치자금종류 초기화 가능
```

---

### E.10 시스템관리

#### TC-SYS-001: 자료 백업 - 프로그램 종료 시 자동
```
테스트 순서:
  1. 시스템관리 → 종료 (또는 우측 [X] 클릭)
기대결과:
  - 백업화면으로 전환
  - 필요에 따라 프로그램 저장 작업경로에 백업
  - 해당 날짜 및 시간별로 백업파일 생성
```

#### TC-SYS-002: 자료 백업 - 수동
```
테스트 순서:
  1. 시스템관리 → 자료 백업 및 복구
  2. 작업경로에서 Data 폴더 확인
  3. [백업] 버튼 클릭
기대결과:
  - Backup 폴더에 날짜/시간 이름으로 백업파일 생성
  - 후보자, 후원회 등 2개 이상 사용자인 경우 각각의 아이디를 확인하여 백업/복원 유의
```

#### TC-SYS-003: 자료 복구
```
전제조건: 백업 파일 존재
테스트 순서:
  1. 시스템관리 → 자료 백업 및 복구
  2. Backup 폴더에서 원하는 시점의 백업파일 선택
  3. [복구] 클릭
  4. 확인 팝업: "자료 복구 시 운영DB의 모든 자료는 선택한 복구DB의 자료로 모두 변경됩니다. 복구를 진행하시려면 로그인 비밀번호를 입력하시기 바랍니다."
  5. [예] 클릭 → 로그인 비밀번호 입력 → [OK]
기대결과:
  - 복구 완료, 선택한 시점의 데이터로 복원
  - 복구 후 기존 사용기관과 사용자ID 표출, 기존 비밀번호 입력 후 사용 가능
```

#### TC-SYS-004: 자료 초기화
```
테스트 순서:
  1. 시스템관리 → 자료 초기화
  2. 확인 팝업 → [예]
기대결과:
  - 기존 입력자료 일괄 삭제 (복구 불가)
  - 사용기관 정보는 유지
```

#### TC-SYS-005: 로그아웃/로그인
```
테스트 순서:
  1. 시스템관리 → 로그아웃/로그인
기대결과:
  - 프로그램 종료하지 않고 사용자 인증 화면으로 전환
  - 다른 사용기관으로 재로그인 가능
  - 로그아웃 시 자동백업 되지 않음 주의
```

---

### E.11 데이터 무결성 및 비즈니스 규칙

#### TC-RULE-001: 수입지출처 중복 등록 방지
```
테스트: 같은 구분 + 성명 + 생년월일(사업자번호)인 수입지출처 등록 시도
기대결과: 중복 등록 불가 메시지
```

#### TC-RULE-002: 지출액 > 수입액 방지
```
테스트: 계정/과목별 지출액이 수입액을 초과하는 지출 등록 시도
기대결과: 경고 또는 조정 안내 ("과목간 수입액을 조정 및 수정합니다")
```

#### TC-RULE-003: 회계기간 범위 내 일자 입력
```
테스트: 당해 회계기간(acc_from ~ acc_to) 범위 밖의 수입/지출 일자 입력
기대결과: 범위 밖 입력 불가 또는 경고
```

#### TC-RULE-004: 수입/지출 내역 있는 수입지출처 삭제 방지
```
테스트: 수입 또는 지출내역이 등록된 수입지출처 삭제 시도
기대결과: 삭제 불가 메시지
```

#### TC-RULE-005: 후원금 반환 시 기존 수입제공자 필수 조회
```
테스트: 후원회에서 후원금 반환 시 새 수입제공자로 등록 (동명이인)
기대결과: 반환내역이 반영되지 않음 → 반드시 기존 등록된 수입제공자를 조회하여 선택
```

#### TC-RULE-006: (예비)후보자 지출유형 필수 입력
```
테스트: (예비)후보자가 지출 등록 시 지출유형(대/중/소분류) 미입력
기대결과: 필수 입력 항목 경고
```

#### TC-RULE-007: 후원회 지출유형 미선택
```
테스트: 후원회가 지출 등록 시 지출유형 탭 미선택 확인
기대결과: 후원회는 지출유형 선택하지 않음이 정상
```

#### TC-RULE-008: 복구 범위 확인
```
테스트:
  (a) 수입내역 수정 후 복구 → 성공
  (b) 수입내역 다중삭제 후 복구 → 성공
  (c) 자료초기화 후 복구 시도 → 실패 (복구 불가)
  (d) 일괄등록에서 삭제 후 복구 시도 → 실패 (복구 불가)
  (e) 지출 영수증일괄생성/제거 후 복구 시도 → 실패 (복구 불가)
  (f) 로그아웃 후 재로그인하여 이전 세션 복구 시도 → 실패 (복구 불가)
기대결과: 각 케이스별 복구 가능/불가 확인
```

#### TC-RULE-009: 사용기관 유형별 메뉴 차이 검증
```
테스트:
  (a) (예비)후보자 로그인 → 보전비용 메뉴 존재, 감사의견서/후원금기부자조회 없음
  (b) 후원회 로그인 → 감사의견서/후원금기부자조회 메뉴 존재, 보전비용 없음
  (c) (예비)후보자 → 지출유형(대/중/소) 필수
  (d) 후원회 → 지출유형 탭 비활성
기대결과: 사용기관 유형에 따라 메뉴 및 입력 필드 차이 정확히 반영
```

#### TC-RULE-010: (예비)후보자 계정/과목 매핑 검증
```
테스트: (예비)후보자로 로그인 후 수입/지출 내역의 계정/과목 드롭다운 확인
기대결과:
  - 계정: 후보자등자산, 후원회기부금, 보조금, 보조금외지원금
  - 과목: 각 계정마다 선거비용, 선거비용외정치자금
```

#### TC-RULE-011: 후원회 계정/과목 매핑 검증
```
테스트: 후원회로 로그인 후 수입/지출 내역의 계정/과목 드롭다운 확인
기대결과:
  - 수입 계정: 수입 (고정)
  - 수입 과목: 전년도이월, 기명후원금, 익명후원금, 그 밖의 수입
  - 지출 계정: 지출 (고정)
  - 지출 과목: 기부금, 후원금모금경비, 인건비, 사무소설치운영비, 그 밖의 경비
```

#### TC-RULE-012: 결산/보고서 시 잔액 = 재산(현금및예금) 검증
```
테스트:
  (a) 수입지출 잔액이 2,902,930원, 재산내역 현금및예금도 2,902,930원 → 결산 정상
  (b) 수입지출 잔액이 2,902,930원, 재산내역 현금및예금이 3,000,000원 → 팝업 경고
기대결과:
  - "수입지출 총괄표상의 잔액과 재산내역의 현금 및 예금액과 차이가 있습니다.
    수입지출내역 또는 재산내역을 수정 후 다시 결산하십시오." 팝업
  - 수입/지출내역 또는 재산내역을 수정하여 값을 맞춘 후 재결산
  - 이 검증은 결산작업, 정치자금수입지출보고서, 후원회수입지출총괄표에 모두 적용
```

#### TC-RULE-013: 자료초기화 - 기간 범위 삭제 + 비밀번호 확인
```
테스트 순서:
  1. 시스템관리 → 자료초기화
  2. 삭제할 수입기간일 범위 설정 (예: 2022-04-01 ~ 2022-06-30)
  3. 해당 범위의 수입내역 건수/금액, 지출내역 건수/금액 조회 확인
  4. [일괄삭제] 클릭
  5. 경고 팝업: "삭제된 자료는 복구될 수 없으니 다시 한번 확인하시기 바랍니다."
  6. [예] → 로그인 비밀번호 입력 → [OK]
  7. 비밀번호 불일치 시 삭제 실패
기대결과:
  - 기간 범위 내 데이터만 삭제
  - 비밀번호 확인 필수
  - 삭제 후 복구 불가
```

#### TC-RULE-014: 개인정보 마스킹 - (예비)후보자 정치자금 수입지출 공개
```
전제조건: (예비)후보자 로그인, 수입지출부 데이터 존재
테스트 순서:
  1. 정치자금 수입지출부 화면에서 [전송] 버튼 클릭
기대결과:
  - 개인 성명 마스킹: "김교인" → "김**", "유금주" → "유**"
  - 개인 생년월일: "***"로 처리
  - 개인 주소: "서울특별시 동대문구 휘경로 14" → "서울특별시 동대문구 휘경로***"
  - 개인 직업: "***"
  - 개인 전화번호(11자리): "01012345678" → "010***"
  - 사업자 전화번호(비이동): 공백 출력
  - (예비)후보자 성명: 그대로 출력
  - 자료는 암호화하여 전송
```

#### TC-RULE-015: 코드관리 - 엑셀 불러오기 후 재로그인 필요
```
테스트 순서:
  1. 시스템관리 → 코드관리
  2. [엑셀파일의 코드자료 불러오기] 선택 → [조회] → 엑셀파일 선택 → [저장]
  3. 로그아웃 없이 수입내역관리에서 새 코드값 사용 시도
  4. 로그아웃 → 재로그인 후 새 코드값 사용 시도
기대결과:
  - 3단계: 새 코드값 미반영 (이전 코드 유지)
  - 4단계: 새 코드값 정상 반영
```

#### TC-RULE-016: 도움말 툴팁 ON 상태에서 모든 버튼/입력란 커버리지
```
전제조건: 도움말 토글 ON (기본값)
테스트 순서:
  1. 수입내역관리 화면 진입
  2. 모든 버튼에 마우스 호버: [화면초기화], [조회], [신규입력], [저장],
     [삭제], [취소], [복구], [수입부], [종료], [다중선택], [정렬저장],
     [영수증일괄입력]
  3. 모든 입력란에 마우스 호버: 계정, 과목, 수입일자, 수입금액,
     수입제공자, 수입내역, 증빙서첨부, 증빙서번호, 비고
  4. 우측 상단 수입액/지출액/잔액에 마우스 호버
기대결과:
  - 각 요소에 300ms 후 도움말 툴팁 표시
  - 툴팁에 제목(title) + 설명(description) 표시
  - 화면 밖으로 넘치지 않도록 자동 위치 조절
```

#### TC-RULE-017: 도움말 툴팁 OFF 상태에서 미표시 확인
```
테스트 순서:
  1. 헤더의 "❓ 도움말" 토글 스위치를 OFF로 변경
  2. 수입내역관리 화면의 모든 버튼/입력란에 마우스 호버
기대결과:
  - 어떤 요소에도 도움말 툴팁이 표시되지 않음
  - HTML title 속성도 표시되지 않음
```

#### TC-RULE-018: 도움말 토글 상태 유지 (localStorage)
```
테스트 순서:
  1. 도움말 토글을 OFF로 변경
  2. 로그아웃 → 재로그인
  3. 도움말 토글 상태 확인
  4. 도움말 토글을 ON으로 변경
  5. 브라우저 새로고침 (F5)
  6. 도움말 토글 상태 확인
기대결과:
  - 3단계: OFF 상태 유지
  - 6단계: ON 상태 유지
  - localStorage에 'help-mode' 키로 저장됨
```

#### TC-RULE-019: 도움말 툴팁 - 전체 화면 커버리지
```
테스트: 도움말 ON 상태에서 아래 모든 화면의 버튼/입력란에 툴팁 표시 확인
  (a) 사용기관관리: 사용기관구분, 기관명, 생년월일, 회계기간, 비밀번호, 힌트 등
  (b) 수입지출처관리: 구분, 성명, 생년월일, 직업, 주소검색, 이력관리 등
  (c) 수입내역관리: 계정, 과목, 수입일자, 금액, 수입제공자, 내역, 증빙서 등
  (d) 지출내역관리: 계정, 과목, 지출유형(대/중/소), 지출방법, 지출대상자, 금액 등
  (e) 재산내역관리: 재산구분, 종류, 수량, 가액 등
  (f) 일괄등록: 저장전자료확인, 엑셀양식 등
  (g) 보고관리: 전년도자료, 표지선택, 보고서일괄출력, 결산, 보전비용 등
  (h) 시스템관리: 백업, 복구, 자료초기화, 코드관리 등
기대결과:
  - 전체 8개 화면 그룹, 약 70개 이상 도움말 항목이 모두 표시됨
  - 누락된 도움말 항목 없음
```

#### TC-RULE-020: 정치자금영수증 발행 30일 규칙 (후원회)
```
테스트: 후원회에서 기명후원금 수입 등록 후 영수증 발행 기한 확인
기대결과 (정치자금법 제17조, 가이드북 p.60):
  - 후원금 기부받은 날부터 30일까지 정치자금영수증 발행 의무
  - 미발행 시: 2년 이하 징역 또는 400만원 이하 벌금
  - 정치후원금센터를 통한 전자 영수증 발행 가능
  - 종이 영수증: 중앙선관위 제작 양식만 사용 (별도 발급프로그램 불가)
  - 프로그램에서 영수증 발행 기한 경과 시 경고 안내 표시
```

#### TC-RULE-021: 후원회 회계보고 기한 검증
```
테스트: 후원회 해산/선거 종료 후 회계보고 기한 확인
기대결과 (가이드북 p.67):
  - 선거 종료/선거기간개시일 전 30일 이후(4.21 이후) 해산 시:
    선거 후 20일(6.23)을 기준으로 30일 내(7.3)까지 회계보고
  - 선거기간개시일 전 30일(4.21까지) 전에 해산 시:
    해산 사유 발생일부터 14일 이내 회계보고
```

#### TC-RULE-022: 후원인 연간 기부 총한도 (2천만원)
```
테스트: 후원인이 여러 후원회에 합산 2천만원 초과 기부 시
기대결과 (정치자금법 제11조, 가이드북 p.57):
  - 후원인은 연간 모든 후원금 합쳐서 2천만원 초과 기부 불가
  - 후원회 지정권자가 예비후보자→후보자 된 경우: 합산 500만원까지
  - 프로그램에서 같은 후원인의 누적 금액 체크 (동일 생년월일+성명 기준)
```

#### TC-RULE-023: 익명 기부 한도 (1회 10만원, 연간 120만원)
```
테스트: 익명후원금 한도 체크
기대결과 (가이드북 p.58):
  - 1회 10만원 이하, 연간 120만원 이하만 익명 기부 가능
  - 초과분 또는 타인 명의/가명 기부 → 국고 귀속 처리 필요
  - 프로그램에서 1회 10만원 초과 경고 (기존 TC-SUP-004 보완)
```

#### TC-RULE-024: 국회의원/경선후보자 메뉴 구조 검증
```
테스트: 국회의원 또는 경선후보자 사용기관으로 로그인
기대결과 (도움말 p.4):
  - 시스템관리: 자료백업및복구, 자료초기화, 로그아웃/로그인, 코드관리, 종료
  - 기본자료관리: 사용기관관리, 수입지출처관리, 수입지출처일괄등록
  - 정치자금관리: 수입내역관리, 지출내역관리, 수입지출내역일괄등록, 지출결의서출력
  - 보고관리: 재산내역관리, 재산명세서, 정치자금수입지출보고서, 정치자금수입지출부,
              보고서및과목별수입지출부출력
  - 도움말
  - (예비)후보자 대비 없는 메뉴: 보전비용, 정치자금수입지출공개
  - (예비)후보자 대비 같은 메뉴: 지출유형(대/중/소) 있음
```

---

### E.12 E2E 시나리오 테스트 (전체 흐름)

#### TC-E2E-001: (예비)후보자 전체 워크플로우
```
1. 사용기관 등록 ((예비)후보자)
2. 로그인
3. 수입지출처 등록 (개인 3건, 사업자 2건)
4. 수입내역 등록:
   - 후보자등자산/선거비용: 5,000,000원
   - 후보자등자산/선거비용외정치자금: 10,000,000원
   - 후원회기부금/선거비용외정치자금: 5,000,000원
   - 후원회기부금/선거비용: 6,000,000원
5. 지출내역 등록:
   - 후보자등자산/선거비용: 500,000원 (인쇄물→인쇄비→명함인쇄)
   - 후보자등자산/선거비용외정치자금: 1,000,000원 (선거사무소→임차보증금)
   - 후원회기부금/선거비용: 800,000원
   - 후원회기부금/선거비용외정치자금: 1,000,000원
6. 수입액/지출액/잔액 합계 검증
7. 재산내역 등록 (현금및예금: 22,700,000원)
8. 보고서 출력:
   - 정치자금 수입지출보고서 → 수입 합계 26,000,000 / 지출 합계 3,300,000 / 잔액 22,700,000
   - 정치자금 수입지출부 (계정/과목별)
   - 보고서 및 과목별 수입지출부 일괄출력
   - 재산명세서
9. 보전비용: 선거비용 지출내역 조회 → 보전 대상 체크 → 저장 → 출력
10. 백업 → 로그아웃
```

#### TC-E2E-002: 후원회 전체 워크플로우
```
1. 사용기관 등록 (후원회)
2. 로그인
3. 수입지출처 등록 (개인 5건)
4. 수입내역 등록:
   - 수입/기명후원금: 2,000,000원 (5건 개별 등록)
   - 수입/익명후원금: 100,000원
5. 지출내역 등록:
   - 지출/기부금: 1,000,000원
   - 지출/후원금모금경비: 6,190원
   - 지출/그밖의경비: 2,370원
6. 후원금 반환 처리: 기명후원금 -2,000,000원 (마이너스)
   → "당해년도 후원금은 감 처리..." 팝업 → [예]
7. 수입액/지출액/잔액 검증
8. 재산내역 등록
9. 보고서 출력:
   - 후원회의 수입지출 총괄표
   - 보고서 및 과목별 수입지출부 일괄출력
   - 재산명세서
10. 후원금 기부자 조회:
    - 1회 30만원 초과 기부자 조회
    - 연간 300만원 초과 기부자 조회
    - 반환자료 저장
11. 감사의견서 입력 → 저장 → 출력
12. 심사의결서 입력 → 저장 → 출력
13. 회계보고서 제출문서 출력
14. 백업 → 로그아웃
```

#### TC-E2E-003: 다중 사용기관 관리 시나리오
```
1. (예비)후보자 사용기관 등록 + 로그인
2. 수입/지출 데이터 입력
3. 수입지출처 엑셀 다운로드
4. 로그아웃/로그인 → 사용기관등록 화면
5. 후원회 사용기관 추가 등록 (반드시 [신규입력] 먼저 클릭)
6. 후원회로 로그인
7. 수입지출처 일괄등록 (앞서 다운로드한 엑셀 활용)
8. 후원회 수입/지출 데이터 입력
9. 각각 보고서 출력
10. 각각 백업 (2개 이상 사용자 시 각각의 아이디 확인하여 백업)
```

---

### E.13 2022년 실제 데이터 마이그레이션 테스트

> **원본**: `Fund_Data_1.db` (제9회 전국동시지방선거 2022년 오준석후보 회계자료)
> **주의**: 프로그램이 v2.0(2022) → v2.6.1(2025)로 업데이트되어 스키마가 변경되었을 수 있음.
> 반드시 **스키마 호환성 검증을 먼저** 수행하고, 불일치 시 변환 로직을 추가한 뒤 마이그레이션한다.

#### TC-MIG-001: 스키마 호환성 검증
```
전제조건: Supabase에 부록 C의 DDL 적용 완료
테스트 순서:
  1. Fund_Data_1.db(2022년)의 각 테이블 컬럼 목록 추출
  2. Supabase(v2.6.1 기준 설계)의 각 테이블 컬럼 목록과 비교
  3. 차이점 리포트 생성:
     - 2022년에 존재하지만 2026년에 없는 컬럼
     - 2026년에 추가되었지만 2022년에 없는 컬럼
     - 타입 변경된 컬럼
     - FK 관계 변경
기대결과:
  - 차이점 목록 문서화
  - 각 차이에 대한 처리 방안 결정:
    · 없는 컬럼 → NULL 또는 기본값으로 채우기
    · 삭제된 컬럼 → 무시 (마이그레이션에서 제외)
    · 타입 변경 → 변환 함수 적용
참고: 현재 확인 결과 Fund_Data_1.db와 Fund_Master.db의 스키마는 동일함
      (동일 v2.0 기준), Supabase DDL은 이 스키마 기반으로 설계됨
```

#### TC-MIG-002: CODESET/CODEVALUE 마이그레이션
```
테스트 순서:
  1. Fund_Data_1.db에서 CODESET 20건, CODEVALUE 293건 추출
  2. Supabase codeset/codevalue 테이블에 INSERT
  3. 레코드 수 검증: codeset=20, codevalue=293
  4. 주요 코드 검증:
     - CS_ID=1 (총괄계정): 수입(1)/지출(2) 확인
     - CS_ID=6 (사용기관): (예비)후보자(90) 확인
     - CS_ID=3 (계정과목): 선거비용(86)/선거비용외정치자금(87) 확인
기대결과:
  - 코드 데이터 정확히 이관
  - 코드 기반 드롭다운에서 올바른 항목 표시
```

#### TC-MIG-003: ACC_REL 계정관계 마이그레이션
```
테스트 순서:
  1. Fund_Data_1.db에서 ACC_REL 652건 추출
  2. Supabase acc_rel 테이블에 INSERT
  3. 검증: ORG_SEC_CD=90((예비)후보자) 필터링 시
     - INCM_SEC_CD=1(수입), INPUT_YN='Y'인 조합 확인
     - 예: ACC_SEC_CD=84(후보자등자산), ITEM_SEC_CD=86(선거비용) → Y
기대결과:
  - 652건 정확히 이관
  - (예비)후보자로 로그인 시 올바른 계정-과목 드롭다운 필터링
```

#### TC-MIG-004: ORGAN 사용기관 마이그레이션
```
테스트 순서:
  1. Fund_Data_1.db에서 ORGAN 1건 추출 (오준석후보)
  2. Supabase organ 테이블에 INSERT
  3. Supabase Auth 사용자 생성 + user_organ 매핑
  4. 검증:
     - org_name='오준석후보'
     - org_sec_cd=90 ((예비)후보자)
     - acc_from='20220419', acc_to='20220621'
     - 해당 사용자로 로그인 성공
기대결과:
  - 사용기관 정보 정확히 이관
  - 로그인 후 (예비)후보자 전용 메뉴 표시
```

#### TC-MIG-005: CUSTOMER 수입지출처 마이그레이션
```
테스트 순서:
  1. Fund_Data_1.db에서 CUSTOMER 26건 추출
  2. Supabase customer 테이블에 INSERT
  3. 검증:
     - 총 26건 (익명 1건 포함)
     - 개인(63): 김교인, 유금주 등
     - 사업자(62): 청산현수막, 동원샘물, KT 등 19건
     - (예비)후보자(61): 오준석
     - 후원회(89): 1건
     - 시도당(57): 진보당서울시당
  4. CUSTOMER_ADDR 22건 이관 및 검증
기대결과:
  - 수입지출처 목록에서 26건 표시
  - 수입/지출 등록 시 수입지출처 검색 정상 작동
  - 주소 이력 22건 확인 가능
```

#### TC-MIG-006: ACC_BOOK 수입지출내역 마이그레이션
```
테스트 순서:
  1. Fund_Data_1.db에서 ACC_BOOK 41건 추출 (수입 13건 + 지출 28건)
  2. Supabase acc_book 테이블에 INSERT
  3. 합계 검증:
     - 수입 합계: 17,699,055원
     - 지출 합계: 14,796,125원
     - 잔액: 2,902,930원
  4. 계정/과목별 집계 검증:
     - 후보자등자산(84)/선거비용(86) 수입: 3,000,000원 (2건)
     - 후보자등자산(84)/선거비용외정치자금(87) 수입: 5,000,055원 (6건)
     - 보조금(82)/선거비용(86) 수입: 4,415,000원 (1건)
     - 후원회기부금(85)/선거비용(86) 수입: 3,948,700원 (3건)
     - 후원회기부금(85)/선거비용외정치자금(87) 수입: 1,335,300원 (1건)
  5. 엣지케이스 검증:
     - ACC_BOOK_ID=48: 마이너스 수입(-500,000원, 계좌입금오류 반환처리) 정상 표시
     - ACC_BOOK_ID=42: 소액 수입(55원, 예금이자) 정상 표시
     - 보조금 수입=지출 대칭: 4,415,000원
  6. 지출 상세 검증:
     - 지출유형(EXP_GROUP1~3) 정상 이관 확인
       예: "인쇄물/선거공보/인쇄비", "선거사무소/임차보증금"
     - 증빙서번호(RCP_NO) 패턴 확인: "자-", "보(비)-", "후(비)-", "후-"
기대결과:
  - 41건 정확히 이관
  - 수입내역관리 화면에서 합계 일치 확인
  - 지출내역관리 화면에서 합계 일치 확인
```

#### TC-MIG-007: ESTATE 재산내역 마이그레이션
```
테스트 순서:
  1. Fund_Data_1.db에서 ESTATE 1건 추출
  2. Supabase estate 테이블에 INSERT
  3. 검증:
     - estate_sec_cd=47 (현금및예금)
     - kind='예금', content='국민은행 527802-01-363256'
     - amt=2,902,930원 (= 잔액과 일치)
기대결과:
  - 재산내역관리 화면에서 "현금 및 예금: 2,902,930원" 표시
  - 재산명세서 출력 시 합계 2,902,930원
```

#### TC-MIG-008: ACC_BOOK_BAK 복구 데이터 마이그레이션
```
테스트 순서:
  1. Fund_Data_1.db에서 ACC_BOOK_BAK 1건 추출
  2. Supabase acc_book_bak 테이블에 INSERT
기대결과:
  - 마이그레이션 완료 (복구 기능은 새 세션에서만 동작하므로 기존 BAK는 참고용)
```

#### TC-MIG-009: 마이그레이션 후 화면 검증 - 수입내역관리
```
전제조건: TC-MIG-001~008 완료, 오준석후보 계정으로 로그인
테스트 순서:
  1. 수입내역관리 화면 진입
  2. 전체 조회 → 수입내역 13건 표시 확인
  3. 우측 상단 합계 검증: 수입액 17,699,055원, 지출액 14,796,125원, 잔액 2,902,930원
  4. 계정 "후보자등자산" + 과목 "선거비용외정치자금" 조회
     → 6건 표시, 합계 5,000,055원
  5. 수입일자 범위 조회: 2022-05-01 ~ 2022-06-30
     → 해당 범위 수입 건만 표시, 첫 행에 '누계액' 표시
  6. 수입제공자 검색: "오준석" → Like 검색 결과 확인
기대결과:
  - 2022년 실제 데이터 기반 정상 조회
  - 합계/잔액 정확히 일치
```

#### TC-MIG-010: 마이그레이션 후 화면 검증 - 지출내역관리
```
전제조건: 마이그레이션 완료, 오준석후보 계정
테스트 순서:
  1. 지출내역관리 화면 진입
  2. 전체 조회 → 지출내역 28건 표시 확인
  3. 지출유형 컬럼 확인:
     - "인쇄물/예비후보자홍보물/인쇄비" 등 대/중/소분류 정상 표시
     - "선거사무소/임차보증금" 정상 표시
  4. 증빙서번호 패턴 확인: "자-1", "보(비)-1", "후(비)-1" 등
  5. 지출방법 확인: 118(계좌입금), 585(체크카드) 등
기대결과:
  - 지출유형 3단계 정상 표시
  - 증빙서번호 체계 유지
```

#### TC-MIG-011: 마이그레이션 후 화면 검증 - 보고서 출력
```
전제조건: 마이그레이션 완료, 오준석후보 계정
테스트 순서:
  1. 정치자금 수입지출보고서 출력
     → 수입 합계 17,699,055 / 지출 합계 14,796,125 / 잔액 2,902,930 검증
  2. 재산명세서 출력
     → 현금 및 예금: 2,902,930원 (잔액과 일치)
  3. 보고서 및 과목별 수입지출부 일괄출력
     → 계정/과목별 수입부/지출부 정상 출력
기대결과:
  - 2022년 실데이터 기반 모든 보고서 정상 출력
  - 금액 합계 교차검증 통과
```

#### TC-MIG-012: 마이그레이션 후 신규 데이터 추가 (혼합 테스트)
```
전제조건: 2022년 데이터 마이그레이션 완료
테스트 순서:
  1. 기존 2022년 데이터 위에 신규 수입내역 1건 추가
     - 후보자등자산/선거비용, 100,000원
  2. 합계 검증: 수입액 17,799,055원 (+100,000)
  3. 신규 지출내역 1건 추가
     - 후보자등자산/선거비용, 50,000원, 지출유형 입력
  4. 잔액 검증: 2,952,930원 (+100,000 -50,000)
  5. 추가한 내역 삭제 → 원래 합계로 복원 확인
기대결과:
  - 마이그레이션된 데이터와 신규 입력 데이터가 혼재해도 정상 동작
  - 합계 계산 정확
```

#### TC-MIG-013: 스키마 불일치 시 graceful 처리
```
테스트 시나리오: 2026년 프로그램에서 추가된 컬럼이 있을 때
테스트 순서:
  1. 마이그레이션 스크립트 실행 시 2022년 DB에 없는 컬럼 탐지
  2. 해당 컬럼에 NULL 또는 기본값 자동 채우기
  3. 경고 리포트 생성 (어떤 컬럼이 기본값으로 채워졌는지)
  4. 마이그레이션 완료 후 해당 필드가 빈 상태로 화면에서 정상 동작하는지 확인
기대결과:
  - 스키마 불일치가 있어도 마이그레이션 실패하지 않음
  - 누락 필드는 기본값으로 채워지고 경고 메시지 출력
  - 화면에서 해당 필드는 빈값 또는 기본값으로 표시
```

#### TC-MIG-014: 마이그레이션 데이터 무결성 종합 검증
```
테스트 순서:
  1. FK 참조 무결성 확인:
     - acc_book.org_id → organ.org_id 참조 유효
     - acc_book.cust_id → customer.cust_id 참조 유효
     - estate.org_id → organ.org_id 참조 유효
  2. 코드 참조 무결성 확인:
     - acc_book.acc_sec_cd → codevalue.cv_id에 존재
     - acc_book.item_sec_cd → codevalue.cv_id에 존재
     - organ.org_sec_cd → codevalue.cv_id에 존재
  3. 비즈니스 룰 검증:
     - 모든 계정/과목별 지출 합계 ≤ 수입 합계
     - 재산(현금및예금) = 잔액
  4. 날짜 범위 검증:
     - 모든 acc_book.acc_date가 organ.acc_from ~ organ.acc_to 범위 내
기대결과:
  - FK 위반 0건
  - 코드 참조 오류 0건
  - 비즈니스 룰 위반 0건
  - 날짜 범위 이탈 0건
```

#### TC-MIG-015: SQLite .db 파일 내보내기 (선관위 제출용)
```
전제조건: TC-MIG-006 완료 (2022년 데이터 마이그레이션 완료)
테스트 순서:
  1. 시스템관리 → 제출파일 생성 (또는 .db 내보내기)
  2. 대상 사용기관 선택 (오준석후보)
  3. [내보내기] 클릭
  4. .db 파일 다운로드
  5. 다운로드한 .db 파일을 sqlite3로 열어서 검증:
     a) 테이블 목록 확인: ORGAN, CUSTOMER, ACC_BOOK 등 19개 테이블 존재
     b) 테이블명/컬럼명이 원본과 동일 (대문자: ACC_BOOK, ORG_ID 등)
     c) SELECT COUNT(*) FROM ACC_BOOK → 41건
     d) SELECT SUM(ACC_AMT) FROM ACC_BOOK WHERE INCM_SEC_CD=1 → 17,699,055
     e) SELECT SUM(ACC_AMT) FROM ACC_BOOK WHERE INCM_SEC_CD=2 → 14,796,125
     f) SELECT * FROM ORGAN → 오준석후보 정보 확인
     g) SELECT COUNT(*) FROM CUSTOMER → 26건
     h) SELECT * FROM ESTATE → 1건, 현금및예금 2,902,930원
기대결과:
  - 기존 프로그램(v2.0/v2.6.1)에서 열 수 있는 유효한 SQLite DB 파일
  - 원본 Fund_Data_1.db와 데이터 동일
  - 선관위에 제출 가능한 형식
```

#### TC-MIG-016: .db 내보내기 후 원본 프로그램 호환성 검증
```
전제조건: TC-MIG-015에서 생성한 .db 파일
테스트 순서:
  1. 생성된 .db 파일을 기존 Windows 프로그램의 Data/ 폴더에 복사
     (Fund_Data_1.db로 이름 변경)
  2. 기존 프로그램에서 자료 복구 실행
  3. 또는: 생성된 .db를 Backup/ 폴더에 넣고 복구
기대결과:
  - 기존 프로그램에서 데이터를 정상적으로 읽을 수 있음
  - 수입/지출 내역, 수입지출처, 재산내역 정상 표시
  - (이 테스트는 Windows 환경이 있을 때만 수행)
```

#### TC-MIG-017: SQLite .db 파일 가져오기 (기존 백업 복원)
```
전제조건: Supabase에 빈 상태 (또는 별도 테스트 기관)
테스트 순서:
  1. 시스템관리 → .db 파일 가져오기
  2. 기존 Backup/ 폴더의 .db 파일 업로드
     예: "정치자금【오준석후보】보관자료_2022-07-08 00시45분27초.db"
  3. 스키마 호환성 검증 자동 실행 → 결과 표시
  4. [가져오기] 클릭
  5. 결과 리포트 확인:
     - 이관 테이블별 건수
     - 오류/경고 사항
     - 스키마 불일치 처리 내역
기대결과:
  - .db 파일의 데이터가 Supabase로 정상 이관
  - 이관 후 수입내역관리 등 화면에서 조회 가능
  - 합계 검증 통과
```

#### TC-MIG-018: 신규 입력 데이터 .db 내보내기 라운드트립
```
테스트 순서:
  1. Supabase에서 새 사용기관 등록
  2. 수입지출처 5건, 수입내역 3건, 지출내역 2건, 재산 1건 입력
  3. .db 파일로 내보내기
  4. Supabase에서 해당 기관 데이터 전체 삭제
  5. 내보낸 .db 파일을 다시 가져오기
  6. 원래 입력한 데이터와 동일한지 검증
기대결과:
  - 내보내기 → 가져오기 라운드트립 후 데이터 100% 일치
  - 수입지출처 5건, 수입 3건, 지출 2건, 재산 1건 동일
  - 합계/잔액 동일
```

---

### E.14 엑셀 템플릿 입출력 테스트

> 원본 템플릿: `중앙선거관리위원회_정치자금회계관리2/엑셀파일/` (7개 파일)
> 2022년 오준석후보 실제 데이터가 포함된 엑셀 파일을 템플릿 겸 테스트 데이터로 활용한다.

#### TC-XLS-001: 빈 엑셀 템플릿 다운로드
```
테스트 순서:
  1. 수입내역관리 또는 지출내역관리 화면에서 [엑셀 템플릿] 다운로드
  2. 계정/과목 선택: "후보자등자산 / 선거비용"
  3. 다운로드된 .xlsx 파일 확인
기대결과:
  - Row 2: "정 치 자 금  수 입 · 지 출 부" 제목 (15pt 볼드, 병합)
  - Row 4: "계정(과 목)명: 후보자등 자산 (선거비용)" 자동 기재
  - Row 5-8: 컬럼 헤더 (년월일, 내역, 수입액 금회/누계, 지출액 금회/누계, 잔액, 수입/지출 상대방 정보, 영수증, 비고)
  - Row 9~: 빈 행 (데이터 입력 영역)
  - 6개 계정/과목 조합 각각 정상 다운로드 가능
```

#### TC-XLS-002: 계정별 수입지출부 엑셀 출력 - 후보자산/선거비용
```
전제조건: 2022년 데이터 마이그레이션 완료 (TC-MIG-006)
테스트 순서:
  1. [엑셀 출력] → 계정: 후보자등자산, 과목: 선거비용
  2. 다운로드된 .xlsx 파일 확인
기대결과:
  - Row 4: "계정(과 목)명: 후보자등 자산 (선거비용)"
  - Row 9~: 데이터 5건 (2022-05-02 ~ 2022-05-11)
  - 수입: 후보자산 3,000,000원 (오준석 2건)
  - 지출: 외벽현수막 1,650,000 + 예비공보물봉투 58,335 + 라벨용지 40,990 = ...
  - 잔액: 최종행의 G열(잔액)이 수입누계 - 지출누계와 일치
  - 원본 파일(후보자산-선거비용.xlsx)과 데이터 동일
```

#### TC-XLS-003: 계정별 수입지출부 엑셀 출력 - 후보자산/선거비용외
```
테스트 순서:
  1. [엑셀 출력] → 계정: 후보자등자산, 과목: 선거비용외정치자금
기대결과:
  - 데이터 10건 (2022-04-20 ~ 2022-05-14)
  - 수입: 5,500,055원 (후보자산 5,000,000 + 계좌입금오류반환 500,000/-500,000 + 예금이자 55)
  - 지출: 5,497,800원 (월세, 중계수수료, 사무용품 등)
  - 최종 잔액: 2,255원
  - 마이너스 수입(-500,000) 정상 표시 확인
```

#### TC-XLS-004: 계정별 수입지출부 엑셀 출력 - 기부금/선거비용
```
테스트 순서:
  1. [엑셀 출력] → 계정: 후원회기부금, 과목: 선거비용
기대결과:
  - 데이터 11건 (2022-05-13 ~ 2022-06-13)
  - 수입: 5,284,000원 (후원금 3건)
  - 지출: 3,944,690원 (인쇄물, 모자, 현수막, 문자발송 등 9건)
  - 최종 잔액: 1,339,310원
```

#### TC-XLS-005: 계정별 수입지출부 엑셀 출력 - 기부금/선거비용외
```
테스트 순서:
  1. [엑셀 출력] → 계정: 후원회기부금, 과목: 선거비용외정치자금
기대결과:
  - 데이터 6건 (2022-05-13 ~ 2022-06-21)
  - 지출: 1,335,300원 (기탁금, 다과, 사무비용, 점자공보, 정수기, 주소록)
  - 최종 잔액: -1,335,300원 (이 과목에서는 수입 없이 지출만 발생)
```

#### TC-XLS-006: 계정별 수입지출부 엑셀 출력 - 보조금/선거비용
```
테스트 순서:
  1. [엑셀 출력] → 계정: 보조금, 과목: 선거비용
기대결과:
  - 데이터 6건 (2022-05-13 ~ 2022-06-08)
  - 수입: 4,415,000원 (진보당서울시당)
  - 지출: 2,548,335원 (조끼, 장갑, 전기세, 공보물/명함 등)
  - 최종 잔액: 1,866,665원
```

#### TC-XLS-007: 계정별 수입지출부 엑셀 출력 - 보조금/선거비용외
```
테스트 순서:
  1. [엑셀 출력] → 계정: 보조금, 과목: 선거비용외정치자금
기대결과:
  - 데이터 없음 (보조금 선거비용외 거래 0건)
  - 헤더만 있는 빈 템플릿 형태로 출력
```

#### TC-XLS-008: 정치자금 수입지출보고서 엑셀 출력
```
전제조건: 2022년 데이터 마이그레이션 완료
테스트 순서:
  1. 보고관리 → 정치자금 수입지출보고서 → [엑셀] 클릭
  2. 다운로드된 .xls 파일 확인
기대결과:
  - 선거명: 구의회의원선거, 선거구: 동대문구라선거구
  - 집계 테이블 검증:
    | 구분 | 수입 | 선거비용 | 선거비용외 | 소계 | 잔액 |
    |------|------|---------|----------|------|------|
    | 자산 | 8,500,055 | 1,970,000 | 5,497,800 | 7,467,800 | 1,032,255 |
    | 후원회기부금 | 5,284,000 | 3,944,690 | 1,335,300 | 5,279,990 | 4,010 |
    | 보조금 | 4,415,000 | 2,548,335 | 0 | 2,548,335 | 1,866,665 |
    | 보조금외 | 0 | 0 | 0 | 0 | 0 |
    | 합계 | 18,199,055 | 8,463,025 | 6,833,100 | 15,296,125 | 2,902,930 |
  - 주의: Fund_Data_1.db의 합계(17,699,055)와 다른 이유는
    엑셀 보고서에는 다른 시점의 스냅샷이 포함되어 있을 수 있음
    → DB 기준 합계로 재계산하여 출력
```

#### TC-XLS-009: 전체 엑셀 일괄 출력 (ZIP)
```
테스트 순서:
  1. 보고관리 → [전체 엑셀 출력]
기대결과:
  - 7개 파일을 ZIP으로 다운로드:
    · 후보자산-선거비용.xlsx
    · 후보자산-선거비용외.xlsx
    · 기부금-선거비용.xlsx
    · 기부금-선거비용외.xlsx
    · 보조금-선거비용.xlsx
    · 보조금-선거비용외.xlsx
    · 정치자금 수입지출보고서.xlsx
  - 각 파일의 합계가 보고서의 합계 행과 일치
```

#### TC-XLS-010: 엑셀 파일에서 수입지출 데이터 가져오기 - 성공
```
테스트 순서:
  1. 빈 사용기관(또는 테스트 기관)으로 로그인
  2. 수입지출내역 일괄등록 → [엑셀 가져오기]
  3. 원본 파일 "후보자산-선거비용.xlsx" 업로드
  4. 파일 파싱 결과 확인:
     - Row 4에서 계정/과목 자동 인식: 후보자등자산 / 선거비용
     - Row 9~13에서 5건 데이터 추출
  5. [저장 전 자료확인] → 오류 없음
  6. [저장] 클릭
기대결과:
  - acc_book에 5건 INSERT (incm_sec_cd 자동 결정: 수입 C열 or 지출 E열)
  - 수입제공자/지출대상자: customer 테이블 자동 매칭 또는 신규 생성
  - 수입내역관리 화면에서 5건 조회 가능
  - 합계 검증: 수입 3,000,000원, 지출 1,970,000원
```

#### TC-XLS-011: 엑셀 파일에서 수입지출 데이터 가져오기 - 계정/과목 자동 인식
```
테스트 순서:
  1. 각 템플릿 파일 6개를 순서대로 업로드
  2. Row 4의 계정(과목)명에서 자동으로 acc_sec_cd, item_sec_cd 매핑
기대결과:
  - "후보자등 자산 (선거비용)" → acc_sec_cd=84, item_sec_cd=86
  - "후보자등 자산 (선거비용외 정치자금)" → acc_sec_cd=84, item_sec_cd=87
  - "후원회기부금 (선거비용)" → acc_sec_cd=85, item_sec_cd=86
  - "후원회기부금 (선거비용외 정치자금)" → acc_sec_cd=85, item_sec_cd=87
  - "보조금 (선거비용)" → acc_sec_cd=82, item_sec_cd=86
  - "보조금 (선거비용외 정치자금)" → acc_sec_cd=82, item_sec_cd=87
```

#### TC-XLS-012: 엑셀 가져오기 - 오류 처리
```
테스트 순서:
  1. 엑셀 파일에 의도적 오류 삽입:
     a) 날짜 형식 오류 (문자열 "abc" 입력)
     b) 금액에 문자 입력
     c) 필수 항목(날짜, 금액, 내역) 누락
     d) 회계기간 범위 밖 날짜
  2. [저장 전 자료확인] 클릭
기대결과:
  - 오류 리포트: 행 번호 + 오류 내용 (오류1건이라도 있으면 저장 불가)
  - [엑셀] 버튼으로 오류 내용 다운로드 가능
  - 오류 수정 후 재업로드 → 저장 가능
```

#### TC-XLS-013: 엑셀 가져오기 - 수입지출처 자동 매칭/생성
```
테스트 순서:
  1. 엑셀 파일에 기존 등록된 수입지출처 "오준석" 포함
  2. 엑셀 파일에 미등록 수입지출처 "새로운업체" 포함
  3. [저장]
기대결과:
  - "오준석": 기존 customer에서 자동 매칭 (name + reg_num 일치)
  - "새로운업체": 신규 customer 자동 생성
  - 자동 매칭 시 H(성명) + I(생년월일/사업자번호)로 식별
```

#### TC-XLS-014: 엑셀 가져오기 - 누계/잔액 자동 재계산
```
테스트 순서:
  1. 엑셀 파일에 누계(D열, F열)와 잔액(G열)에 임의값 입력
  2. [저장]
기대결과:
  - 사용자가 입력한 누계/잔액은 무시됨
  - DB에서 자동 재계산하여 정확한 누계/잔액 산출
  - 수입내역관리 화면의 합계와 일치
```

#### TC-XLS-015: 엑셀 출력 → 가져오기 라운드트립
```
테스트 순서:
  1. 수입지출 데이터가 있는 상태에서 "후보자산-선거비용" 엑셀 출력
  2. 다른 사용기관(또는 데이터 삭제 후)에서 해당 엑셀 파일 가져오기
  3. 원본 데이터와 동일한지 검증
기대결과:
  - 출력 → 가져오기 라운드트립 후 데이터 100% 일치
  - 건수, 금액, 수입지출처 정보 모두 동일
```

#### TC-XLS-016: 2022년 원본 엑셀 파일 6개 전체 가져오기
```
전제조건: 빈 사용기관 준비
테스트 순서:
  1. 원본 엑셀파일 6개를 순서대로 가져오기:
     ① 후보자산-선거비용.xlsx (5건)
     ② 후보자산-선거비용외.xlsx (10건)
     ③ 기부금-선거비용.xlsx (11건)
     ④ 기부금-선거비용외.xlsx (6건)
     ⑤ 보조금-선거비용.xlsx (6건)
     ⑥ 보조금-선거비용외.xlsx (0건 - 빈 파일)
  2. 전체 합계 검증
기대결과:
  - 총 38건 등록 (41건과 차이는 빈파일/중복 제외 가능)
  - 수입지출보고서 출력 시 원본 보고서와 금액 비교 가능
  - 중복 수입지출처는 자동 매칭 (같은 업체가 여러 파일에 등장)
```

#### TC-XLS-017: 후원회용 엑셀 템플릿 출력
```
전제조건: 후원회 로그인, 후원회 수입/지출 데이터 존재
테스트 순서:
  1. [엑셀 출력] → 계정: 수입, 과목: 기명후원금
  2. [엑셀 출력] → 계정: 지출, 과목: 기부금
기대결과:
  - 후원회 전용 계정/과목 조합으로 수입지출부 출력
  - 템플릿 Row 4에 후원회 계정/과목명 자동 기재
  - 후원회의 과목은 (예비)후보자와 다름:
    · 수입: 전년도이월, 기명후원금, 익명후원금, 그 밖의 수입
    · 지출: 기부금, 후원금모금경비, 인건비, 사무소설치운영비, 그 밖의 경비
```

---

### E.15 후원회 전용 기능 상세 테스트

> 원본 자료: `중앙선거관리위원회_정치자금회계관리2/후원회/` 폴더
> 참고: 제9회 전국동시지방선거 후원회 설립 가이드북, 사용자 매뉴얼 후원회용

#### TC-SUP-001: 기명후원금 수입자 일괄등록 - 성공 (엑셀 양식)
```
전제조건: 후원회 로그인
테스트 순서:
  1. 정치자금관리 → 수입지출내역 일괄등록 → [수입내역] 탭
  2. 원본 파일 "수입자일괄등록(회계관리프로그램).xlsx" 업로드
  3. [저장 전 자료확인] 클릭
  4. [저장] 클릭
기대결과:
  - 23건 기명후원금 수입내역 등록
  - 각 행의 필드 매핑 검증:
    · A(계정)='수입', B(과목)='기명후원금' 자동 매핑
    · C(수입일자): 2022.05.04 ~ 2022.06.01 범위
    · E(수입제공자): 김경일, 김기태, 김영환 등 23명
    · F(생년월일): 19770129 등
    · L(금액): 100,000 ~ 500,000원
    · M(증빙서첨부): 'Y'
    · N(영수증번호): AA000003708264 ~ AA000003746570
    · O(수입지출처구분): '개인'
    · P(비고): 이메일 주소
  - 수입지출처(customer) 23명 자동 등록
  - 합계: 총 3,500,000원 (23건)
```

#### TC-SUP-002: 기명후원금 일괄등록 - 불완전 데이터 오류 처리
```
테스트 순서:
  1. 원본 엑셀에서 Row 14(윤용신)에 필수항목 누락 확인
     (계정, 과목, 수입일자, 증빙서첨부, 수입지출처구분 등 비어있음)
  2. [저장 전 자료확인] 클릭
기대결과:
  - Row 14에 오류 표시 (필수항목 누락)
  - 오류 1건 이상 → [저장] 불가
  - [엑셀]로 오류 리포트 다운로드 가능
```

#### TC-SUP-003: 익명후원금 수입자 일괄등록 - 성공
```
전제조건: 후원회 로그인
테스트 순서:
  1. 수입지출내역 일괄등록 → [수입내역] 탭
  2. 원본 파일 "익명수입자일괄등록(회계관리프로그램).xlsx" 업로드
  3. [저장 전 자료확인] → [저장]
기대결과:
  - 15건 익명후원금 수입내역 등록
  - 필드 매핑:
    · A='수입', B='익명후원금'
    · E(수입제공자)='익명'
    · F~K(개인정보) 모두 비어있음
    · M(증빙서첨부)='N', N='익명'
    · O='개인'
  - 금액: 30,000 ~ 200,000원, 합계 1,190,000원
  - 익명후원금 1회 한도(10만원) 초과 건: 200,000원 2건, 100,000원 4건
    → 1회 10만원 초과 시 경고 팝업 (저장은 가능)
```

#### TC-SUP-004: 익명후원금 한도 검증 (1회 10만원)
```
테스트 순서:
  1. 후원회에서 익명후원금 수입 등록 시 200,000원 입력
기대결과:
  - "익명후원금 1회 한도액(10만원)을 초과합니다" 경고
  - 경고 후에도 저장 가능 (법적으로 초과분은 국고 귀속 처리 필요)
```

#### TC-SUP-005: 정치후원금센터 후원금 자료 일괄등록
```
전제조건: 후원회 로그인
테스트 순서:
  1. 수입지출내역 일괄등록 → [정치후원금센터 후원금 자료] 탭
  2. 정치후원금센터에서 다운로드한 엑셀 파일 업로드
  3. [저장 전 자료확인] → [저장]
기대결과:
  - 과목 자동 입력: '기명후원금'
  - 수입내역 자동 입력: '기명후원금(후원금센터)'
  - 수입지출처 자동 등록
  - 이 탭은 후원회 기관만 사용 가능
```

#### TC-SUP-006: 후원회 수입지출총괄표 출력 - 실데이터 검증
```
전제조건: 후원회 로그인, 2022년 실데이터 (제출문서.pdf 기준)
테스트 순서:
  1. 보고관리 → 후원회의 수입지출 총괄표
  2. 기간 설정: 2022/04/20 ~ 2022/06/21
  3. [조회] → [출력] 또는 [엑셀]
기대결과 (제출문서.pdf 실데이터 기준):
  - 수입:
    · 전회보고시 누계액: 0
    · 후원금 기명: 4,500,000원
    · 후원금 익명: 790,000원
    · 후원금 소계: 5,290,000원
    · 그 밖의 수입: 0
    · 합계: 5,290,000원
  - 지출:
    · 기부금: 5,284,000원
    · 후원금 모금경비: 0
    · 기본경비 인건비: 0
    · 기본경비 사무소설치운영비: 0
    · 기본경비 소계: 0
    · 그 밖의 경비: 6,000원
    · 합계: 5,290,000원
  - 잔액: 0원
  - 작성연월일: 2022년 06월 24일
  - 회계책임자: 신하섭
```

#### TC-SUP-007: 감사의견서 출력 - 실데이터 검증
```
전제조건: 후원회 로그인
테스트 순서:
  1. 보고관리 → 감사의견서 등 출력 → [감사의견서] 탭
  2. 감사의견.pdf 기준으로 정보 입력:
     - 회계기간: 2022년 01월 01일 ~ 2022년 12월 31일
     - 감사기간: 2022.06.17 ~ 2022.06.17
     - 감사대상: ① 재산상황 ② 정치자금의 수입과 지출에 관한 내역 및 결산내역
     - 감사의견: "「정치자금법」 및 「정치자금사무관리 규칙」과 일반적으로 인정된 회계원칙에 따라 적정하게 처리함"
     - 특기사항: 없음
     - 감사자: 직위=감사, 주소=서울시 동대문구 전농동 10-1 201동 1202호, 성명=박상호
  3. [저장] → [출력]
기대결과:
  - 감사의견서 양식에 입력 내용 정확히 출력
  - "정치자금법 제41조 제1항에 따라 실시한..." 법적 문구 포함
```

#### TC-SUP-008: 심사의결서 출력 - 실데이터 검증
```
전제조건: 후원회 로그인
테스트 순서:
  1. 감사의견서 등 출력 → [심사의결서] 탭
  2. 심사의결서.pdf 기준으로 정보 입력:
     - 수입·지출기간: 2022.04.20 ~ 2022.06.21
     - 재산: 0원
     - 수입: 5,290,000원
     - 지출: 5,290,000원
     - 잔액: 0원
     - 날짜: 2022년 06월 24일
     - 후원회명: 동대문구라선거구구의회의원후보자오준석후원회
     - 운영위원: 복성현, 이홍준, 조은혜 (3명)
  3. [저장] → [출력]
기대결과:
  - "재산 및 수입·지출상황 등의 심사 의결서" 양식
  - 의결주문, 수입지출기간, 재산/수입/지출/잔액, 운영위원 직위/성명 출력
  - 참고사항: 수입·지출내역 1부, 심사보고서 1부
```

#### TC-SUP-009: 회계보고서 제출문서 출력
```
전제조건: 후원회 로그인
테스트 순서:
  1. 감사의견서 등 출력 → [회계보고서 제출문서] 탭
  2. 제출문서.pdf 기준으로 입력:
     - 문서번호, 시행일자
     - 수신: 관할선거관리위원회
     - 제목: "○○○후원회 회계보고서 제출"
  3. [출력]
기대결과:
  - 회계보고서 제출문서 양식 출력
  - 붙임 목록: 1.재산명세서, 2.수입기록총괄표, 3.과목별수입부, 4.과목별지출부,
    5.영수증등지출증빙서류사본, 6.정치자금수입지출용예금통장사본,
    7.후원금기부자명단, 8.자체감사기관감사의견서, 9.대의기관심사의결서사본
```

#### TC-SUP-010: 재산명세서 출력 - 실데이터 검증
```
전제조건: 후원회 로그인
테스트 순서:
  1. 보고관리 → 재산명세서
  2. 기준연월일: 2022년06월21일
기대결과 (제출문서.pdf 기준):
  - 토지: 없음 (소계 0)
  - 건물: 없음 (소계 0)
  - 주식/유가증권: 없음 (소계 0)
  - 비품: 없음 (소계 0)
  - 현금 및 예금: 예금 1개, 농협 301-0310-6010-81, 가액 0원
  - 그 밖의 재산: 없음 (소계 0)
  - 합계: 0원
  - 회계책임자: 신하섭
  - 현금및예금 세부내역: 예금 1, 농협 301-0310-6010-81, 가액 0
```

#### TC-SUP-011: 후원회 수입부 출력 - 과목별 검증
```
전제조건: 후원회 로그인, 수입데이터 존재
테스트 순서:
  1. 보고관리 → 보고서 및 과목별 수입지출부 출력
  2. 과목별로 수입부 확인
기대결과 (제출문서.pdf 기준):
  [전년도이월 수입부]
  - 2022-04-19: 전회보고시 누계액 0원
  - 합계 0원, 첨부분 0건, 생략분 0건

  [기명후원금 수입부]
  - 2022-04-29: 기명후원금 1건, 200,000원 (누계 200,000)
  - 2022-05-04: 기명후원금 1건, 100,000원 (누계 300,000)
  - 2022-05-09 ~ 2022-06-01: 나머지 건
  - 2022-05-14: 김영환, 1972-08-15, 경기도 군포시..., 회사원, 500,000원 (30만원 초과 → 인적사항 표시)
  - 일자별 합산 시 당일 여러 건은 "기명후원금 N건"으로 합산 표시
  - 30만원 초과 건만 인적사항(성명, 생년월일, 주소, 직업, 전화번호) 표시
```

#### TC-SUP-012: 후원금 기부자 조회 - 1회 30만원 초과
```
전제조건: 후원회 로그인, 기명후원금 데이터
테스트 순서:
  1. 보고관리 → 후원금 기부자 조회
  2. 구분: "1회 30만원 초과 기부자" 선택
  3. 후원기간: 2022-04-20 ~ 2022-06-21
  4. [조회]
기대결과:
  - 1회 30만원 초과 기부자 목록 (500,000원 기부자 등)
  - 성명, 생년월일, 주소, 직업, 금회번호, 후원일자, 금액, 내역, 비고
```

#### TC-SUP-013: 후원금 기부자 조회 - 연간 300만원 초과
```
테스트 순서:
  1. 구분: "연간 300만원 초과 기부자" 선택
  2. [조회]
기대결과:
  - 후원회 유형별 한도액 적용:
    · (예비)후보자후원회: 300만원
    · 국회의원후원회, 당대표경선후보자후원회: 300만원
    · 대통령선거후보자후원회: 500만원
  - 한도 초과 기부자 목록
```

#### TC-SUP-014: 후원인 기부한도 검증 (법 제11조)
```
테스트:
  후원인은 연간 모든 후원금 합쳐서 2천만원 초과 불가
  후원회 지정권자가 예비후보자→후보자 된 경우 합하여 500만원까지 기부 가능
기대결과:
  - 2천만원 초과 시 경고
  - 후원회별 연간 모금한도 검증:
    · 지방자치단체장후원회: 5백만원
    · 시·도의회의원선거후원회: 2백만원
    · 자치구·시·군의회의원선거후원회: 1백만원
```

#### TC-SUP-015: 후원회 연간 모금·기부 한도 검증
```
테스트:
  - 후원회 연간 모금기부 한도액:
    · 지방자치단체장선거: 선거비용제한액의 100분의 50
    · 시·도의회의원선거후원회: 5천만원
    · 자치구·시·군의회의원선거후원회: 3천만원
  - 제9회 지방선거: 지역구 후보자로 등록한 지방의회의원후원회는 2배까지 모금가능
기대결과:
  - 모금한도 근접 시 경고 메시지
  - 한도 초과 시 계좌 폐쇄 등 적절한 조치 안내
```

#### TC-SUP-016: 후원회 일괄등록 양식 구조 검증 (16컬럼)
```
테스트: 기명/익명 일괄등록 양식의 컬럼 구조 확인
기대결과:
  A: *계정, B: *과목, C: *수입일자, D: *내역, E: *수입제공자,
  F: 생년월일(사업자번호), G: 우편번호, H: 주소, I: 상세주소,
  J: 직업(업종), K: 전화번호, L: *금액, M: *증빙서첨부,
  N: 영수증번호/미첨부사유, O: *수입지출처구분, P: 비고
  (* = 필수항목)

  기명후원금: A=수입, B=기명후원금, M=Y, O=개인, 인적정보(F~K) 입력
  익명후원금: A=수입, B=익명후원금, E=익명, M=N, N=익명, F~K 비어있음
```

#### TC-SUP-017: 후원회 회계보고서 보고사항 전체 문서 목록 검증
```
테스트: 후원회 로그인 후 보고서 일괄출력 시 아래 문서 모두 출력 가능 확인
기대결과 (도움말 p.47 기준):
  1) 재산명세서
  2) 재산 구분별 세부내역서
  3) 후원회의 수입·지출 총괄표
  4) 수입부 표지
  5) (수입)계정 표지       ┐ 모든 수입 계정·과목에
  6) (수입)과목 표지       ├ 대해 5~7번 반복
  7) (수입)과목별 내역     ┘
  8) 지출부 표지
  9) (지출)계정 표지       ┐ 모든 지출 계정·과목에
  10) (지출)과목 표지      ├ 대해 9~11번 반복
  11) (지출)과목별 내역    ┘
  12) (지출)과목별 내역 1회 30만원 초과 기부자 명단
  13) 연간 300만원 초과 기부자 명단
  → 감사의견서 등은 일괄출력에 포함되지 않으므로 별도 출력
```

#### TC-SUP-018: 후원회 회계책임자 인계·인수서 생성
```
테스트: 회계책임자 변경 시 인계인수 내역 확인
기대결과 (가이드북 p.41-42 기준):
  인계·인수서 포함 항목:
  - 인계자(전 회계책임자): 성명, 주민등록번호, 주소, 전화번호
  - 인수자(현 회계책임자): 성명, 주민등록번호, 주소, 전화번호
  - 인계·인수내역 (별지):
    · 정치자금 수입지출보고서 출력물 1부
    · 정치자금 수입지출부 출력물 1부
    · 정치자금 회계관리 프로그램 백업파일 1부
    · 영수증 등 지출증빙서류 (총매수 기재)
    · 신고된 예금계좌: 수입용(은행명, 계좌번호, 통장잔액), 지출용
    · 체크카드 정보
    · 비품(책상, 의자, 컴퓨터 등 수량/금액)
```

---

### E.17 신규 구현 기능 테스트 (2026-03-24 추가)

#### TC-NEW-001: SQLite .db 내보내기 (제출파일 생성)
```
전제조건: 수입/지출 데이터가 등록된 (예비)후보자 또는 후원회 계정으로 로그인
테스트 순서:
  1. 보고관리 → 제출파일생성
  2. 미리보기 클릭 → 수입/지출/수입지출처/재산 건수 확인
  3. [제출파일 생성 (.db)] 클릭
  4. .db 파일 다운로드 확인
기대결과:
  - SQLite 3.x 형식의 .db 파일 다운로드
  - 테이블명/컬럼명이 원본 대문자 형식 (ACC_BOOK, CUSTOMER 등)
  - 파일명: "{기관명}(자체분).db"
  - 데이터 건수가 미리보기와 일치
```

#### TC-NEW-002: SQLite .db 가져오기
```
전제조건: Fund_Data_1.db 등 레거시 .db 파일 보유
테스트 순서:
  1. 시스템관리 → 자료 백업 및 복구
  2. "SQLite .db 가져오기" 섹션에서 .db 파일 선택
  3. [가져오기] 클릭 → 확인 팝업에서 [확인]
  4. 결과 리포트 확인
기대결과:
  - 모든 테이블 0건 실패
  - CUSTOMER, ACC_BOOK, ESTATE 등 데이터 정상 가져오기
  - 빈 문자열이 있는 INTEGER 컬럼(sido 등)에서 오류 없음
  - org_id가 현재 사용기관에 맞게 리매핑
  - 가져오기 이력이 백업/복구 이력에 기록
```

#### TC-NEW-003: 정당 .txt 제출파일 생성
```
전제조건: 정당(시도당/정책연구소/정당선거사무소) 계정으로 로그인
테스트 순서:
  1. 보고관리 → 제출파일생성
  2. [제출파일 생성 (.txt)] 클릭
기대결과:
  - "{기관명}(자체분).txt" 파일 다운로드
  - 탭 구분자 형식, [기관정보]/[수입지출내역]/[재산내역]/[합계] 섹션 포함
  - 중앙당은 버튼 비활성화 (취합만 가능)
```

#### TC-NEW-004: 감사의견서 출력 (선관위 PDF 포맷)
```
전제조건: 후원회 계정으로 로그인, OPINION 데이터 입력
참고 PDF: 중앙선거관리위원회_정치자금회계관리2/후원회/감사의견.pdf
테스트 순서:
  1. 보고관리 → 감사의견서 등 출력
  2. 감사의견서 탭 → 회계기간, 감사기간, 감사의견, 감사자 정보 입력
  3. [저장] → [출력] 클릭
기대결과:
  - 테두리 박스 안에 전체 내용 표시
  - 「정치자금법」 제41조제1항 법률 인용문
  - "다 음" 가운데 정렬
  - 1. 감사개요 (가. 감사기간 YYYY. MM. DD. 형식 / 나. 감사대상)
  - 2. 감사의견 (법률 인용)
  - 3. 특기사항
  - 감사자 서명란 (직위/주소/성명 + (인))
  - 하단 주석 ①~④
```

#### TC-NEW-005: 심사의결서 출력 (선관위 PDF 포맷)
```
전제조건: TC-NEW-004 완료
참고 PDF: 중앙선거관리위원회_정치자금회계관리2/후원회/심사의결서.pdf
테스트 순서:
  1. 심사의결서 탭 → 수입지출기간, 재산/수입/지출/잔액, 운영위원 입력
  2. [저장] → [출력] 클릭
기대결과:
  - 우상단 "원본대조필 (인)" 박스
  - 제목: "재산 및 수입·지출상황 등의 심사의결서"
  - 1. 의결주문 + 가. 수입·지출기간 / 나. 재산 / 다. 수입·지출내역 (○수입/○지출/○잔액)
  - 기관명 + 예산결산위원회
  - 운영위원 5인 서명란 (직 위：운영위원 성 명：OOO (인))
  - 2. 참고사항 + 하단 주석 ①~④
```

#### TC-NEW-006: 회계보고서 제출문서 출력
```
전제조건: TC-NEW-004 완료
참고 PDF: 중앙선거관리위원회_정치자금회계관리2/후원회/제출문서.pdf
테스트 순서:
  1. 회계보고서 제출문서 탭 → 문서번호, 시행일자, 수신/발신 기관 입력
  2. [출력] 클릭
기대결과:
  - 문서번호/시행일자/수신/발신 정보
  - 제목: "회 계 보 고 서  제 출"
  - 법적 문구 (정치자금법 제40조)
  - 별첨 5개 항목
  - 일자 + 기관명 + 회계책임자 OOO (인)
```

#### TC-NEW-007: 후원금 기부자 반환자료저장
```
전제조건: 후원회 계정, 1회 30만원 초과 기부자 존재
테스트 순서:
  1. 보고관리 → 후원금 기부자 조회
  2. "1회 30만원 초과 기부자" 선택 → [조회]
  3. 기부자 체크박스 선택 → [반환자료저장]
기대결과:
  - 선택한 기부자의 acc_book.return_yn = 'Y'로 업데이트
  - 반환 표시(주황색 "반환" 텍스트) 확인
  - [반환취소]로 복원 가능
```

#### TC-NEW-008: 국세청 자료추출 엑셀 다운로드
```
전제조건: 후원회 계정, 기부자 데이터 존재
테스트 순서:
  1. "국세청 자료추출" 선택 → [조회]
  2. [국세청 자료추출 (엑셀)] 클릭
기대결과:
  - 전체 기부자 목록이 포함된 .xlsx 파일 다운로드
  - 컬럼: 번호, 성명, 생년월일, 주소, 직업, 전화번호, 후원건수, 후원금액
  - 합계행 포함
```

#### TC-NEW-009: 결산작업 확정 및 저장
```
전제조건: 수입/지출/재산 데이터 입력 완료
테스트 순서:
  1. 보고관리 → 결산작업
  2. 결산기간 입력 → [결산]
  3. 잔액과 재산(현금및예금) 일치 확인
  4. [결산확정] 클릭
기대결과:
  - organ.acc_from/acc_to 업데이트
  - opinion에 재산/수입/지출/잔액 금액 저장
  - "결산 확정됨" 표시
  - 잔액 ≠ 재산 시 확정 버튼 비활성화
```

#### TC-NEW-010: 컬럼 정렬 기능
```
테스트 순서:
  1. 수입내역관리 화면에서 "금액" 헤더 클릭
  2. 다시 클릭
  3. "수입일자" 헤더 클릭
기대결과:
  - 첫 클릭: 금액 오름차순 (▲ 표시)
  - 두번째 클릭: 금액 내림차순 (▼ 표시)
  - 다른 컬럼 클릭: 해당 컬럼 오름차순, 이전 정렬 해제
```

#### TC-NEW-011: 우편번호 검색
```
테스트 순서:
  1. 수입지출처관리 → [주소검색] 클릭
  2. "세종대로" 입력 → [검색]
기대결과:
  - 서울특별시 종로구 세종대로 등 검색 결과 표시
  - 우편번호 5자리 정상 표시 (앞자리 0 보존, 예: 03186)
  - 선택 시 우편번호/주소 자동 입력
```

#### TC-NEW-012: 사용기관 전환/추가
```
전제조건: 1개 이상 사용기관이 등록된 계정으로 로그인
테스트 순서:
  1. 대시보드 사이드바 상단 "사용기관 전환/추가" 클릭
  2. 사용기관 선택 화면 표시 확인
  3. [사용기관 신규등록] 클릭
  4. 후원회 등 새 기관 정보 입력 → [등록]
  5. 사용기관 선택 화면에서 새 기관 확인
  6. 새 기관 클릭 → 대시보드 전환
기대결과:
  - 동일 이메일에 2개 이상 기관 연결
  - 사용기관 선택 화면에 모든 기관 표시
  - 기관별로 다른 메뉴 구성 (후보자 vs 후원회)
  - 기관 간 자유로운 전환
```

#### TC-NEW-013: 수입부 엑셀 출력
```
전제조건: 수입내역이 등록된 상태
테스트 순서:
  1. 수입내역관리 → [수입부 엑셀] 클릭
기대결과:
  - .xlsx 파일 다운로드
  - 헤더: "정 치 자 금  수 입 · 지 출 부"
  - 컬럼: 년월일, 내역, 수입액(금회/누계), 지출액(금회/누계), 잔액, 성명, 생년월일, 주소 등
  - 수입제공자 정보(customer join) 정상 표시
  - 누계/잔액 자동 계산
```

#### TC-NEW-014: SQLite .db 가져오기 — 익명 수입제공자 처리
```
전제조건: CUST_ID=-999 (익명) 레코드가 포함된 .db 파일
테스트 순서:
  1. 시스템관리 → 자료 백업 및 복구
  2. Fund_Data_2.db (후원회, 익명 13건 포함) 업로드
  3. [가져오기] 실행
기대결과:
  - ACC_BOOK 55건 전체 성공 (0건 실패)
  - 익명 레코드 13건이 "익명" customer (자동 생성)에 매핑
  - FK 제약 위반 없음
```

#### TC-NEW-015: SQLite .db 가져오기 — OPINION org_id 리매핑
```
전제조건: 원본 .db의 OPINION.org_id가 현재 Supabase org_id와 다른 경우
테스트 순서:
  1. Fund_Data_2.db (원본 org_id=2) → 현재 org_id=8에 가져오기
기대결과:
  - OPINION 1건 성공 (0건 실패)
  - opinion.org_id가 현재 기관 ID(8)로 저장됨
```

#### TC-NEW-016: 수입지출내역 일괄등록 — 후원회 엑셀 업로드
```
전제조건: 후원회 계정, 익명수입자일괄등록 엑셀 파일
테스트 순서:
  1. 정치자금관리 → 수입지출내역 일괄등록
  2. 수입내역 탭 → 엑셀 파일 선택
  3. [저장 전 자료확인] → 오류 없음
  4. [저장]
기대결과:
  - 전체 건수 성공 (API 경유 batch_insert)
  - 익명 수입제공자는 "익명" customer에 매핑
  - RLS 우회 정상 동작
```

#### TC-NEW-017: 대시보드 메인 네비게이션
```
테스트 순서:
  1. 사이드바 상단 "정치자금 회계관리" 텍스트 클릭
기대결과:
  - /dashboard 메인 페이지로 이동
  - 수입/지출/잔액 요약 카드 표시
```

#### TC-NEW-018: 사용기관 구분 변경 불가 (로그인 후)
```
테스트 순서:
  1. 로그인 후 기본자료관리 → 사용기관관리
  2. 사용기관 구분 드롭다운 확인
기대결과:
  - 드롭다운이 disabled 상태
  - "신규등록 시에만 변경 가능" 안내 문구 표시
  - 기관명, 대표자명 등 다른 필드는 수정 가능
```

---

### E.18 테스트 데이터 참조 (매뉴얼 기반, 구 E.16)

#### (예비)후보자 수입 데이터 예시
| 순번 | 계정 | 과목 | 수입일자 | 금액 | 수입제공자 |
|------|------|------|----------|------|----------|
| 1 | 후보자등자산 | 선거비용 | 2026-02-28 | 5,000,000 | 홍길동 |
| 2 | 후보자등자산 | 선거비용외정치자금 | 2026-03-01 | 10,000,000 | 홍길동 |
| 3 | 후보자등자산 | 선거비용 | 2026-03-03 | 5,000,000 | 홍길동 |
| 4 | 후원회기부금 | 선거비용외정치자금 | 2026-03-06 | 6,000,000 | 후원회 |

#### (예비)후보자 지출 데이터 예시
| 순번 | 계정 | 과목 | 지출일자 | 금액 | 지출유형(대/중/소) | 지출대상자 |
|------|------|------|----------|------|----------------|----------|
| 1 | 후보자등자산 | 선거비용 | 2026-05-17 | 500,000 | 인쇄물/인쇄비/... | 미크벨 |
| 2 | 후보자등자산 | 선거비용외정치자금 | 2026-05-18 | 1,000,000 | 길 | ... |
| 3 | 후원회기부금 | 선거비용 | 2026-05-19 | 800,000 | ... | 영영창고 |
| 4 | 후원회기부금 | 선거비용외정치자금 | 2026-05-20 | 1,000,000 | ... | 사무직원 |

#### 후원회 수입 데이터 예시
| 순번 | 계정 | 과목 | 수입일자 | 금액 | 수입제공자 |
|------|------|------|----------|------|----------|
| 1 | 수입 | 기명후원금 | 2026-02-27 | 2,000,000 | 한라산 |
| 2 | 수입 | 기명후원금 | 2026-02-28 | 1,000,000 | 박두산 |
| 3 | 수입 | 기명후원금 | 2026-03-02 | 1,000,000 | 금강산 |
| 4 | 수입 | 기명후원금 | 2026-03-04 | 1,500,000 | 소백산 |
| 5 | 수입 | 기명후원금 | 2026-03-06 | 500,000 | 남산 |
| 6 | 수입 | 기명후원금 | 2026-03-07 | 100,000 | 서오릉 |

#### 후원회 지출 데이터 예시
| 순번 | 계정 | 과목 | 지출일자 | 금액 | 지출대상자 |
|------|------|------|----------|------|----------|
| 1 | 지출 | 기부금 | 2026-05-13 | 1,000,000 | 홍길동 |
| 2 | 지출 | 후원금모금경비 | 2026-05-14 | 6,190 | 안산선부동우체국 |
| 3 | 지출 | 그밖의경비 | 2026-06-01 | 500 | 농협은행 |
| 4 | 지출 | 그밖의경비 | 2026-06-02 | 1,870 | 토스페이먼츠 |
