# 복수 계정 · 선택 가져오기 연동

## 현재 구현과 실제 검증 상태

GitHub App, Vercel Integration, Notion Public Integration의 서버 OAuth 시작/콜백, 계정별 연결 저장, 허용된 목록 조회, 선택 가져오기와 원본별 수동 갱신을 구현했다. Supabase 마이그레이션은 적용했고 데모 UI 및 DB 권한/중복/트랜잭션 테스트를 통과했다. **실제 외부 계정 연결 성공을 검증한 것은 아니다.** Google 로그인은 2026-10-03 확인 시 Supabase에서 비활성화되어 있고 세 서비스의 앱 자격증명도 입력이 필요하다.

데모 계정과 목록은 예시다. OAuth 앱이 설정되지 않은 실사용 화면에서는 연결 추가가 비활성화되고 설정 필요로 표시된다.

## 사용자 흐름

1. 서비스별 계정 연결 추가 → 구분할 이름 입력 → 서비스 승인.
2. 연결에서 목록 선택. GitHub는 계정이 접근 가능한 App 설치 조직을 고른다. Vercel은 토큰이 발급된 팀, Notion은 승인한 워크스페이스 범위를 사용한다.
3. 최대 20개 항목을 선택하고 각각 기존 프로젝트 또는 새 프로젝트를 지정한다.
4. 미리보기 확인 후 선택 항목만 가져온다. 기존 프로젝트의 업무 상태·투두를 덮어쓰지 않는다.
5. 연결한 원본에서 개별 최신 정보 받기. 실패하면 이전 값·마지막 성공 시각을 유지한다.
6. 연결 해제 시 암호화된 인증정보를 삭제하고 수신을 중단한다. 프로젝트와 참조 링크는 보존한다. 외부 서비스 자체의 앱 승인 철회는 해당 서비스 설정에서 별도 수행한다.

GitHub 검색은 불러온 페이지의 목록을 필터링하며 더 보기를 제공한다. Vercel/Notion 검색은 서버 검색과 페이지네이션을 사용한다. Notion은 검색 API가 반환하는 허용된 페이지·데이터 소스만 조회한다. 본문 전체·데이터베이스 행을 무조건 복제하지 않는다.

## 설정할 환경변수

`.env.local`과 `.env.example`에 아래 항목을 추가했다. 실제 값은 `.env.local` 또는 Vercel 환경변수에만 넣는다.

| 서비스 | 항목 |
| --- | --- |
| GitHub App | GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_APP_SLUG |
| Vercel Integration | VERCEL_CLIENT_ID, VERCEL_CLIENT_SECRET, VERCEL_INTEGRATION_SLUG |
| Notion Public Integration | NOTION_CLIENT_ID, NOTION_CLIENT_SECRET |
| 공통 | NEXT_PUBLIC_APP_URL, TOKEN_ENCRYPTION_KEY, TOKEN_KEY_VERSION |

`NEXT_PUBLIC_APP_URL`은 **실제로 접속하는 주소**와 일치해야 한다. 현재 파일은 `http://localhost:3000`이므로 OAuth 검증은 이 주소로 접속하거나 등록한 콜백 주소와 함께 일관되게 변경한다. `localhost`와 `127.0.0.1`의 쿠키는 공유되지 않는다. 운영에서는 실제 HTTPS 배포 도메인을 설정한다. 미리보기 도메인을 무조건 허용하지 않는다.

앱에 등록할 콜백 URI:

- `<NEXT_PUBLIC_APP_URL>/api/integrations/callback/github`
- `<NEXT_PUBLIC_APP_URL>/api/integrations/callback/vercel`
- `<NEXT_PUBLIC_APP_URL>/api/integrations/callback/notion`

Google 로그인은 별도다. Supabase Authentication → Google에 Google Client ID/Secret을 설정하고, Google에는 `https://tcodixafsipheefvuouc.supabase.co/auth/v1/callback`을 등록한다. Supabase redirect 허용 목록에는 Hub의 `/auth/callback`을 등록한다. 외부 도구의 OAuth 자격증명을 Google 로그인 키로 사용하지 않는다.

### GitHub

OAuth App의 광범위한 `repo` 권한 대신 **GitHub App**을 사용한다. 현재 필요한 저장소 권한은 Metadata Read-only다. App을 필요한 계정·조직의 선택한 저장소에 설치한다. 사용자 OAuth 승인 후 `/user/installations`와 설치별 저장소 목록을 조회한다. 코드 본문·환경변수·비밀정보를 가져오지 않는다. 이슈·PR 상세 수집은 현재 범위 밖이며 추가할 때 해당 읽기 권한을 별도로 요청한다.

### Vercel

Connectable Integration을 등록하고 `project`·`deployment`·`team`·`user` 범위를 Read로 설정한다. 계정 표시와 정확한 프로젝트 URL을 위해 사용자 이름·팀 slug를 조회하고 필요한 값만 보관한다. 환경변수 쓰기·조회 권한은 요청하지 않는다. 응답의 `team_id`를 API 호출에 고정하고 사용자가 임의 팀 ID를 전달해 바꿀 수 없게 한다. 일반 Sign in with Vercel의 신원 확인 앱과 구분한다. 설치 완료 next 주소는 정확히 https://vercel.com인 경우만 허용한다. 실제 설치 완료 UX는 실계정 테스트에서 확인해야 한다.

### Notion

Public Integration의 읽기 콘텐츠 권한으로 시작한다. 승인 화면에서 필요한 페이지만 허용한다. API 버전은 `2025-09-03`으로 고정했고 일반 페이지와 데이터 소스를 구분한다. 데이터 소스의 database_id는 메타데이터로 별도 보관한다. 현재는 제목·URL·수정 시각 연결이며 속성 매핑·행 생성·양방향 동기화는 아직 구현하지 않았다.

## 구조와 확장 방법

- `integration_connections`: 사용자·워크스페이스·서비스·외부 계정·범위별 연결. 같은 계정의 재승인은 기존 연결을 갱신한다.
- `private.integration_credentials`: AES-256-GCM으로 암호화한 자격증명. 사용자/워크스페이스/서비스/계정/범위에 묶으며 원문 토큰은 브라우저나 목록 응답에 보내지 않는다.
- 기존 `project_sources` 확장: connection_id, 외부 ID·종류·범위, 허용된 요약 메타데이터, 마지막 수신 시각·상태. 별도 중복 프로젝트 저장소를 만들지 않는다.
- `(workspace_id,provider,external_id)` 고유 키로 겹치는 계정의 중복 가져오기를 차단한다. 가져오기는 트랜잭션과 워크스페이스 잠금으로 처리하여 응답 유실 후 같은 항목을 재시도해도 프로젝트가 중복 생성되지 않는다.
- `Adapter`는 scopes/list/fetch를 구현한다. UI·프로젝트 연결·미리보기·선택 검증·권한은 공통으로 사용한다. 새 플랫폼은 provider 등록, 전용 인증/정규화, DB 허용 목록 마이그레이션, 테스트를 추가한다.
- OAuth state는 사용자·워크스페이스·서비스에 묶인 암호화 HttpOnly 쿠키, 10분 만료, GitHub PKCE를 사용한다. 목록 선택 티켓은 연결 버전과 사용자에 묶이고 15분 뒤 만료한다. 가져올 때 원본을 다시 조회한다.
- 연결 해제/재승인으로 버전이 바뀌면 진행 중 요청의 저장을 거부한다. 갱신 실패나 외부 404로 프로젝트를 자동 삭제하지 않는다.

공식 API가 없는 플랫폼도 기존 수동 원본 링크로 연결할 수 있다. 임의 외부 URL을 서버에서 가져오는 범용 API나 임의 스크립트 실행 기능은 열지 않는다.

## 다음 단계

- 실제 Google 로그인 → 각 서비스 계정 승인 → 목록·가져오기·갱신·해제의 E2E.
- 토큰 자동 갱신 및 다중 서버 갱신 잠금. 현재 만료 시 재연결을 안내한다. refresh_token 자동 회전은 지원하지 않는다.
- 예약 동기화/작업 큐/Retry-After 기반 재시도/Webhook. 현재는 원본별 수동 갱신이다.
- Notion 속성 매핑·선택 필드 쓰기·충돌 검토와 실행 결과 재확인. NOTION_WRITE_ENABLED=false 유지.
- 원본 연결 이동/다른 멤버로 인계, 외부 권한 변경의 실제 사례 검증.
- 운영 배포와 CI. 이번 작업에서 실제 서비스 앱 등록·배포·Git 커밋/푸시는 수행하지 않았다.

## 검증 근거

- `supabase/tests/integrations.sql`: 복수 계정, 두 계정으로 동일 항목 재시도, 부분 실패 롤백, 기존 업무 보존, 갱신 실패 값 보존, 연결 해제/재승인, 다른 워크스페이스와 조회 전용 역할 제한.
- `src/modules/integrations/*.test.ts`: 비밀값 제외 정규화, Notion ID, 선택 제한, 계정별 암호화 컨텍스트, 선택 티켓 위변조·만료·버전, GitHub PKCE/설치 페이지네이션, Vercel 팀 고정, 토큰 만료·401 처리.
- 보안 advisor: 새 경고/오류 없음. 기존 private.extraction_usage의 의도적 접근 차단 정책 INFO만 유지.

공식 문서: [GitHub App user authorization](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app), [Vercel external integration flow](https://vercel.com/docs/integrations/create-integration/submit-integration), [Vercel API token exchange](https://vercel.com/docs/integrations/create-integration/vercel-api-integrations), [Notion authorization](https://developers.notion.com/guides/get-started/authorization), [Notion search](https://developers.notion.com/reference/post-search).
