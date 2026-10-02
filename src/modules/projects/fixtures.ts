import {blankProject,type Project} from './domain';
const base={...blankProject,workspace_id:'demo',version:1,confirmed_at:'2026-10-02T08:00:00Z',last_activity_at:'2026-10-02T08:00:00Z',start_date:'2026-09-01',created_at:'2026-09-01T00:00:00Z',archived_at:null,deleted_at:null,project_sources:[]};
export const demoProjects:Project[]=[
 {...base,id:'demo-1',name:'Project Hub',description:'흩어진 프로젝트를 하나의 흐름으로 연결하는 작업 공간',lifecycle_status:'BUILDING',workflow_stage:'EXECUTION',owner_label:'나',next_action:'첫 대시보드 사용성 검토',start_date:'2026-10-01',next_action_due_on:'2026-10-03',target_date:'2026-10-09'},
 {...base,id:'demo-2',name:'제주 로컬 브랜드 리뉴얼',description:'지역의 이야기를 담은 새로운 브랜드 경험',lifecycle_status:'BUILDING',workflow_stage:'REVIEW',owner_label:'지민',next_action:'브랜드 시안 피드백 확인',next_action_due_on:'2026-10-05',target_date:'2026-10-05',coordination_state:'WAITING',coordination_note:'클라이언트의 최종 시안 승인을 기다리고 있습니다.'},
 {...base,id:'demo-3',name:'가을 캠페인',description:'10월 브랜드 캠페인 콘텐츠와 랜딩 페이지',lifecycle_status:'BUILDING',workflow_stage:'DESIGN',owner_label:'수연',next_action:'촬영 일정 재조율',coordination_state:'BLOCKED',coordination_note:'촬영 장소 확정이 필요합니다.',target_date:'2026-10-01'},
 {...base,id:'demo-4',name:'작은 기록 서비스',description:'매일의 작은 발견을 남기는 개인 기록 서비스',lifecycle_status:'LIVE',workflow_stage:'OPERATIONS',owner_label:'나',next_action:'사용자 피드백 살펴보기',target_date:'2026-10-12'},
 {...base,id:'demo-5',name:'동네 산책 지도',description:'새로운 시선으로 발견하는 동네의 장소들',workflow_stage:'DISCOVERY',owner_label:'나',next_action:'문제 정의와 인터뷰 질문 정리',confirmed_at:'2026-09-20T08:00:00Z'},
 {...base,id:'demo-6',name:'파트너 온보딩 가이드',description:'새 파트너가 처음 만나는 서비스 안내',lifecycle_status:'COMPLETED',workflow_stage:'CLOSED',owner_label:'현우'}
];