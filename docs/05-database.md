# 05. 데이터 모델과 무결성

## 공통

PostgreSQL + Prisma를 사용한다. ID는 UUID, 시각은 UTC timestamptz, 일정은 date, enum은 영문 고정 값이다. 업무 enum은 [11](11-planner-workflow.md)을 따른다. 업무 테이블은 created_at/updated_at을 갖고 의미 있는 동시 편집 대상은 version 정수를 갖는다.

workspace_id는 Project/ProjectSource/Integration/Activity/Binding/SyncJob 등 tenant 데이터에 명시한다. (workspace_id,id) 복합 unique 및 복합 FK를 적용해 다른 workspace의 부모를 참조하지 못하게 한다. UUID를 알고 있다는 사실은 권한이 아니다.

## 계정과 프로젝트

| 모델 | 주요 필드와 제약 |
| --- | --- |
| User | id, email unique, name, image, locale, theme, global_role(USER/SUPER_ADMIN), last_login_at |
| Auth Account/Session | Auth.js adapter 스키마, provider account unique, session 만료; 프로젝트 Integration과 분리 |
| Workspace | id, name, slug unique, type(PERSONAL/TEAM), personal_owner_user_id nullable unique, timezone |
| Membership | workspace_id, user_id, role(OWNER/ADMIN/MEMBER/VIEWER), unique(workspace_id,user_id) |
| Project | id, workspace_id, name(1~120자), description(최대 2,000자), lifecycle_status, workflow_stage, owner_label, next_action, next_action_due_on, target_date, coordination_state, coordination_note, last_activity_at nullable, version, archived_at nullable, deleted_at nullable |
| ProjectFieldState | workspace_id, project_id, field_key, authority(HUB/NOTION/BIDIRECTIONAL), binding_id nullable, value_origin, source_id nullable, observed_at, confirmed_at; unique(project_id,field_key) |
| ProjectVisit | workspace_id, user_id, project_id, last_opened_at; unique(user_id,project_id) |

Project는 COMPLETED ⇔ CLOSED, WAITING/BLOCKED이면 coordination_note 필수라는 제약을 DB check와 서비스 검증 양쪽에 둔다. next_action이 없으면 next_action_due_on도 null이다. 상태/단계/대기 상태에 BIDIRECTIONAL은 허용하지 않는다. 그 외 허용 필드는 10의 목록을 검증한다. owner_label은 권한 없는 표시 문자열이다.

주의 배지는 날짜에 따라 달라지므로 저장한 boolean을 진실로 쓰지 않는다. 업무 필드와 workspace timezone에서 계산한다. data_quality도 FieldState에서 계산한다. '내용 확인함'은 confirmed_at만 바꾸고 last_activity_at은 바꾸지 않는다.

## 원본과 연결

| 모델 | 주요 필드와 제약 |
| --- | --- |
| Integration | id, workspace_id, provider, provider_account_id, account_scope, token_ciphertext, token_nonce, token_key_version, refresh_token_ciphertext, expires_at, status, last_success_at, last_attempt_at, last_error_code; unique(workspace_id,provider,provider_account_id,account_scope) |
| ProjectSource | id, workspace_id, project_id nullable, integration_id nullable, provider(NOTION/GITHUB/VERCEL/MANUAL), external_id nullable, canonical_url, external_name, role(PLANNING/DESIGN/EXECUTION/DEPLOYMENT/OTHER), normalized_metadata jsonb, source_changed_at, last_observed_at, availability, version |
| Activity | id, workspace_id, project_id, source_id nullable, kind, origin(HUB/EXTERNAL/SYSTEM), event_key, occurred_at, safe_summary, external_url nullable; unique(workspace_id,event_key) |
| NotionProjectBinding | id, workspace_id, project_id, integration_id, source_id nullable, database_id nullable, data_source_id nullable, page_id nullable, activation_stage nullable, activated_at nullable, state, version, mapping_version, correlation_id unique, last_success_at |
| NotionFieldMapping | binding_id, field_key, notion_property_id, expected_type, direction(HUB_TO_NOTION/NOTION_TO_HUB/BIDIRECTIONAL), enum_mapping jsonb; unique(binding_id,field_key) |
| NotionSyncState | binding_id, field_key, baseline_value jsonb, last_sent_value jsonb, last_sent_project_version, observed_remote_value jsonb, remote_edited_at, last_verified_at, conflict_id nullable; unique(binding_id,field_key) |
| SyncConflict | id, workspace_id, binding_id, field_key, baseline/local/remote values, local_version, remote_observed_at, status, resolved_by, resolved_at, version |

외부 소스의 unique는 (workspace_id,provider,external_id)에서 external_id가 있을 때만 적용한다. external_id는 provider의 고유 리소스 ID를 사용하고 provider가 계정 내 ID만 제공하는 경우에만 원본 소유 계정 범위를 붙인다. 연결한 사용자/토큰 ID는 붙이지 않아 같은 원본을 다른 계정으로 연결해도 중복되지 않게 한다. 서로 다른 workspace가 같은 저장소/페이지를 가져오는 것은 허용한다. 수동 링크는 unique(workspace_id,project_id,canonical_url)를 적용하고 provider source에는 중복 적용하지 않는다.

P0는 프로젝트당 활성 Notion binding 최대 1개, workspace 내 동일 Notion page에 활성 binding 최대 1개다. 추가 Notion 페이지는 읽기 소스로 연결 가능하지만 업무 필드의 writer가 되지 않는다. partial unique index는 migration SQL로 명시한다. nullable page_id인 연결 대기에도 프로젝트별 활성 binding 제약이 적용된다.

미연결 후보 Source는 project_id=null 가능하지만 사용자에게 선택되지 않은 provider 전체 목록을 영구 수집하지 않는다. 연결 해제 시 Source는 남고 Integration 토큰은 삭제한다. Notion binding의 field authority는 HUB로 전환하며 과거 출처는 보존한다.

Integration.status는 CONNECTED/EXPIRED/REVOKED/ERROR/DISCONNECTED, Source.availability는 AVAILABLE/UNAVAILABLE/UNKNOWN이다. provider의 조회 성공과 업무 데이터 최신성은 서로 다른 값이다. NOTION_TO_HUB와 BIDIRECTIONAL 필드는 활성 binding_id가 필수이며 FieldState.authority와 FieldMapping.direction의 불일치는 서비스 트랜잭션에서 차단한다.

## 초안과 작업

| 모델 | 주요 필드와 제약 |
| --- | --- |
| ProjectDraft | id, workspace_id, created_by, candidates_ciphertext, nonce, key_version, schema_version, prompt_version, model_id, status, expires_at; 원문 저장 없음 |
| DraftCandidateResult | draft_id, candidate_id, project_id, request_id; unique(draft_id,candidate_id) |
| IdempotencyRecord | workspace_id, operation, key, payload_hash, result_ids, expires_at; unique(workspace_id,operation,key) |
| SyncJob | id, workspace_id, integration_id nullable, binding_id nullable, type, direction, dedupe_key, payload/cursor, status, attempt_count, run_after, lease_token, lease_until, started_at, finished_at, last_error_code; unique(workspace_id,dedupe_key) |
| AuditLog | id, actor_user_id nullable, workspace_id nullable, action, target_type/id, safe_metadata, created_at |
| MergeOperation | id, workspace_id, actor_id, source_project_id, destination_project_id, source_ids, before_field_values, resulting_versions, expires_at, undone_at |
| ProductEvent | id, workspace_id, user_id, event_name, safe_properties, occurred_at |
| UsageBucket | scope_type, scope_id, operation, window_start, count, reserved_output_tokens; unique(scope_type,scope_id,operation,window_start) |

후보의 근거 문장은 암호화한 candidate payload에 최대 200자/필드로 저장하고 24시간 후 제거한다. 확정/취소 시 즉시 draft 내용을 제거하고 candidate→project 결과 ID만 30일 보존한다. 멱등 레코드는 30일 보존한다. 초안 원문·추출 출력은 SyncJob/로그에 복제하지 않는다. UsageBucket은 모델 호출 전에 원자적으로 예약하고 30일 후 정리한다. 분당 한도는 UTC 분 경계, 일일 한도는 workspace timezone의 날짜 경계를 사용한다.

## 생성·병합·삭제의 트랜잭션

- 생성: 선택 후보의 프로젝트/FieldState/결과 ID/송신 작업을 한 트랜잭션으로 저장. 전체 선택은 원자적이며 일부만 저장된 결과를 성공으로 반환하지 않는다.
- 프로젝트 변경: expected_version 확인 후 version 증가, audit/activity와 필요한 작업을 같은 트랜잭션으로 기록.
- 병합: 소스·소스 연결 Activity를 목적 project로 이동. 수동 프로젝트 이력은 원 프로젝트에 남기고 목적에 병합 링크 이력을 남김. 업무 필드는 사용자 선택 값만 반영. 원 프로젝트는 보관. 활성 binding 충돌은 사용자 선택 후 하나만 유지.
- 분리: Source와 관련 Activity를 지정 프로젝트로 이동. binding이 붙은 Source는 매핑/권한을 검증해 함께 이동하거나 명시적으로 해제. 과거 공통값을 다른 프로젝트에 재사용하지 않고 재검증.
- 되돌리기: 30일 이내, 관련 Project/Source/Binding 버전이 병합 직후와 동일할 때만 복구. 이후 수정이 있으면 자동 Undo 대신 수동 분리 안내. 외부 쓰기 결과는 되돌리지 않고 비교 후 재동기화.
- 보관/휴지통: 아직 시작하지 않은 작업 취소. 실행 중 외부 작업이 있으면 잠금 아래 종료를 기다린 뒤 처리하고 UI에 대기 표시. 보관/삭제 후 새 쓰기 금지. 복원 시 자동 송신하지 않고 재검증 후 사용자가 재개.
- 삭제: deleted_at 설정 후 30일 휴지통, 이후 내부 프로젝트·초안·소스·binding을 정리. Notion/GitHub/Vercel 원본 삭제 금지. 감사 로그에는 최소 식별자만 보존.

## 보관 기간과 색인

Activity 180일, SyncJob/기술 로그 30일, AuditLog 90일, ProductEvent 90일을 기본으로 한다. 삭제된 프로젝트의 제목/업무 필드/URL 등 내용은 purge 시 관련 이벤트에서도 제거한다. backup은 30일 이내 순환을 운영 전제로 하고 복원 후 삭제 목록을 재적용한다. 외부 AI 제공자 보관 정책은 별도로 안내한다.

필수 index: Project(workspace_id,deleted_at,archived_at,lifecycle_status,workflow_stage), Project(workspace_id,target_date), Project(workspace_id,last_activity_at,id), Source(workspace_id,project_id), Activity(project_id,occurred_at,id), SyncJob(status,run_after), Conflict(workspace_id,status), FieldState(project_id,field_key). 검색은 초기 규모에서 파라미터화된 ILIKE로 시작하고 성능 측정 없이 검색 엔진을 추가하지 않는다.
