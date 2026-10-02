import {z} from 'zod';
import {session} from '@/lib/session';
import {apiError,HttpError,requestBody} from '@/lib/http';
import {fileInput,materialInput} from '@/modules/materials/domain';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){try{
 const {id}=await context.params;const s=await session();if(!s)throw new HttpError(401,'unauthorized');
 const result=await s.db.from('project_materials').select('*').eq('workspace_id',s.workspace).eq('project_id',id).eq('ready',true).order('created_at',{ascending:false});
 if(result.error)throw new HttpError(500,'serverError');return Response.json({materials:result.data},{headers:{'Cache-Control':'no-store'}});
}catch(e){return apiError(e);}}
export async function POST(request:Request,context:Context){try{
 const {id}=await context.params;const parsed=z.object({material:materialInput,file:fileInput.nullable(),id:z.uuid()}).strict().safeParse(await requestBody(request));
 if(!parsed.success||!z.uuid().safeParse(id).success)throw new HttpError(400,'validation');
 const s=await session();if(!s)throw new HttpError(401,'unauthorized');const {material,file,id:materialId}=parsed.data;
 const data={...material,id:materialId,project_id:id,workspace_id:s.workspace,...(file?{file_name:file.name,mime_type:file.type||'application/octet-stream',byte_size:file.size,storage_path:`${s.workspace}/${id}/${materialId}`,ready:false}:{})};
 const result=await s.db.from('project_materials').insert(data).select().single();
 if(result.error)throw new HttpError(400,'saveFailed');return Response.json({material:result.data});
}catch(e){return apiError(e);}}
