import {z} from 'zod';
import {blankProject,coordinations,projectInput,stages,statuses} from '@/modules/projects/domain';

export const fields=['name','description','lifecycle_status','workflow_stage','owner_label','next_action','next_action_due_on','target_date','coordination_state','coordination_note'] as const;
export const safeUrl=z.url().max(2048).refine(v=>['https:','http:'].includes(new URL(v).protocol));
export const extractionInput=z.object({
 text:z.string().refine(v=>[...v].length>=1&&[...v].length<=20000&&!!v.trim()),
 meeting_date:z.iso.date().nullable(),source_url:safeUrl.nullable(),
}).strict();
export const modelCandidate=z.object({
 name:z.string().min(1).max(120),description:z.string().max(2000).nullable(),
 lifecycle_status:z.enum(statuses).nullable(),workflow_stage:z.enum(stages).nullable(),
 owner_label:z.string().max(100).nullable(),next_action:z.string().max(300).nullable(),
 next_action_due_on:z.iso.date().nullable(),target_date:z.iso.date().nullable(),
 coordination_state:z.enum(coordinations).nullable(),coordination_note:z.string().max(500).nullable(),
 links:z.array(z.object({name:z.string().min(1).max(120),url:safeUrl}).strict()).max(10),
 evidence:z.array(z.object({field:z.enum(fields),quote:z.string().min(1).max(200)}).strict()).max(10),
}).strict();
export const modelResult=z.object({candidates:z.array(modelCandidate).max(10),overflow:z.boolean()}).strict();
export type Candidate={candidate_id:string;project:z.infer<typeof projectInput>;evidence:z.infer<typeof modelCandidate>['evidence'];unconfirmed:string[];links:z.infer<typeof modelCandidate>['links']};
export type Draft={id:string;expires_at:string;candidates:Candidate[];source_url:string|null;overflow:boolean};
export function reviewCandidates(result:z.infer<typeof modelResult>,text:string):Candidate[]{
 return result.candidates.flatMap(raw=>{
  const evidence=raw.evidence.filter(e=>text.includes(e.quote));
  if(!evidence.some(e=>e.field==='name'&&e.quote.includes(raw.name)))return [];
  const project={...blankProject};const unconfirmed:string[]=[];
  for(const field of fields){
   if(raw[field]!==null&&evidence.some(e=>e.field===field))Object.assign(project,{[field]:raw[field]});
   else unconfirmed.push(field);
  }
  // Do not invent a complementary status, reason or deadline when the source is incomplete.
  if((project.lifecycle_status==='COMPLETED')!==(project.workflow_stage==='CLOSED')){project.lifecycle_status='IDEA';project.workflow_stage='DISCOVERY';unconfirmed.push('lifecycle_status','workflow_stage');}
  if(!project.next_action)project.next_action_due_on=null;
  if(project.coordination_state!=='CLEAR'&&!project.coordination_note){project.coordination_state='CLEAR';unconfirmed.push('coordination_state');}
  return [{candidate_id:crypto.randomUUID(),project,evidence,unconfirmed:[...new Set(unconfirmed)],links:raw.links.filter(l=>text.includes(l.url))}];
 });
}
export const confirmationInput=z.object({draft_id:z.uuid(),keep_source:z.boolean(),candidates:z.array(z.object({candidate_id:z.uuid(),project:projectInput}).strict()).min(1).max(10)}).strict().refine(v=>new Set(v.candidates.map(c=>c.candidate_id)).size===v.candidates.length);
