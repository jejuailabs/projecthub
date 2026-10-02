import {z} from 'zod';
import {session} from '@/lib/session';
import {apiError,HttpError,requestBody} from '@/lib/http';
import {materialInput} from '@/modules/materials/domain';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){try{
 const {id}=await context.params;const s=await session();if(!s)throw new HttpError(401,'unauthorized');
 const {data:m,error}=await s.db.from('project_materials').select('*').eq('id',id).eq('workspace_id',s.workspace).eq('ready',true).single();
 if(error||!m)throw new HttpError(404,'notFound');
 const revisions=await s.db.from('material_revisions').select('*').eq('material_id',id).order('version',{ascending:false}).limit(100);
 if(revisions.error)throw new HttpError(500,'serverError');
 let url=null;if(m.storage_path){const signed=await s.db.storage.from('project-materials').createSignedUrl(m.storage_path,60,{download:m.file_name});if(signed.error)throw new HttpError(500,'serverError');url=signed.data.signedUrl;}
 return Response.json({material:m,revisions:revisions.data,url},{headers:{'Cache-Control':'no-store'}});
}catch(e){return apiError(e);}}
export async function PATCH(request:Request,context:Context){try{
 const {id}=await context.params;const input=z.object({version:z.number().int().positive(),material:materialInput.optional(),ready:z.literal(true).optional()}).strict().refine(v=>v.material||v.ready).safeParse(await requestBody(request));
 if(!input.success)throw new HttpError(400,'validation');const s=await session();if(!s)throw new HttpError(401,'unauthorized');
 const result=await s.db.from('project_materials').update({...input.data.material,...(input.data.ready?{ready:true}:{})}).eq('id',id).eq('workspace_id',s.workspace).eq('version',input.data.version).select().maybeSingle();
 if(result.error)throw new HttpError(400,'saveFailed');if(!result.data)throw new HttpError(409,'conflict');return Response.json({material:result.data});
}catch(e){return apiError(e);}}
