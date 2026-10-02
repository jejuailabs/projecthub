import {z} from 'zod';
import {session} from '@/lib/session';
import {apiError,HttpError,requestBody} from '@/lib/http';
import {planInput} from '@/modules/planning/domain';
export async function GET(){try{
 const s=await session();if(!s)throw new HttpError(401,'unauthorized');
 const items=[];
 for(let page=0;;page++){const r=await s.db.from('project_plan_items').select('*').eq('workspace_id',s.workspace).is('deleted_at',null).order('id').range(page*1000,page*1000+999);if(r.error)throw new HttpError(500,'serverError');items.push(...r.data);if(r.data.length<1000)break;if(page>=49)throw new HttpError(413,'tooLarge');}
 return Response.json({items},{headers:{'Cache-Control':'no-store'}});
}catch(e){return apiError(e);}}
export async function POST(request:Request){try{
 const parsed=z.object({project_id:z.uuid(),id:z.uuid(),version:z.number().int().nonnegative(),item:planInput,remove:z.boolean().default(false)}).strict().safeParse(await requestBody(request));if(!parsed.success)throw new HttpError(400,'validation');
 const s=await session();if(!s)throw new HttpError(401,'unauthorized');const v=parsed.data;
 const result=await s.db.rpc('save_plan_item',{p_workspace:s.workspace,p_project:v.project_id,p_id:v.id,p_version:v.version,p_data:v.item,p_remove:v.remove});
 if(result.error)throw new HttpError(result.error.code==='40001'?409:result.error.code==='42501'?403:400,result.error.code==='40001'?'conflict':'saveFailed');
 const items=[];
 for(let page=0;;page++){const r=await s.db.from('project_plan_items').select('*').eq('workspace_id',s.workspace).eq('project_id',v.project_id).is('deleted_at',null).order('id').range(page*1000,page*1000+999);if(r.error)throw new HttpError(500,'serverError');items.push(...r.data);if(r.data.length<1000)break;if(page>=49)throw new HttpError(413,'tooLarge');}
 const project=await s.db.from('projects').select('*,project_sources(*)').eq('workspace_id',s.workspace).eq('id',v.project_id).single();
 if(project.error)throw new HttpError(500,'serverError');return Response.json({items,project:project.data},{headers:{'Cache-Control':'no-store'}});
}catch(e){return apiError(e);}}
