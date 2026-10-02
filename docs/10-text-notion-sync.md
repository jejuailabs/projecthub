# 10. 텍스트 생성과 Notion 동기화 구현 계약

## 1. 범위

P0는 붙여넣은 회의록/텍스트의 구조화 초안 추출, 사용자 검토 생성, 지정 업무 단계에서의 Notion 최초 연결과 선택 필드 동기화다. 기존 Notion 읽기 가져오기도 유지한다. 파일 업로드·음성 전사·회의 자동 수집·일반 요약·자동 병합·본문 전체 동기화는 제외한다.

## 2. 입력과 초안 추출

입력은 1~20,000 Unicode 문자, 선택적인 회의 날짜와 http/https 원문 URL이다. workspace 시간대와 기준 날짜를 명시한다. 1회 최대 10개 후보이며 더 많으면 분할 입력을 안내한다. 사용자가 추출을 요청할 때에만 서버로 전송한다.

서버는 OpenAI Responses API의 Structured Outputs로 후보 배열을 받는다. 필수 schema 키와 additionalProperties:false, nullable 값, enum/길이 제한을 정의하고 서버 Zod로 다시 검증한다. schema 준수는 내용의 정확성을 보장하지 않으므로 사용자 검토를 생략하지 않는다. refusal, 불완전 응답, timeout, 스키마 오류는 별도 실패로 처리한다. [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

도구 사용은 끄고 store:false로 호출한다. 앱은 원문을 영구 저장하지 않지만 이 설정만으로 외부 제공자의 모든 보관이 없어지는 것은 아니므로 데이터 안내에 실제 계정 정책을 명시한다. [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data).

모델은 OPENAI_EXTRACTION_MODEL로 배포 시 고정한다. 한 요청 timeout 45초, output token 한도 8,000, 자동 모델 재호출 없이 사용자 재시도를 제공한다. 사용자당 분당 5회/workspace당 하루 20회 기본 한도이며 서버 DB에서 원자적으로 집계한다. 모델이 없거나 비용 한도 초과이면 직접 생성은 계속 제공한다.

## 3. 후보 스키마와 검토

각 candidate는 서버가 부여한 candidate_id, name, description, lifecycle_status, workflow_stage, owner_label, next_action, next_action_due_on, target_date, coordination_state, coordination_note, links와 evidence를 갖는다. 추출 단계에서 이름 외 값은 null 가능하다. 근거 없는 이름도 후보가 아니라 '프로젝트를 찾지 못함'으로 처리한다.

- evidence는 필드별 원문 인용 최대 200자이며 서버가 입력 내 존재 여부를 검증한다. 검증 실패 필드는 미확정으로 표시한다.
- 명시되지 않은 담당자/기한/상태를 만들어내지 않는다. 상태/단계 기본값을 제시할 때 '기본 제안'이라고 구별한다.
- '다음 금요일' 같은 날짜는 사용자가 지정한 회의 날짜/시간대로 해석하고 원문과 계산 날짜를 함께 보여준다. 기준이 없거나 모호하면 null이다.
- URL은 허용 scheme을 검증한다. 모델이 지시문을 반환해도 실행하지 않는다.
- 기존 유사 프로젝트는 사용자 선택에 도움을 주는 후보 링크다. 텍스트 추출만으로 기존 프로젝트를 갱신하지 않는다.
- 선택 후보는 프로젝트 도메인 제약을 통과한 뒤 일괄 원자적 생성한다. 동일 draft/candidate의 재확정은 같은 project ID를 반환한다.

원문은 요청 처리 중 메모리에서만 사용한다. 초안 후보와 최소 evidence는 서버에서 암호화해 24시간까지 보관하며 확정/취소 시 삭제한다. 원문 URL은 사용자가 보존을 선택한 경우에만 Source로 만든다. 브라우저 원문은 탭 이탈 시 사라지며 복구를 약속하지 않는다.

## 4. 연결 대상과 활성화

P0의 새 페이지 대상은 기존 Notion 데이터베이스의 사용자가 선택한 data source다. database_id와 data_source_id를 구별하고 스키마를 조회한다. 기존 일반 페이지는 제목/URL 연결만 가능하다. 이 경우 단계/기한 속성 매핑은 제공하지 않는다.

설정 저장 시 대상, 속성 ID/타입, 기준 도구, enum 매핑, 쓰기 미리보기와 다음 조건을 확인한다.

- 즉시: 검토한 프로젝트 생성 또는 설정 저장 후 작업 enqueue.
- 지정 단계: activation_stage와 현재 workflow_stage가 같아지는 첫 확정 변경 후 enqueue. 상태 BUILDING 같은 넓은 값 대신 PLANNING/REVIEW 같은 업무 단계가 기준이다.
- 설정 당시 이미 그 단계라면 '지금 실행'으로 명시하고 저장 후 실행한다.
- 이탈 전에 미실행 작업은 취소하고 다음 진입까지 대기한다. 실행 직전에도 현재 단계/권한을 재검증한다.
- 한 번 활성화되면 activated_at/page_id를 유지한다. 이후 단계 변경은 기존 페이지 업데이트이며 새 페이지를 만들지 않는다.

binding 상태: WAITING_STAGE, PENDING, ACTIVE, CONFLICT, ERROR, NEEDS_REVIEW, DISABLED. 작업 RUNNING/RETRY_WAIT와 별개다. 프로젝트당 writer binding은 하나만 허용한다.

## 5. 매핑 가능한 필드

| Hub 필드 | Notion 속성 | 방향 |
| --- | --- | --- |
| name | title | 세 방향 |
| description, owner_label, next_action | rich_text | 세 방향 |
| next_action_due_on, target_date | date(날짜만) | 세 방향 |
| lifecycle_status, workflow_stage | status 또는 select | 단방향 기준 선택 |
| coordination_state | select/status | 단방향 기준 선택 |
| coordination_note | rich_text | coordination_state와 같은 방향 |
| source URL/last edited | provider 메타데이터 | Notion → Hub 읽기 |
| Hub 식별자 | 전용 rich_text 속성 | 시스템 관리, 사용자 업무 필드 아님 |

세 방향은 HUB_TO_NOTION/NOTION_TO_HUB/BIDIRECTIONAL이다. 기본값은 신규 Hub 프로젝트의 경우 HUB_TO_NOTION, 기존 Notion 가져오기는 NOTION_TO_HUB다. BIDIRECTIONAL은 명시적으로 선택한 단순 필드에만 제공한다.

상태/단계 enum은 각각 다른 속성에 매핑한다. 필요한 값이 없거나 다른 타입이면 해당 필드 연결을 차단하고 Notion에서 수정하도록 안내한다. 자동 스키마 생성/타입 변경은 하지 않는다. 여러 외부 값이 같은 Hub 값으로 매핑될 수 있으나 송신용 대표 값은 하나를 명시한다. 모르는 enum 값은 덮어쓰지 않고 매핑 확인 상태로 둔다.

상태와 단계는 같은 기준/방향으로 묶고, 둘 중 하나만 매핑할 경우 종료 관련 외부 값은 확인 대상으로 남긴다. COMPLETED/CLOSED가 함께 전달되지 않은 변경은 프로젝트의 정합성을 자동 추측하지 않는다. UI에서 두 필드 매핑 또는 Hub 기준 유지를 안내한다.

next_action/기한, coordination_state/사유도 그룹으로 같은 방향을 사용하고 함께 검증한다. 상태가 WAITING/BLOCKED인데 사유가 없으면 적용 대기 충돌로 표시한다. next_action이 비워지면 기한도 같이 비운다. Notion People/relations/formula/rollup/본문 블록은 P0 쓰기 대상이 아니다.

## 6. 첫 연결과 기준 변경

기존 페이지에는 baseline이 없으므로 양쪽 값을 비교해 초기 기준을 명시한다. NOTION 기준은 가져올 값, HUB 기준은 전송할 값, 양방향은 시작값을 필드별로 사용자가 선택한다. 빈 값도 삭제 의미가 있으므로 미리보기에 표시한다.

첫 write/read-back 성공 후에만 baseline을 확정한다. 전송 실패 상태에서 성공 baseline을 만들지 않는다. 기준/대상/매핑 변경은 기존 작업을 중단하고 version을 올린 뒤 재비교한다. 매핑 이름 변경은 ID로 추적하고 타입 변경은 재검증한다.

## 7. 필드별 동기화 알고리즘

B=마지막 확인한 공통 값, H=현재 Hub 값, N=방금 읽은 Notion 값. 문자열/날짜/enum을 정규화해서 비교한다. missing property는 null과 다르며 schema 오류로 처리한다. patch에는 실제 바뀐 속성만 넣는다.

| 상황 | BIDIRECTIONAL 처리 |
| --- | --- |
| H=B, N=B | 변화 없음; 확인 시각만 갱신 |
| H≠B, N=B | H를 송신하고 read-back 후 B 갱신 |
| H=B, N≠B | N을 Hub에 적용하고 B 갱신 |
| H=N≠B | 동일 변경으로 수렴, 재송신 없이 B 갱신 |
| H≠B, N≠B, H≠N | 충돌 생성, 그 필드 송신/적용 중단 |

HUB_TO_NOTION은 Hub가 기준이지만 N이 B와 다르게 바뀌었으면 바로 덮어쓰지 않고 외부 변경 확인을 요청한다. NOTION_TO_HUB는 Hub 편집을 금지하며 수신 값을 도메인 검증 후 적용한다. 충돌은 해당 필드/그룹에 한해 중지하고 독립 필드는 진행할 수 있다.

충돌 해결은 B/H/N과 출처·시각을 보여주고 사용자에게 Hub/Notion/수정값을 선택하게 한다. 해결 저장 직전에 원격을 재조회하고 로컬/충돌 버전을 확인한다. 다시 바뀌면 최신 비교를 표시한다. 오류를 없애려고 마지막 도착 값으로 덮어쓰지 않는다.

활동 중복은 last_sent_value/version과 event_key로 제거한다. 속성값이 같다는 이유만으로 Notion의 다른 실제 변경까지 모두 숨기지 않는다. Hub가 쓴 필드의 에코는 외부 업무 진행으로 집계하지 않는다.

## 8. 재시도·생성 중복·경합

새 페이지에는 binding.correlation_id를 검증된 전용 Hub 식별자 속성에 함께 기록한다. 해당 속성을 준비하지 않으면 자동 생성 설정을 완료할 수 없다. 생성 전/응답 유실 후 대상 data source에서 같은 식별자를 조회한다. 1개면 연결 복구, 복수면 NEEDS_REVIEW, 응답 유실 후 0개라도 원격 생성 여부가 불명확하면 자동 재생성하지 않는다.

목록 결과가 늦게 반영되거나 외부 API가 강한 원자성을 제공하지 않을 수 있으므로 exactly-once를 주장하지 않는다. binding 직렬 작업, 버전 검증, 최소 patch, 사전 조회, read-back, 비교 이력으로 위험을 줄인다. 읽기와 쓰기 사이의 외부 동시 편집을 완전히 잠글 수 없다는 한계를 연결 도움말에 명시한다.

이 한계 때문에 상태/단계에는 양방향을 허용하지 않고, 일반 필드 양방향도 고급 선택 사항으로 둔다. 수신 당시 값·송신 값·마지막 공통 값으로 사용자가 복구할 수 있게 한다. 429/5xx와 토큰/매핑 오류의 재시도 정책은 [04](04-architecture.md) 기준이다.

## 9. 해제·삭제·권한

연결 해제/보관/삭제는 실행 중 작업을 정리하고 pending 작업을 취소한 후 처리한다. 외부 원본 삭제는 전파하지 않는다. Notion 페이지 삭제/권한 철회 시 Hub는 마지막 값을 유지하고 접근 불가를 표시한다. 해제 시 해당 필드를 Hub 기준으로 전환하되 출처 이력은 유지한다.

모든 설정·송신·해결에서 workspace, 역할, 대상 권한, 활성 binding/version을 검증한다. 추출 모델에는 DB나 외부 쓰기 도구를 제공하지 않는다. 저장된 활성화 규칙은 허용 범위의 후속 실행을 승인한 것으로 처리하고 매 동기화마다 재확인을 요구하지 않는다.

## 10. 필수 검증

단일/복수/0개 후보, 한국어·영어, 모호한 날짜, 원문 내 지시문, 검토 수정, 중복 확정, API 거부/timeout/한도; 신규/기존 Notion 연결, 즉시/단계 조건, 스키마 변경, 세 방향 알고리즘, 그룹 제약, 충돌 재발, 생성 응답 유실, 중복 식별자, token 철회, 삭제 비전파, 권한 차단을 검증한다.

완료 증거는 [12](12-acceptance.md)의 A08/A09와 [09](09-testing-deployment.md)에 기록한다. 모델/정책/제공자 문서 확인 기준일은 2026-10-02이며 구현 시 실제 지원 버전으로 재검증한다.
