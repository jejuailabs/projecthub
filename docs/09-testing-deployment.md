# 09. 테스트, 배포, 운영

## 1. 테스트 구성

Vitest로 도메인/adapter 단위 테스트, 실제 테스트 PostgreSQL로 repository/transaction 통합 테스트, Playwright로 사용자 E2E를 실행한다. 테스트용 provider 응답을 고정하고 live smoke는 별도로 실행한다. mock 통과를 실제 OAuth/쓰기 검증으로 대체하지 않는다.

| 영역 | 반드시 검증할 경계 |
| --- | --- |
| 업무 모델 | 상태/단계 독립, COMPLETED↔CLOSED, 대기 사유, 다음 행동 기한 정리 |
| 주의/최신성 | timezone 자정, 오늘/3일/12시간/7일 경계, PAUSED/종료 제외, 복수 배지 |
| 권한 | 로그아웃, 다른 workspace, VIEWER, MEMBER 설정 변경, SUPER_ADMIN 서버 검증 |
| 저장 | 동시 첫 로그인/편집, 409, draft 멱등 확정, scoped unique, rollback |
| 연동 | pagination, 일부 실패, 429/5xx, 토큰 철회, schema drift, 원본 접근 불가 |
| 작업 | 중복 enqueue/claim, lease 만료, worker 중단, 오래된 worker 완료 차단, 재시도 한도 |
| Notion | B/H/N 모든 분기, 방향/그룹 제약, 재충돌, 단계 대기/이탈/재진입, 응답 유실 |
| 생명주기 | 보관/휴지통/복원/30일 purge, in-flight 작업 대기, 외부 삭제 비전파 |
| 병합 | writer 충돌, source 이동, 활동 이동, 버전 변경 후 Undo 차단 |
| 추출 | 여러/0개 후보, 날짜 모호성, 지시문 주입, schema/refusal/timeout, 한도/원문 비저장 |

다른 workspace의 동일 external_id가 정상 공존하고 같은 workspace 중복은 차단되는지를 명시적으로 테스트한다. 데이터 유출/무단 쓰기/조용한 충돌 덮어쓰기는 출시 차단 결함이다.

## 2. E2E 시나리오

1. 수동: 로그인 → 프로젝트 → 담당자/다음 행동 → 기한 경과 표시 → 행동 완료 → 종료 → 보관/복원.
2. 기획자: 회의록 → 후보 검토 → PLANNING → Notion 연결 → 디자인 URL → REVIEW/WAITING → 원본 수정 → 수신 → 실행/종료.
3. 개발 연계: GitHub/Vercel 가져오기 → 기존 프로젝트 연결 → 배포 확인 → 사용자 상태 확정 → 원본 열기.
4. 장애: Notion 쓰기 실패 → Hub 저장 유지 → 재연결/재시도 → 성공; 서로 다른 동시 수정 → 충돌 → 해결.
5. 격리: 두 사용자/workspace, 동일 원본, 권한 조작, 관리자 경로 차단.

## 3. 화면과 품질

1440px/390px, dark/light, ko/en에서 목록·상세·초안·매핑·충돌·설정을 확인한다. 긴 제목, 날짜 없음, 0개/200개 프로젝트, 여러 오류 배지 fixture를 포함한다. 키보드만으로 생성/단계 변경/충돌 해결/원본 열기가 가능해야 한다.

성능 시험 조건과 수치는 04 기준으로 결과를 기록한다. 접근성 자동 검사와 수동 focus/대비 검사를 병행한다. 외부 provider 한 곳 실패 시 전체 대시보드가 표시되는지 확인한다.

## 4. 환경 계약

.env.example에는 이름과 설명만 넣고 실제 secret은 저장하지 않는다. 예시는 앱 내부 명칭이며 SDK 요구사항에 맞게 adapter에서 연결한다.

| 변수 | 용도/분류 |
| --- | --- |
| DATABASE_URL | 서버 PostgreSQL 연결 |
| AUTH_SECRET | 서버 인증 키 |
| GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET | 서버 로그인 OAuth |
| GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET | 서버 GitHub 연결 |
| VERCEL_CLIENT_ID / VERCEL_CLIENT_SECRET | 서버 Vercel 설치/연결 |
| NOTION_CLIENT_ID / NOTION_CLIENT_SECRET | 서버 Notion OAuth |
| NOTION_API_VERSION | 검증 후 고정한 provider API 버전 |
| TOKEN_ENCRYPTION_KEY / TOKEN_KEY_VERSION | 서버 저장 암호화 키와 버전 |
| OPENAI_API_KEY / OPENAI_EXTRACTION_MODEL | 서버 추출 인증과 평가한 모델 ID |
| CRON_SECRET | 서버 dispatch 인증 |
| NOTION_WRITE_ENABLED / TEXT_EXTRACTION_ENABLED | 서버 기능 플래그 |
| NEXT_PUBLIC_APP_URL | 공개 앱 origin만 |

개발/preview/production의 DB·OAuth callback·토큰·키를 분리한다. 환경 누락은 서버 시작 검증에서 발견하되 선택 기능이 비활성일 때 해당 secret은 요구하지 않는다. production P0 완전 출시는 필요한 기능을 활성화하고 실제 검증해야 한다.

## 5. 배포 순서

1. 의존성/API 버전과 앱 등록 범위 확인, 비밀 주입, DB 연결/분 단위 cron 확인.
2. 테스트 DB/preview migration, seed/demo 분리, lint/typecheck/test/build/E2E.
3. 운영 backup, 복원 리허설, backward-compatible migration 검토.
4. 운영 migration 후 앱 배포. 새 송신은 처음에는 비활성으로 시작.
5. 실제 테스트 프로젝트로 읽기 smoke, 매핑/권한 확인 후 Notion 쓰기 활성화.
6. 생성/수신/송신/충돌/원본 열기/관리자 검증과 로그 점검.
7. 작업 지연·오류율 확인 후 릴리스 기록. 실제 사용자 데이터로 자동 smoke를 돌리지 않는다.

## 6. 장애와 롤백

Notion 오작동 시 쓰기 플래그를 내리고 신규 claim을 중지한다. 실행 중 작업의 결과를 확인한 뒤 이전 앱 배포로 되돌린다. 읽기/Hub 저장은 가능한 한 유지한다. DB 변경은 즉흥적인 destructive down migration 대신 검증된 forward fix 또는 복원 절차를 사용한다.

외부에 이미 전송된 값은 앱 롤백으로 복구되지 않는다. binding/correlation ID와 baseline/송신 기록으로 대상을 식별하고 사용자 선택에 따라 복구한다. backup 복원 뒤 삭제 목록을 재적용하고 이미 성공한 외부 생성 작업을 자동 재실행하지 않는다.

토큰 회전 시 새 키 버전으로 재암호화하고 검증 전 구키를 버리지 않는다. 운영 대시보드에서 실패 작업/가장 오래 대기한 작업/충돌/마지막 수신 성공을 확인한다. 정리 작업의 draft 만료/휴지통 purge/로그 보관을 검증한다.

## 7. 출시 판정

[12](12-acceptance.md)의 A01~A12가 모두 통과하고 출시 차단 결함 0건, 실제 provider smoke와 백업 복구 증거가 있어야 기술 MVP 완료다. 현재 문서는 절차이며 실행 결과는 없다. 파일럿의 제품 가치 검증은 01의 기준으로 별도 진행한다.
