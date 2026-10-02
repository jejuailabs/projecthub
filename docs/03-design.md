# 03. 디자인과 화면 계약

## 방향

기준 이미지는 [Liquid Glass](../references/liquid-glass-reference.png)다. 차분한 반투명 표면과 선명한 업무 정보를 사용한다. 유리 효과보다 이름·단계·다음 행동·주의 사유가 먼저 읽혀야 한다.

Dark는 deep navy 배경, blue-gray glass, off-white 글자, cyan/indigo 포인트다. Light는 밝은 배경, milky glass, near-black 글자, blue/indigo 포인트다. 서로 독립된 토큰을 사용한다. 사용자 배경 업로드/프리셋 편집은 P1이다.

## 기본 토큰

| 항목 | 기준 |
| --- | --- |
| 폰트 | 한국어 Pretendard, 영문 Geist, 시스템 fallback |
| 본문/보조 | 14~16px / 12~13px; 핵심 정보 14px 이상 |
| 제목 | 24/32px, 랜딩 강조 40~52px |
| 간격 | 4px 기준, 주요 구획 24/32px |
| 모서리 | 카드 16px, 주요 패널 20px |
| 유리 효과 | dark 흰색 10~16%, light 흰색 75~90%, blur 최대 22px |
| 움직임 | 150~220ms, reduced-motion 지원, blur 애니메이션 금지 |

토큰은 CSS 변수로 정의하며 실제 배경 위 대비를 검증한다. blur 미지원 환경에는 불투명 표면을 사용한다.

## 화면 구성

Desktop 1440px: sidebar 248px + 유동 본문. 기본 대시보드는 List이며 열은 이름/상태·단계/담당자/다음 행동/기한/주의/원본이다. 최신성은 별도 짧은 라벨과 툴팁으로 제공한다. 보조 열은 작은 폭에서 숨기되 상세에 남긴다.

Grid 카드는 이름, 단계, 다음 행동, 기한, 주의 이유, 원본 아이콘을 우선 배치한다. 상태색은 작은 배지에만 쓴다. Board 업무 단계는 8열이라 가로 스크롤을 허용한다. 전체 상태 5열 모드도 지원하되 모든 열을 억지로 축소하지 않는다.

Mobile 390px: drawer + 카드 리스트 + 필터 메뉴. 최소 44px 터치 영역, 본문 가로 넘침 없음. 매핑·충돌 비교는 세로로 쌓는다. tablet은 640~1023px, desktop은 1024px 이상이다.

Sidebar P0: Dashboard, Projects, Integrations, Settings. Activity는 상세 탭이며 별도 전역 페이지는 P1이다. Topbar: 검색, 새 프로젝트, 언어, 테마, 프로필. 장식용 알림·즐겨찾기 버튼을 먼저 넣지 않는다.

## 핵심 컴포넌트

- ProjectRow/Card: 업무 정보와 data_quality를 분리해 표시.
- AttentionPanel: 업무상 확인 사유, 중복 카운트 안내, 원본 액션.
- ProvenanceLabel: 기준 도구, 수신/확인 시각, 원본 링크.
- DraftReview: 후보 선택, 근거 문장, 미정 값, 수정 가능한 폼.
- NotionMapping: 대상/속성/방향/초기 기준 값/단계 조건과 쓰기 미리보기.
- ConflictResolver: 마지막 공통 값/Hub/Notion 값을 보여주고 선택 저장.
- SyncBadge: 대기/동기화 중/성공/실패/확인 필요, 마지막 성공과 재시도.

## 필수 상태와 접근성

loading, empty, 검색 결과 없음, 추출 실패/0개 후보, 권한 없음, 토큰 만료, 데이터 오래됨, 동기화 실패, 충돌, 원본 접근 불가, 단계 대기, 작업 실행 중, 휴지통을 설계한다. 상태는 색만으로 전달하지 않는다.

WCAG AA 대비를 목표로 focus ring, label/aria-label, 의미 있는 heading, 키보드 메뉴/대화상자, focus 복귀, 저장 결과 live region을 제공한다. 드래그의 키보드 대체 동작을 필수로 둔다. 삭제/종료/외부 쓰기 확인은 실제 영향과 복구 여부를 보여준다.

수용 조건: 1440px와 390px, dark/light, ko/en 조합에서 주요 6개 화면(목록, 상세, 초안, 매핑, 충돌, 설정)을 확인한다. 긴 한글/영문 이름, 미정 필드, 200개 프로젝트, 모든 오류 배지가 있는 fixture로 검증한다.
