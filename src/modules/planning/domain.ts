import {z} from 'zod';
import type {Project} from '@/modules/projects/domain';
export const planInput=z.object({kind:z.enum(['TODO','MILESTONE']),title:z.string().trim().min(1).max(300),due_on:z.iso.date().nullable(),done:z.boolean(),is_next:z.boolean()}).strict().superRefine((v,c)=>{
 if(v.kind==='MILESTONE'&&!v.due_on)c.addIssue({code:'custom',path:['due_on'],message:'dateRequired'});
 if(v.is_next&&(v.kind!=='TODO'||v.done))c.addIssue({code:'custom',path:['is_next'],message:'invalidNext'});
});
export type PlanInput=z.infer<typeof planInput>;
export type PlanItem=PlanInput&{id:string;project_id:string;workspace_id:string;version:number;created_at:string;updated_at:string;deleted_at:string|null};
export type CalendarEntry={id:string;project_id:string;title:string;date:string;kind:'START'|'TARGET'|'TODO'|'MILESTONE';done:boolean};
export function calendarEntries(projects:Project[],items:PlanItem[]):CalendarEntry[]{
 const active=projects.filter(p=>!p.archived_at&&!p.deleted_at);const ids=new Set(active.map(p=>p.id));
 return [...active.flatMap(p=>[...(p.start_date?[{id:`start-${p.id}`,project_id:p.id,title:p.name,date:p.start_date,kind:'START' as const,done:false}]:[]),...(p.target_date?[{id:`target-${p.id}`,project_id:p.id,title:p.name,date:p.target_date,kind:'TARGET' as const,done:p.lifecycle_status==='COMPLETED'}]:[])]),...items.filter(i=>ids.has(i.project_id)&&!i.deleted_at&&i.due_on).map(i=>({id:i.id,project_id:i.project_id,title:i.title,date:i.due_on!,kind:i.kind,done:i.done}))].sort((a,b)=>a.date.localeCompare(b.date)||a.title.localeCompare(b.title));
}
export function monthDays(month:string){const [year,m]=month.split('-').map(Number);const first=new Date(Date.UTC(year,m-1,1));const start=new Date(first);start.setUTCDate(1-first.getUTCDay());return Array.from({length:42},(_,i)=>{const d=new Date(start);d.setUTCDate(d.getUTCDate()+i);return d.toISOString().slice(0,10);});}
export function moveMonth(month:string,delta:number){const [y,m]=month.split('-').map(Number);return new Date(Date.UTC(y,m-1+delta,1)).toISOString().slice(0,7);}
export function todoMatches(item:PlanItem,filter:string,today:string){if(item.kind!=='TODO'||item.deleted_at)return false;if(filter==='done')return item.done;if(item.done)return false;return filter==='today'?item.due_on===today:filter==='overdue'?!!item.due_on&&item.due_on<today:filter==='upcoming'?!!item.due_on&&item.due_on>today:filter==='undated'?!item.due_on:true;}
export function syncDemoNext(items:PlanItem[],p:Project):PlanItem[]{
 const current=items.find(i=>i.project_id===p.id&&i.is_next&&!i.deleted_at);const at=new Date().toISOString();
 if(!p.next_action)return items.map(i=>i.id===current?.id?{...i,is_next:false,done:true,version:i.version+1,updated_at:at}:i);
 if(current)return items.map(i=>i.id===current.id&& (i.title!==p.next_action||i.due_on!==p.next_action_due_on)?{...i,title:p.next_action,due_on:p.next_action_due_on,version:i.version+1,updated_at:at}:i);
 let sequence=items.filter(i=>i.project_id===p.id).length;while(items.some(i=>i.id===`next-${p.id}-${sequence}`))sequence++;
 return [...items,{id:`next-${p.id}-${sequence}`,project_id:p.id,workspace_id:p.workspace_id,kind:'TODO',title:p.next_action,due_on:p.next_action_due_on,done:false,is_next:true,version:1,created_at:at,updated_at:at,deleted_at:null}];
}
