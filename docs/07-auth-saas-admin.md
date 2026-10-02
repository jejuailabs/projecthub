# 07. 인증, 권한, 관리자

## 인증과 tenancy

Auth.js Google 로그인만 P0다. provider subject로 계정을 식별하고 첫 로그인에서 User, 개인 Workspace, OWNER Membership을 멱등 생성한다. 동시 callback에도 workspace가 중복 생성되지 않도록 unique와 트랜잭션을 사용한다. 이메일이 같다는 이유만으로 서로 다른 인증 주체를 무조건 합치지 않는다.

모든 화면/API/worker는 authorized workspace와 대상 리소스의 일치를 검증한다. 로그인 사용자만 확인하고 project ID로 조회하는 패턴을 금지한다. 개인 workspace만 노출하되 역할 모델은 미래 팀 기능과 테스트를 위해 유지한다.

## 역할 행렬

| 작업 | OWNER | ADMIN | MEMBER | VIEWER |
| --- | --- | --- | --- | --- |
| 프로젝트/출처/이력 조회 | 허용 | 허용 | 허용 | 허용 |
| 수동/텍스트 생성, 업무 편집, 소스 연결·병합 | 허용 | 허용 | 허용 | 금지 |
| 종료/보관/휴지통/복원 | 허용 | 허용 | 허용 | 금지 |
| 기준 도구 변경, Notion 쓰기 설정·충돌 해결 | 허용 | 허용 | 금지 | 금지 |
| 서비스 계정 연결/해제/재연결 | 허용 | 허용 | 금지 | 금지 |
| 수동 수신 새로고침 | 허용 | 허용 | 허용 | 금지 |
| workspace 삭제/소유권 변경 | P0 미제공 | 금지 | 금지 | 금지 |

기존에 허용된 HUB 필드 편집에 따른 후속 송신은 MEMBER에도 허용되지만 writer 범위를 확대할 수 없다. P0 UI에는 팀 초대/role 편집이 없다. worker는 작업 실행 시 연결 활성 상태와 현재 권한 정책을 다시 검사한다.

## 데이터와 비밀

OAuth token은 서버에서 암호화 저장하고 키 버전으로 회전을 지원한다. 실제 provider scope는 최소 권한으로 검증하며 Notion 쓰기 capability가 없으면 읽기는 유지하고 쓰기만 차단한다. OAuth state/만료/nonce, CSRF, secure httpOnly cookie, 허용 redirect, 사용자 입력 검증을 적용한다.

추출 원문은 앱 DB·로그에 저장하지 않는다. 모델 전송 사실을 입력 화면에 명시한다. 추출 API는 workspace 일일 한도와 사용자 분당 제한을 서버에서 적용한다. Notion 연결 설정은 대상/필드/방향과 쓰기 영향을 검토할 수 있어야 한다.

## 운영 관리자

User.global_role의 SUPER_ADMIN은 workspace ADMIN과 별개다. /admin과 관리자 API에서 서버 검증한다. client에서 버튼을 숨기는 것은 보호가 아니다.

P0 관리자 화면: 사용자/워크스페이스/프로젝트 수, 가입/활성 지표, 서비스별 연결 상태, 작업 지연/실패/충돌 수, 추출 실패/사용량, 오류 코드와 재시도 가능한 작업. 원문·token·업무 필드 전체를 기본 목록에 노출하지 않는다. 운영 진단은 IDs와 상태 중심이다.

재시도는 기존 범위의 멱등 작업에만 가능하고 새 쓰기 범위 부여나 충돌값 임의 선택을 허용하지 않는다. 모든 관리자 액션은 감사 로그를 남긴다. impersonation, 사용자 업무 수정, 계정 정지, appearance 관리, 결제는 P0에서 제외한다.

## Bootstrap과 운영 통제

관리자 최초 지정은 인증된 사용자 ID를 대상으로 한 서버 CLI/운영 DB 절차로 수행하며 실제 계정 확인과 감사 기록을 필수로 한다. 첫 가입자를 자동 SUPER_ADMIN으로 만들지 않는다. 개발 seed 관리자와 운영 bootstrap을 분리한다.

NOTION_WRITE_ENABLED=false이면 새 송신 claim을 막고 대기 작업을 보류한다. 읽기/프로젝트 조회는 유지한다. TEXT_EXTRACTION_ENABLED=false이면 직접 생성으로 안내한다. 자동 삭제/보관 기간은 [05](05-database.md), 배포/복구는 [09](09-testing-deployment.md)를 따른다.
