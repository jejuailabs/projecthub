# 개발 현황 — 2026-10-03

현재 구현은 전체 P0 완료가 아니다. 데모와 실제 외부 서비스 검증을 구분한다.

## 구현 및 검증

- Next.js App Router, Supabase Auth/SSR, 개인 workspace, RLS, 프로젝트 CRUD 및 버전 충돌 방지.
- 목록/카드/단계 보드, 필터, 보관/휴지통, 수동 원본 링크, 한영 및 라이트/다크.
- 생성형 풍경 이미지와 Liquid Glass UI.
- 회의록 입력 → OpenAI Responses Structured Outputs → 원문 근거 검사 → 후보 수정/선택 → 원자적 프로젝트 생성.
- 모델: `gpt-6-luna`. 실제 합성 회의록 호출 통과. 원문은 저장/로그하지 않으며 `store:false`, 도구 없음, 45초 timeout, 8,000 output token 제한.
- 키 이름: `OPENAI_API_KEY` 우선, `LLM_PROVIDER=openai`일 때 `LLM_PROVIDER_API_KEY` 대체 지원.
- 초안은 AES-256-GCM으로 사용자/workspace/초안 ID에 바인딩해 암호화한다. 확정·취소 시 내용 삭제. 24시간 후 접근 차단, 매분 만료 암호문 정리. 내용 없는 재확정 영수증은 30일 유지.
- 추출 제한: 사용자당 분당 5회, workspace당 UTC 일자 기준 20회. 실패한 모델 요청도 사용량에 포함한다.
- SQL 검증: 후보 일부 실패 시 전체 롤백, 재확정 중복 방지, 원문 링크 저장, 확정 후 암호문 제거, rate limit, 타 사용자 초안 격리 통과.
- 단위 테스트 14개 통과. 실제 모델 테스트 1개는 `RUN_LIVE_EXTRACTION=true`를 명시한 경우만 실행하며 별도로 통과했다.

## 아직 남은 P0

- Google OAuth 실제 계정 설정 및 로그인부터 DB 저장까지 브라우저 E2E. 현재 Google 프로젝트 생성 시 결제 연결 필수 화면으로 중단했고 결제는 연결하지 않았다.
- Notion OAuth, data source 선택/매핑, 읽기 가져오기, 단계별 활성화, 작업 큐, 세 방향 동기화 및 충돌 해결.
- GitHub/Vercel 원본 가져오기와 병합, 활동 상세, 시간대 설정, 관리자 운영 화면.
- 외부 권한 철회/재시도/응답 유실, 모든 화면의 모바일·다국어·접근성 검증.
- CI 및 운영 배포, 배포 환경 Google redirect와 환경변수 설정, 전체 A01~A12 증거.

## Vercel 환경변수

`.env.local`의 값을 Vercel 프로젝트 환경변수로 복사한다. 파일 자체는 Git에 올리지 않는다.

| 변수 | 설정 |
| --- | --- |
| NEXT_PUBLIC_APP_URL | 실제 배포 URL |
| NEXT_PUBLIC_SUPABASE_URL | 현재 projecthub URL |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | 현재 공개 키 |
| LLM_PROVIDER | openai |
| LLM_PROVIDER_API_KEY | 사용자 API 키 (서버 전용) |
| OPENAI_EXTRACTION_MODEL | gpt-6-luna |
| TEXT_EXTRACTION_ENABLED | true |
| TOKEN_ENCRYPTION_KEY | 로컬에 생성된 64자리 hex 값. 환경 간 동일한 DB를 사용하면 같은 키 사용 |
| TOKEN_KEY_VERSION | 1 |
| CRON_SECRET | 서버 전용 예약 작업 인증값. 로컬에 생성됨 |
| NOTION_WRITE_ENABLED | Notion 구현/검증 전 false 유지 |

`OPENAI_API_KEY`를 사용하면 대체 키보다 우선한다. Google Client ID/Secret은 Supabase Auth provider에 설정한다. 모델 가격은 이 문서에서 보장하지 않는다.

## 공식 구현 근거

- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [OpenAI 데이터 보관 정책](https://developers.openai.com/api/docs/guides/your-data)
