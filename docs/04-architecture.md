# 04. 아키텍처와 실행 계약

## 1. 고정 스택

Next.js App Router/TypeScript strict, Tailwind + shadcn/ui, Supabase PostgreSQL/SQL migration/RPC/RLS, Supabase Auth Google 인증, next-intl, Zod/React Hook Form, Vitest/Playwright, Vercel. 구체 버전은 Phase 0의 호환성 검증 후 lockfile에 고정한다. 현재 구현 상태는 13-development-status.md를 따른다.

UI → Application Services → Domain → Repositories → DB / Provider adapters 계층을 둔다. 외부 응답은 adapter가 정규화하고 UI에서 provider JSON을 직접 읽지 않는다.

## 2. 모듈과 경로

- app/[locale]/(auth), (app)/dashboard, projects, integrations, settings, admin.
- app/api/auth, integrations/[provider]/callback, projects, drafts, sync, jobs/dispatch.
- modules/auth, workspace, projects, intake, sources, sync, admin.
- lib/db, env, encryption, logging, time; messages/ko.json, en.json.

초기 조회/권한/DB/외부 API는 서버, 필터·모달·드래그·테마는 client다. 프로젝트 화면 초기 요청은 외부 API를 기다리지 않고 저장된 snapshot을 읽는다.

## 3. 서비스 명령

| 명령 | 계약 |
| --- | --- |
| createProjectsFromDraft | 검토한 candidate IDs/수정 값 + 요청 키; 한 트랜잭션으로 저장 |
| updateProject | project ID + expected_version + 변경 필드; 서버의 필드 기준/권한 검증 |
| completeNextAction | 활성 행동과 버전 확인 후 이력 기록/비우기 |
| importSources | 선택한 정규화 ID와 대상 project; workspace 범위 중복 방지 |
| configureNotionBinding | 대상 검증·매핑·초기 값 선택·명시된 쓰기 확인 |
| merge/unmerge | 관련 project/source 버전 검사, 트랜잭션과 감사 기록 |
| requestSync | 권한 확인 후 작업 enqueue; 중복 실행 병합 |
| resolveConflict | 충돌 버전과 최신 양쪽 값 확인 후 선택값 확정 |

모든 변경은 요청 크기·스키마·허용 필드 검증을 거친다. 일반 편집은 project.version 기반 낙관적 잠금으로 stale 요청에 409를 반환한다. 프로젝트 생성/초안 확정/가져오기는 workspace+operation+idempotency_key를 기준으로 같은 요청의 결과를 재사용하며 다른 본문 재사용은 409다.

## 4. 비동기 작업

PostgreSQL SyncJob을 durable outbox/작업 큐로 사용한다. 업무 저장과 enqueue는 같은 트랜잭션이다. 저장 성공과 외부 동기화 성공을 별도로 표시한다. 프로세스 내 타이머와 응답 이후 fire-and-forget을 내구성 있는 작업으로 취급하지 않는다.

Vercel Cron은 매분 due 작업을 dispatch하고, provider 수신 스케줄은 기본 6시간이다. 분 단위 cron을 지원하는 배포 구성이 운영 전제다. 요청당 최대 20개 claim, 45초 예산, 장시간 목록은 cursor로 분할한다. 환경의 실행 제한을 Phase 0에서 검증한다. 송신은 정상 조건에서 2분 이내 처리 목표이며 보장 SLA는 아니다.

작업 상태: QUEUED/RUNNING/RETRY_WAIT/SUCCEEDED/FAILED/NEEDS_REVIEW/CANCELLED. SELECT FOR UPDATE SKIP LOCKED 또는 동등한 원자적 claim으로 lease를 획득한다. lease 만료 120초, worker는 만료 전 갱신하고 token/version이 일치할 때만 완료 기록한다. 동일 binding의 송신은 직렬화한다. 외부 호출 timeout은 lease보다 짧게 둔다.

재시도는 최초 이후 최대 5회, 지수 백오프+지터, 최대 1시간 간격이며 Retry-After가 있으면 우선한다. 인증/매핑 오류는 재시도 대신 사용자 액션을 요구한다. 생성 결과 불명확은 자동 재생성이 아니라 NEEDS_REVIEW다. 장애 복구 후 마지막 성공 cursor부터 이어간다.

## 5. 동기화와 최신성

Provider별 listing/pagination/normalization은 공통 작업 큐를 사용한다. 외부 변경은 필드 기준 정책을 거쳐 적용하고 Activity/SyncState를 갱신한다. Notion의 세 방향/충돌 계약은 [10](10-text-notion-sync.md), 최신성·주의 계산은 [11](11-planner-workflow.md)에만 정의한다.

수신 작업과 송신 작업은 binding 잠금을 공유한다. 네트워크 요청 도중 DB 트랜잭션을 오래 열지 않는다. 원격 읽기 → 로컬 버전 재검증 → 최소 patch → read-back → 결과 저장 순서로 처리한다. 외부 동시 편집을 완전히 잠글 수 없으므로 경쟁 구간과 복구 이력을 유지한다.

## 6. 텍스트 추출

서버의 OpenAI Responses API Structured Outputs adapter를 사용한다. 모델은 OPENAI_EXTRACTION_MODEL로 설정하고 P0 평가를 통과한 지원 모델만 배포한다. 자동 모델 변경은 없다. 호출은 store:false, 도구 없이, 제한된 출력 스키마를 사용한다. 상세 제한·보관·실패 처리는 [10](10-text-notion-sync.md)을 따른다.

## 7. 보안과 운영

모든 query/command에 authorized workspace를 전달한다. OAuth state는 사용자·workspace·provider·단기 nonce에 바인딩한다. redirect는 allowlist, callback은 서버에서 검증한다. 암호화 키는 서버 환경에 두고 토큰은 키 버전+nonce+암호문으로 저장한다.

수동 URL은 http/https만 허용하고 외부 링크에 안전한 rel을 적용한다. P0에서는 입력 URL을 서버에서 임의 fetch해 미리보기를 만들지 않는다. DB와 provider 오류는 내부 코드로 변환하고 민감 본문을 로그에서 제거한다.

관측 지표: queue age, provider별 성공/실패, 최신성 비율, 충돌 수, 추출 지연/비용/실패. 구조화 로그에는 request/job/workspace 식별자와 오류 코드만 넣는다. 영역별 오류 경계를 두고 한 provider 실패가 대시보드를 막지 않게 한다.

## 8. 성능 목표

fixture workspace 200개 프로젝트/1,000개 소스에서 페이지당 50행, 키셋 pagination과 필요한 색인을 사용한다. 외부 API 없는 warm 서버 응답 p95 800ms 이내, 정해진 데스크톱 시험 환경에서 주요 목록 LCP 2.5초 이내를 목표로 측정 조건과 함께 기록한다. 이력은 20개씩 지연 로드한다.
