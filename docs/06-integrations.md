# 06. 외부 연동 계약

> 현재 구현된 읽기 연동 범위와 실계정 검증·설정 상태는 [16. 복수 계정·선택 가져오기](16-integrations.md)를 따른다. 아래 예약 수신·Notion 쓰기 항목은 목표 계약이며 완료 선언이 아니다.

## 공통

OAuth 기반의 workspace별 Integration을 사용한다. provider별 공개 앱 등록/승인/권한과 API 버전은 Phase 0에서 공식 문서와 실제 테스트 계정으로 검증해 integration setup 문서에 기록한다. Vercel도 배포 대상 계정/팀의 설치 범위를 구분한다. 인증 실패를 임의 공유 토큰이나 client 비밀 노출로 우회하지 않는다.

읽기 연동은 서비스별로 독립 실패한다. 목록은 pagination하고 사용자가 선택한 소스만 등록한다. manual sync, 세션 진입 시 마지막 성공이 6시간 이상 지난 경우 enqueue, 6시간 주기 수신을 제공한다. 동시에 여러 요청은 병합한다. webhook은 P1이다.

rate limit, Retry-After, 토큰 철회/만료, 접근 범위 변경, 페이지네이션 중 실패를 처리한다. 권한 없음과 삭제 여부를 API로 구분할 수 없으면 '접근 불가'로 표시한다. HTTP 404만으로 Hub 프로젝트를 삭제하지 않는다. 실패 시 이전 값과 마지막 성공 시각을 유지한다.

## Provider별 P0

| Provider | 가져올 정보 | 업무 필드 쓰기 |
| --- | --- | --- |
| GitHub | repo ID/name/description/URL, default branch, pushed_at, visibility, language, 홈페이지 | 없음 |
| Vercel | project ID/name/framework, linked repository, 최근/production 배포, domain | 없음 |
| Notion | 페이지 ID/title/URL, 선택한 data source의 매핑 속성, last_edited_time | 사용자 설정한 필드만 |
| Manual | 이름, http/https URL, 소스 역할 | 외부 쓰기 없음 |

GitHub의 private repo 접근은 실제 부여된 권한에 한한다. Vercel 배포 존재는 LIVE 추천 근거일 수 있지만 자동 상태 전환 근거가 아니다. Notion은 접근 허용한 page/data source 범위만 가져오며 본문 전체 수집을 하지 않는다. 수동 Figma/Jira/Linear/Docs 링크는 URL 연결임을 명시한다.

## Notion 데이터 구조와 속성

사용자 화면은 '데이터베이스'라는 친숙한 이름을 사용하되 저장/adapter는 database_id와 data_source_id를 구분한다. 페이지 속성은 해당 데이터 소스 스키마에 맞춰 매핑한다. 이름 변경에 강하도록 property ID를 저장하고 타입 변경/삭제 시 해당 필드 동기화를 중지한다. 지원 API 버전은 검증 후 고정한다. [Notion upgrade guide](https://developers.notion.com/guides/get-started/upgrade-guide-2025-09-03), [Update page](https://developers.notion.com/reference/patch-page).

일반 페이지는 기존 제목/URL 연결만 지원한다. 새 페이지 생성은 검증된 데이터 소스 대상으로만 허용한다. 자동 데이터베이스 생성이나 스키마 변경은 P0에서 하지 않는다. 이름·Hub 식별자 등 필요한 속성이 없으면 사용자가 Notion에서 준비하도록 안내한다.

## 추천 연결과 중복 방지

동일 linked repository +100, URL 교차 일치 +80, 이름 완전 일치 +70, 정규화 이름 일치 +60, 유사 이름 +30. 이름 계열은 최댓값 하나만 사용하고 점수 70 이상이면 제안한다. 순서는 점수/ID로 안정화하며 근거를 보여준다. 임계값 이상도 자동 병합하지 않는다.

중복 소스 키는 (workspace_id,provider,canonical external_id)다. 다른 workspace의 동일 소스는 별도 데이터다. 연결을 바꾸거나 계정이 겹쳐도 외부 소스가 중복 생성되지 않도록 검증한다. 이름만으로 동일 소스 판정하지 않는다.

## Adapter 책임

connect/callback, listSources(cursor), fetchSource, normalize, classifyError가 공통 책임이다. Notion만 validateMapping/readMappedFields/createPage/patchMappedFields/readBack을 추가한다. adapter 밖으로 토큰이나 raw 응답을 내보내지 않는다. normalized metadata는 허용 필드만 저장한다.

재연결은 같은 provider 계정 확인 후 토큰을 교체하고 매핑 접근권한을 재검증한다. 연결 해제는 pending 작업 취소/실행 작업 종료 후 토큰 삭제, binding 비활성화, 필드 기준 전환을 수행한다. 실제 외부 작업 결과가 불명확하면 확인 필요 상태를 남긴다.

## 완료 증거

각 서비스의 실제 계정 연결→선택 가져오기→수동 수신→중복 재시도→연결 해제를 확인한다. Notion은 [10](10-text-notion-sync.md)의 쓰기·충돌 테스트까지 통과해야 완료다. 모의 데이터만 통과한 adapter는 개발 중으로 표시한다.
