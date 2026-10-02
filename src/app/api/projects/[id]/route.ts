import {session} from '@/lib/session';
import {projectInput} from '@/modules/projects/domain';
import {z} from 'zod';
const change=z.discriminatedUnion('type',[
 z.object({type:z.literal('edit'),version:z.number().int().positive(),project:projectInput}).strict(),
 z.object({type:z.enum(['archive','trash','restore','completeAction']),version:z.number().int().positive()}).strict()
]);
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
 const s=await session();if(!s)return Response.json({error:'unauthorized'},{status:401});
 const {id}=await params;if(!z.uuid().safeParse(id).success)return Response.json({error:'validation'},{status:400});
 const parsed=change.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return Response.json({error:'validation'},{status:400});
 const c=parsed.data;
 const patch=c.type==='edit'?c.project:c.type==='archive'?{archived_at:new Date().toISOString()}:c.type==='trash'?{deleted_at:new Date().toISOString()}:c.type==='restore'?{archived_at:null,deleted_at:null}:{next_action:'',next_action_due_on:null};
 const {data,error}=await s.db.from('projects').update(patch).eq('workspace_id',s.workspace).eq('id',id).eq('version',c.version).select('*,project_sources(*)').maybeSingle();
 if(error)return Response.json({error:'saveFailed'},{status:400});
 if(!data)return Response.json({error:'conflict'},{status:409});
 return Response.json({project:data});
}