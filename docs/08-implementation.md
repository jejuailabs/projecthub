# 08. 구현 순서와 단계별 완료 조건

설계는 확정했지만 모든 Phase의 실행 상태는 미착수다. 각 Phase는 계획→구현→typecheck→관련 테스트→리뷰→수정→증거 기록 순으로 진행한다. P0 범위를 중간에 P1로 옮겨 완료를 선언하지 않는다.

## Phase 0 — 실행 기반과 외부 전제 검증

Next.js/TypeScript/Tailwind/shadcn/Prisma/Auth.js/next-intl/Vitest/Playwright, 환경 검증, lockfile, CI, mock provider를 구성한다. PostgreSQL과 Vercel preview를 연결하고 분 단위 cron/실행 시간/DB 연결 제한을 확인한다.

Google·Notion·GitHub·Vercel 앱 등록, callback URL과 scope, 실제 계정 설치 가능 여부/API 버전을 검증한다. Notion data source 속성과 쓰기 capability를 확인한다. OpenAI 지원 모델을 10의 후보 fixture로 평가하고 모델 ID/스키마/프롬프트 버전을 고정한다. 실제 비밀이 없으면 mock 기반 개발은 가능하지만 live 검증은 차단 상태로 남긴다.

완료: 빈 앱 preview, CI lint/typecheck/test/build, .env.example, provider 사전 점검 결과. 관련 판정 A12.

## Phase 1 — 인증과 데이터 경계

Google 로그인, User/Workspace/Membership, 서버 권한, schema migration과 seed, 관리자 bootstrap. 완료: 동시 첫 로그인 중복 없음, workspace 침범/VIEWER 쓰기/admin 우회 차단. A01.

## Phase 2 — 디자인 기반과 수동 프로젝트

테마/언어/시간대, app shell, Project CRUD, 상태·업무 단계, 담당자·다음 행동·일정·대기 사유, optimistic concurrency, 종료/보관/휴지통. 완료: 외부 계정 없이 생성→다음 행동 완료→종료→복원 흐름. A02/A03/A11.

## Phase 3 — 기획자 대시보드

주의 규칙/최신성/출처, List/Grid/Board, 검색/필터/정렬, 최근 열기, 원본 링크 역할, 기본 이력. 완료: 늦은 일정과 오래된 정보를 구분하고 키보드로 단계 변경/원본 복귀. A04/A05/A10.

## Phase 4 — 작업 큐와 연동 기반

Integration 암호화, callback, provider adapter, SyncJob outbox, lease/retry/cursor, 멱등성, 기능 플래그, 영역 오류. 완료: worker 중단/재시도/중복 요청에도 업무 저장 유지. A06/A09/A12의 공통 기반.

## Phase 5 — Notion 읽기와 필드 기준

데이터 소스/페이지 선택 가져오기, 속성 매핑, NOTION 기준 읽기 필드, 원본 이동, 상태·단계 그룹 검증. 완료: 재가져오기 중복 없음, 속성/권한 변화 감지. A06/A09.

## Phase 6 — 회의록/텍스트 생성

입력/전송 안내, 구조화 추출, 근거/모호성 표시, 후보 검토, 확정 멱등성, 한도/만료/삭제. 완료: 원문 저장/로그 유출 없이 검토된 프로젝트만 생성; 추출 실패 때 직접 생성 가능. A08.

## Phase 7 — 단계별 Notion 쓰기

새 페이지/기존 페이지 연결, 단계 활성화, Hub 식별자, 단방향 및 제한적 양방향, baseline/충돌 해결, read-back, 응답 유실 복구. 완료: 실제 Notion E2E와 안전성 시나리오 통과. A09.

## Phase 8 — GitHub/Vercel과 소스 병합

저장소/배포 선택 가져오기, 링크 추천, 사용자 확인 병합/분리/조건부 Undo, 활동 정규화. 완료: 세 서비스가 같은 프로젝트로 연결되고 상태는 사용자/기준 필드만 변경. A06/A07/A10.

## Phase 9 — 운영과 화면 완성

관리자 지표/작업 진단, 보관 기간 정리, 모든 빈/오류 상태, 접근성, ko/en와 dark/light, 목록 성능. 완료: A11/A12 및 권한·비밀 노출 회귀 테스트.

## Phase 10 — 운영 배포와 파일럿

실제 계정 smoke test, migration/backup 복구 리허설, 운영 문서, 배포/롤백, A01~A12 증거표. 배포 후 실제 기획자 파일럿을 시작하고 01의 지표를 별도 보고한다.

기술 MVP 출시는 모든 P0 판정이 통과한 시점이며, 제품 가치 검증 완료는 파일럿 결과가 있어야 한다. 파일럿이 아직이면 '가치 입증'이라고 쓰지 않는다.

## 단계별 기록 양식

범위/변경 파일, 실행한 검증 명령과 결과, 화면 확인 증거, 실제 provider와 mock 구분, 미해결 문제, 배포 영향, 다음 Phase 진입 가능 여부를 남긴다. 테스트가 없는 문서 수정과 실행 테스트 통과를 혼동하지 않는다.
