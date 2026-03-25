# Supabase Gap Analysis Report

> **Feature**: Supabase 연동 + 챗봇 회계 데이터 통합
> **Date**: 2026-03-25
> **Match Rate**: 58%

## Executive Summary

| 관점 | 내용 |
|------|------|
| Problem | 챗봇 API에서 orgId 하드코딩, RLS 미적용, 인증 없음으로 데이터 보안 취약 |
| Solution | orgId 동적 전달 완료, RLS 강제 적용 및 인증 추가 필요 |
| Function UX Effect | 챗봇이 실제 회계 데이터(2022년 오준석 후보)를 정확히 조회하여 답변 |
| Core Value | 정치자금 회계 데이터 기반 AI 상담 기능 구현 |

## Overall Scores

| Category | Score | Status |
|----------|:-----:|:------:|
| Code Quality | 62% | ⚠️ |
| Security | 35% | ❌ |
| Architecture | 55% | ⚠️ |
| Data Flow Integrity | 78% | ⚠️ |
| Error Handling | 58% | ⚠️ |
| Query Efficiency | 50% | ⚠️ |
| Convention | 70% | ⚠️ |
| **Overall** | **58%** | **❌** |

## Critical Issues (P0)

### 1. RLS 완전 우회 (Security: 35%)
- 모든 API 라우트가 `SUPABASE_SERVICE_ROLE_KEY`로 Supabase 클라이언트 생성
- `001_create_tables.sql`에 정의된 RLS 정책이 100% 무력화
- **Fix**: `createSupabaseServer()` (lib/supabase/server.ts)를 사용하여 유저 세션 기반 클라이언트로 교체

### 2. 챗봇 API 인증 없음
- `POST /api/chat`에 `auth.getUser()` 체크 없음
- 비인증 사용자가 모든 기관의 회계 데이터 조회 가능
- **Fix**: API 핸들러 시작부에 인증 확인 추가

### 3. orgId `Number(undefined)=NaN` 버그
- `context.orgId`가 undefined일 때 `Number(undefined)`가 `NaN` 반환
- NaN은 falsy이므로 전체 기관 데이터 조회 fallback 발동
- **Fix**: `const orgId = context?.orgId ? Number(context.orgId) : undefined` → 정수 검증 추가

### 4. 입력 길이 미검증
- `message` 파라미터에 최대 길이 제한 없음
- 대용량 페이로드로 비용 증폭 공격 가능
- **Fix**: message 최대 2000자 제한

## High Issues (P1)

### 5. N+1 쿼리 (Query Efficiency: 50%)
- `fetchAccountingContext`에서 기관별 2개 순차 쿼리 (calculate_balance + organ name)
- N개 기관이면 2N개 쿼리 발생
- **Fix**: organ 정보를 한 번에 `.in()` 쿼리로 조회

### 6. orgId 소유권 미검증
- 클라이언트가 보낸 orgId에 대해 해당 유저 소속 여부 미확인
- 타 기관 데이터 접근 가능
- **Fix**: `user_organ` 테이블에서 소유권 확인

### 7. 미사용 의존성
- `@pinecone-database/pinecone` - RAG가 pgvector로 이전되었으나 package.json에 잔존

## Data Flow Analysis

```
[Auth Store] → [ChatBubble] → [useChat] → [API /chat] → [Supabase]
 orgId:number   orgId||undef   context.orgId  Number(ctx.orgId)  .in("org_id", ids)
                orgName        orgName        fetchAccountingContext()
                orgType        orgType        calculate_balance(p_org_id)
```

- orgId 전달 흐름: ✅ 정상 (이번 수정으로 해결)
- 인증 흐름: ❌ 미구현
- RLS 적용: ❌ Service Role Key로 우회

## Architecture Issues

| 설계 의도 | 실제 구현 |
|-----------|-----------|
| `createSupabaseServer()` with user session | Raw `createClient` with Service Role Key |
| RLS 기반 다중 기관 접근 제어 | RLS 100% 무력화 |
| Pinecone RAG | Supabase pgvector (미사용 dep 잔존) |

## Recommended Actions

| Priority | Action | Impact |
|----------|--------|--------|
| P0 | API 라우트에서 Service Role Key → 유저 세션 클라이언트로 교체 | RLS 활성화 |
| P0 | 챗봇 API에 인증 체크 추가 | 비인증 접근 차단 |
| P0 | orgId 정수 검증 + 소유권 확인 | 타기관 데이터 접근 차단 |
| P0 | 메시지 길이 제한 (2000자) | 비용 증폭 공격 방지 |
| P1 | N+1 쿼리 최적화 | 응답 속도 개선 |
| P1 | `@pinecone-database/pinecone` 제거 | 번들 크기 감소 |
| P1 | `.env.example` 생성 | 개발 환경 설정 용이 |

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-03-25 | Initial analysis |
