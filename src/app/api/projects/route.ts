import {session} from '@/lib/session';
import {projectInput} from '@/modules/projects/domain';
import {z} from 'zod';
export async function POST(request:Request){
 const s=await session();if(!s)return Response.json({error:'unauthorized'},{status:401});
 const body=await request.json().catch(()=>null);
 const parsed=z.object({request_id:z.uuid(),project:projectInput}).strict().safeParse(body);
 if(!parsed.success)return Response.json({error:'validation'},{status:400});
 const {data,error}=await s.db.rpc('create_project',{p_workspace:s.workspace,p_request_id:parsed.data.request_id,p_data:parsed.data.project});
 if(error)return Response.json({error:error.code==='23505'?'conflict':'saveFailed'},{status:error.code==='23505'?409:400});
 return Response.json({project:{...data,project_sources:[]}},{status:201});
}