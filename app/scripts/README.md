# 데이터베이스 스크립트

## 실행 순서

### 1. Supabase에 테이블 생성
```bash
# Supabase 대시보드 → SQL Editor에서 실행
# 1. https://supabase.com/dashboard 로그인
# 2. 프로젝트 선택 (ukviuatpsjvpdsklgnph)
# 3. SQL Editor → 001_create_tables.sql 내용 붙여넣기 → Run
```

### 2. RLS 보완 및 스키마 수정
```bash
# SQL Editor → 002_fix_rls_and_schema.sql 내용 붙여넣기 → Run
```

### 3. SQLite → Supabase 마이그레이션
```bash
cd app

# .env.local에 SERVICE_ROLE_KEY 추가 필요
# SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Master(코드) + Data(실데이터) 함께 마이그레이션
node scripts/migrate-sqlite-to-supabase.mjs \
  ../중앙선거관리위원회_정치자금회계관리2/Data/Fund_Master.db \
  ../중앙선거관리위원회_정치자금회계관리2/Data/Fund_Data_1.db
```

### 4. 마이그레이션 검증
```bash
node scripts/003_verify_migration.mjs
```

### 5. 개발 서버 실행
```bash
npm run dev
```

주의: 한글 경로에서 Turbopack 버그가 있으므로, 빌드 시에는 ASCII 경로에서 실행합니다.
```bash
cp -R app /tmp/pfund-app && cd /tmp/pfund-app && npx next build
```

## 파일 설명

| 파일 | 설명 |
|------|------|
| `001_create_tables.sql` | 전체 PostgreSQL DDL + RLS 정책 + 함수 |
| `002_fix_rls_and_schema.sql` | RLS 누락 보완 + col_organ/sum_rept 스키마 수정 + 인덱스 추가 |
| `migrate-sqlite-to-supabase.mjs` | SQLite .db → Supabase 마이그레이션 (sql.js 사용) |
| `003_verify_migration.mjs` | 마이그레이션 검증 (레코드 수, 참조 무결성, 잔액) |

## RLS 정책 요약

| 테이블 | 정책 |
|--------|------|
| `acc_book`, `acc_book_bak`, `estate`, `opinion`, `backup_history` | org_id → user_organ → auth.uid() |
| `codeset`, `codevalue`, `acc_rel`, `acc_rel2` | 인증 사용자 읽기 + 쓰기(코드관리) |
| `organ` | 읽기: 전체, 쓰기: 자신의 기관만, 등록: 인증 사용자 |
| `customer`, `customer_addr` | 인증 사용자 전체 접근 (공유) |
| `user_organ` | 자신의 매핑만 조회/등록 |
| `col_organ`, `sum_rept` | org_id 기반 접근 |
| `accbooksend`, `alarm` | 인증 사용자 전체 접근 |
