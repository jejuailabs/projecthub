# 11. 기획자 업무 흐름과 정보 기준

문서 상태: 구현 기준 확정 / 2026-10-02. 이 문서는 상태, 업무 단계, 주의 항목과 필드 출처의 기준이다. 구현 완료를 의미하지 않는다.

## 1. 해결할 업무

기획자는 회의, 기획서, 디자인, 개발 이슈, 배포 결과를 오가며 여러 프로젝트를 수행한다. Hub는 프로젝트별 산출물의 위치와 의사결정에 필요한 최소 정보를 모은다. 상세 문서 작성과 세부 태스크 수행은 원래 도구에서 계속한다.

전체 흐름: 회의록/텍스트 또는 직접 입력 → 초안 검토 → 프로젝트 생성 → 문서/디자인/개발/배포 소스 연결 → 업무 단계 확인 → 다음 행동/대기 사유 확인 → 해당 원본에서 작업 → 동기화된 현황 확인 → 종료/보관.

## 2. 서로 다른 네 축

| 축 | 의미 | 값/규칙 |
| --- | --- | --- |
| 전체 상태 lifecycle_status | 프로젝트 전체의 운영 상태 | IDEA, BUILDING, LIVE, PAUSED, COMPLETED |
| 업무 단계 workflow_stage | 현재 집중하는 일 | DISCOVERY, PLANNING, DESIGN, EXECUTION, REVIEW, RELEASE, OPERATIONS, CLOSED |
| 업무 주의 항목 attention_flags | 확인하거나 행동할 사유 | BLOCKED, WAITING, OVERDUE, DUE_SOON, NEEDS_INFO |
| 정보 상태 data_quality | 판단 근거의 최신성 | FRESH, STALE, UNKNOWN 및 별도 SYNC_ERROR/CONFLICT 표시 |

기존 4상태에 COMPLETED를 추가한다. 배포 없이 끝나는 조사·캠페인·기획 프로젝트도 종료할 수 있어야 한다. LIVE는 운영 중이고 COMPLETED는 종료 상태이며, 목록 보관 archived_at은 별도다.

### 전체 상태

- IDEA: 아직 실행에 착수하지 않음.
- BUILDING: 기획·제작·실행 중.
- LIVE: 출시/공개 후 운영 중.
- PAUSED: 사용자가 중단을 지정. 자동 전환하지 않는다.
- COMPLETED: 종료. 종료 명령은 CLOSED 단계와 함께 원자적으로 저장한다.

### 업무 단계

| 값 | 화면 표시 | 대표 산출물/확인 사항 |
| --- | --- | --- |
| DISCOVERY | 발굴·검토 | 회의록, 문제와 목표 |
| PLANNING | 기획 | 요구사항, 기획서 |
| DESIGN | 디자인 | 화면·콘텐츠·설계 링크 |
| EXECUTION | 실행 | 개발 이슈, 제작 작업 |
| REVIEW | 검토·승인 | 승인 요청, 검토 결과 |
| RELEASE | 출시 준비 | 배포/공개 준비 사항 |
| OPERATIONS | 운영 | 운영 문서, 서비스 링크 |
| CLOSED | 종료 | 결과물, 종료 확인 |

단계는 순차 강제가 없다. 건너뛰기와 되돌리기를 허용하고 변경 이력을 남긴다. DISCOVERY~OPERATIONS는 상태와 독립이다. 단 CLOSED ⇔ COMPLETED는 항상 함께 유지한다. PAUSED는 이전 업무 단계를 유지한다. 종료 시 미완료 다음 행동은 사용자 확인 후 취소 처리하고, 재개 시 상태와 단계를 다시 선택한다. 웹사이트 존재나 커밋만으로 단계/상태를 자동 확정하지 않는다.

## 3. 프로젝트에 보여줄 최소 정보

| 필드 | 요구사항 | 초기값/편집 |
| --- | --- | --- |
| name / description | 이름 필수, 설명 선택 | 초안 또는 직접 입력 |
| lifecycle_status / workflow_stage | 검토 후 확정 | IDEA / DISCOVERY |
| owner_label | 실무 담당자 표시, 최대 100자 | 미지정 허용; 로그인/접근 권한과 무관 |
| next_action | 현재 다음 행동 한 개, 최대 300자 | 미정 허용 |
| next_action_due_on | 다음 행동 기한 | 날짜, 선택 |
| target_date | 프로젝트 주요 목표일 한 개 | 날짜, 선택 |
| coordination_state | CLEAR / WAITING / BLOCKED | CLEAR |
| coordination_note | 누구의 무엇을 기다리는지/막힌 이유, 최대 500자 | WAITING/BLOCKED에서는 필수 |
| reference links | 기획/디자인/실행/배포/기타 역할별 원본 링크 | 여러 개 연결 가능 |
| provenance / freshness | 필드 출처, 기준 도구, 최근 확인 시각 | 시스템 관리 |

담당자는 외부 협업자의 이름도 표시할 수 있는 문자열이다. P0는 개인 워크스페이스이며 팀 초대·담당자 알림·계정 자동 생성은 없다. 외부 Notion People과 계정 매칭은 P1이다. 담당자 문자열을 권한 검사에 사용하지 않는다.

다음 행동은 프로젝트마다 활성 항목 한 개다. 완료하면 시각과 문구를 Activity에 남기고 활성 값/기한을 비운다. 다음 행동을 입력하도록 강제하지 않는다. 수정·완료는 HUB 또는 BIDIRECTIONAL 필드에서 가능하며 NOTION 기준이면 원본으로 이동한다. 체크리스트·하위 태스크·댓글·스프린트는 만들지 않는다.

## 4. 주의 항목 계산

워크스페이스 timezone의 오늘을 기준으로 계산한다. 기본 timezone은 온보딩에서 확인한 브라우저 값, 실패 시 UTC다. 날짜 필드는 YYYY-MM-DD이고 시각은 UTC로 저장한다.

- BLOCKED: coordination_state=BLOCKED.
- WAITING: coordination_state=WAITING.
- OVERDUE: 미완료 next_action_due_on 또는 target_date가 오늘보다 이전.
- DUE_SOON: 위 날짜 중 오늘~3일 후에 해당하는 값 존재.
- NEEDS_INFO: 진행 중(BUILDING/LIVE)인데 owner_label 또는 next_action이 비어 있음. 오류가 아닌 보완 안내.
- PAUSED와 COMPLETED, 보관 프로젝트는 기본 주의 목록에서 제외한다. 재개하면 다시 계산한다.
- 한 프로젝트에 복수 배지를 허용한다. 대표 정렬은 BLOCKED → OVERDUE → WAITING → DUE_SOON → NEEDS_INFO, 다음은 가장 이른 기한, 이름, ID 순이다. 조건별 카운트는 중복될 수 있으므로 전체 프로젝트 수와 별도 표시한다.

지연 배지는 일정 경과를 뜻하며 실제 진행률이나 실패 확률을 뜻하지 않는다. 활동 횟수로 진척률을 만들지 않는다.

## 5. 필드의 기준 도구

각 필드는 HUB 또는 하나의 NOTION binding을 기준으로 가진다. 명시적으로 BIDIRECTIONAL을 선택한 단순 필드도 연결은 하나이며 공통 baseline으로 변경을 비교한다. 여러 외부 도구가 같은 필드를 동시에 관리하지 않는다. GitHub/Vercel은 활동과 배포의 근거이며 담당자/업무 단계/기한을 덮어쓰지 않는다.

- Hub에서 만든 프로젝트: 업무 필드는 HUB 기준. 연결 시 쓰기 방향을 확인한다.
- 기존 Notion에서 가져온 프로젝트: 사용자가 매핑한 필드는 NOTION 기준, 매핑되지 않은 필드는 HUB 기준. 첫 연결에서 값 비교와 초기 기준 선택을 받는다.
- HUB 기준: Hub에서 편집하고 선택적으로 Notion으로 전송한다. 외부의 다른 값은 확인 필요로 보여주며 자동 덮어쓰지 않는다.
- NOTION 기준: Notion에서 변경하고 Hub는 읽기 표시한다. Hub에는 원본 열기/기준 변경 액션을 제공한다.
- BIDIRECTIONAL은 고급 설정으로 제목·설명·담당자·날짜·다음 행동에만 허용한다. 상태/단계/대기 상태는 P0에서 단일 기준을 유지한다.
- 한 필드의 기준을 바꿀 때 양쪽 값을 비교하고 사용자 선택 후 baseline을 재설정한다. 새 외부 값을 조용히 폐기하지 않는다.

동기화 OFF 필드는 Hub 기준으로만 유지한다. 연결 해제 시 마지막 수신 값을 유지하고 Hub 기준으로 전환하며 확인 시각을 보존한다. 출처를 직접 입력으로 위장하지 않고 '연결 해제된 Notion에서 수신' 표시를 유지한다.

## 6. 최신성과 활동

필드마다 value_origin(HUB/NOTION/TEXT_CONFIRMED), source_id, observed_at, confirmed_at을 구분한다. observed_at은 원본에서 값을 확인한 시각이며 confirmed_at은 사용자가 직접 확인/수정한 시각이다.

- 외부 관리 필드: 원본의 마지막 성공 확인 이후 12시간 이내 FRESH, 초과 STALE, 한 번도 확인하지 못했으면 UNKNOWN.
- Hub 관리 필드: 사용자 확인 이후 7일 이내 FRESH, 초과 STALE. 사용자는 '내용 확인함'으로 확인 시각만 갱신할 수 있다.
- 동기화 실패와 충돌은 신선도와 독립 배지다. 오래된 값은 숨기거나 0으로 바꾸지 않는다.
- 프로젝트 data_quality는 채워진 핵심 업무 필드(상태·단계·담당자·다음 행동·기한·대기 정보) 중 UNKNOWN 우선, 다음 STALE, 나머지 FRESH다. 미지정 선택 필드는 제외한다.
- last_activity_at은 실제 사용자 업무 변경 또는 외부의 확인 가능한 변경 시각 최댓값이다. 단순 동기화 성공·조회·Hub 송신 에코·내용 확인함은 활동에 더하지 않는다.
- 외부 편집이 사람에 의한 것인지 증명하지 못하면 '원본 변경'으로 표시하며 사람 활동으로 단정하지 않는다.

## 7. 도구별 연결 범위

| 업무 | P0 연결 | 제공 정보 |
| --- | --- | --- |
| 회의·발굴 | 텍스트 붙여넣기, 원문 링크 | 확인 가능한 프로젝트 초안 |
| 기획 | Notion 페이지/데이터 소스 | 매핑된 업무 필드와 수정 시각 |
| 디자인 | Figma 등 수동 URL | 산출물 위치, 사용자가 지정한 역할 |
| 개발·실행 | GitHub 저장소, 이슈 도구 수동 URL | 저장소 활동 및 작업 위치 |
| 배포·운영 | Vercel 프로젝트, 서비스 URL | 배포 정보와 서비스 위치 |

Figma/Jira/Linear/Google Docs/Slack의 URL 등록을 네이티브 연동으로 표시하지 않는다. 수동 링크에는 자동 최신성/본문 분석을 약속하지 않는다. 향후 연동도 이 필드 출처 계약을 따른다.

## 8. 검증 시나리오

기획자가 회의록에서 프로젝트를 만들고 PLANNING으로 확인한다. 담당자·다음 행동·기한을 검토한다. Notion 페이지를 연결하고 디자인 URL을 추가한다. 승인 대기에서는 REVIEW와 WAITING, 요청 내용을 표시한다. 승인이 끝나면 원본 또는 Hub의 기준 필드를 갱신한다. GitHub/Vercel을 연결하면 같은 프로젝트에서 실행·배포 근거를 확인한다. 캠페인처럼 배포가 없는 프로젝트도 결과물 URL을 남기고 종료한다.

연동 계정이나 개발 저장소가 없어도 수동 프로젝트와 링크만으로 위 흐름을 사용할 수 있어야 한다.
