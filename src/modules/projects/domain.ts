import {z} from 'zod';
export const statuses=['IDEA','BUILDING','LIVE','PAUSED','COMPLETED'] as const;
export const stages=['DISCOVERY','PLANNING','DESIGN','EXECUTION','REVIEW','RELEASE','OPERATIONS','CLOSED'] as const;
export const coordinations=['CLEAR','WAITING','BLOCKED'] as const;
const date=z.union([z.literal(''),z.iso.date()]).nullable().transform(v=>v||null);
export const projectInput=z.object({
 name:z.string().trim().min(1).max(120),description:z.string().max(2000),
 lifecycle_status:z.enum(statuses),workflow_stage:z.enum(stages),
 owner_label:z.string().trim().max(100),next_action:z.string().trim().max(300),
 next_action_due_on:date,start_date:date.optional(),target_date:date,coordination_state:z.enum(coordinations),coordination_note:z.string().trim().max(500)
}).strict().superRefine((p,ctx)=>{
 if((p.lifecycle_status==='COMPLETED')!==(p.workflow_stage==='CLOSED'))ctx.addIssue({code:'custom',path:['workflow_stage'],message:'closedPair'});
 if(p.coordination_state!=='CLEAR'&&!p.coordination_note)ctx.addIssue({code:'custom',path:['coordination_note'],message:'reasonRequired'});
 if(!p.next_action&&p.next_action_due_on)ctx.addIssue({code:'custom',path:['next_action_due_on'],message:'actionRequired'});
 if(p.start_date&&p.target_date&&p.start_date>p.target_date)ctx.addIssue({code:'custom',path:['start_date'],message:'dateOrder'});
});
export type ProjectInput=z.output<typeof projectInput>;
export type Source={id:string;external_name:string;canonical_url:string;role:string};
export type Project=ProjectInput & {id:string;workspace_id:string;version:number;confirmed_at:string;last_activity_at:string;created_at:string;archived_at:string|null;deleted_at:string|null;project_sources:Source[]};
export const blankProject:ProjectInput={name:'',description:'',lifecycle_status:'IDEA',workflow_stage:'DISCOVERY',owner_label:'',next_action:'',next_action_due_on:null,start_date:null,target_date:null,coordination_state:'CLEAR',coordination_note:''};
export type Flag='BLOCKED'|'OVERDUE'|'WAITING'|'DUE_SOON'|'NEEDS_INFO';
export function dateInZone(now:Date,timezone:string){return new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function attention(p:ProjectInput & {archived_at?:string|null;deleted_at?:string|null},today:string):Flag[]{
 if(p.archived_at||p.deleted_at||['PAUSED','COMPLETED'].includes(p.lifecycle_status))return [];
 const flags:Flag[]=[]; const dates=[p.target_date,p.next_action?p.next_action_due_on:null].filter((d):d is string=>!!d);
 const soon=new Date(`${today}T00:00:00Z`);soon.setUTCDate(soon.getUTCDate()+3);
 if(p.coordination_state==='BLOCKED')flags.push('BLOCKED');
 if(dates.some(d=>d<today))flags.push('OVERDUE');
 if(p.coordination_state==='WAITING')flags.push('WAITING');
 if(dates.some(d=>d>=today&&d<=soon.toISOString().slice(0,10)))flags.push('DUE_SOON');
 if(['BUILDING','LIVE'].includes(p.lifecycle_status)&&(!p.owner_label||!p.next_action))flags.push('NEEDS_INFO');
 return flags;
}
export function freshness(confirmedAt:string|null,now:Date){if(!confirmedAt)return 'UNKNOWN';return now.getTime()-new Date(confirmedAt).getTime()>7*86400000?'STALE':'FRESH';}
export const sourceInput=z.object({project_id:z.uuid(),external_name:z.string().trim().min(1).max(120),canonical_url:z.url().max(2048).refine(v=>['https:','http:'].includes(new URL(v).protocol)),role:z.enum(['PLANNING','DESIGN','EXECUTION','DEPLOYMENT','OTHER'])}).strict();
