import {describe,expect,it,vi} from 'vitest';
import {modelResult,reviewCandidates,extractionInput} from './domain';
vi.mock('server-only',()=>({}));
import {extract} from './extract';
const candidate={name:'Project Atlas',description:null,lifecycle_status:null,workflow_stage:null,owner_label:'Invented',next_action:null,next_action_due_on:null,target_date:null,coordination_state:null,coordination_note:null,links:[{name:'Fake',url:'https://example.com/fake'}],evidence:[{field:'name',quote:'Project Atlas'},{field:'owner_label',quote:'not in the notes'}]};
describe('grounded drafts',()=>{
 it('removes unsupported values and links',()=>{const result=reviewCandidates(modelResult.parse({candidates:[candidate],overflow:false}),'Project Atlas');expect(result[0].project.owner_label).toBe('');expect(result[0].unconfirmed).toContain('owner_label');expect(result[0].links).toEqual([]);});
 it('rejects an invented project name',()=>{expect(reviewCandidates(modelResult.parse({candidates:[candidate],overflow:false}),'Other project')).toEqual([]);});
 it('accepts a proposed title grounded in rough notes and marks it for review',()=>{const text='We should rebuild the company website';const result=reviewCandidates(modelResult.parse({candidates:[{...candidate,name:'Website redesign',evidence:[{field:'name',quote:text}]}],overflow:false}),text);expect(result[0].project.name).toBe('Website redesign');expect(result[0].unconfirmed).toContain('name');expect(result[0].project.owner_label).toBe('');});
 it('limits Unicode characters, not UTF16 units',()=>{expect(extractionInput.safeParse({text:'😀'.repeat(20000),meeting_date:null,source_url:null}).success).toBe(true);expect(extractionInput.safeParse({text:'x'.repeat(20001),meeting_date:null,source_url:null}).success).toBe(false);});
 it('rejects unsafe source schemes',()=>{expect(extractionInput.safeParse({text:'hello',meeting_date:null,source_url:'javascript:alert(1)'}).success).toBe(false);});
});
it.skipIf(process.env.RUN_LIVE_EXTRACTION!=='true')('live OpenAI structured extraction with synthetic notes',async()=>{
 const result=await extract({text:'Project Atlas: Jimin will review the homepage mockups. Target date is 2026-10-20.',meeting_date:'2026-10-03',source_url:null},'Asia/Seoul');
 expect(result.candidates).toHaveLength(1);expect(result.candidates[0].project.name).toBe('Project Atlas');expect(result.candidates[0].evidence.length).toBeGreaterThan(0);
},60000);
it.skipIf(process.env.RUN_LIVE_EXTRACTION!=='true')('organizes a rough unnamed idea without invented owners or dates',async()=>{
 const result=await extract({text:'우리 동네 작은 가게들을 지도에서 모아 볼 수 있으면 좋겠어. 우선 어떤 정보를 보여줘야 하는지 점주 인터뷰를 해보자. 담당자랑 일정은 아직 정하지 않았어.',meeting_date:null,source_url:null},'Asia/Seoul');
 expect(result.candidates).toHaveLength(1);expect(result.candidates[0].project.name.length).toBeGreaterThan(0);expect(result.candidates[0].project.owner_label).toBe('');expect(result.candidates[0].project.target_date).toBeNull();expect(result.candidates[0].unconfirmed).toContain('name');
},60000);
