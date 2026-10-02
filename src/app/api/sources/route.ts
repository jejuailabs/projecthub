import {session} from '@/lib/session';
import {sourceInput} from '@/modules/projects/domain';
export async function POST(request:Request){
 const s=await session();if(!s)return Response.json({error:'unauthorized'},{status:401});
 const parsed=sourceInput.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return Response.json({error:'validation'},{status:400});
 const {data,error}=await s.db.from('project_sources').insert({...parsed.data,workspace_id:s.workspace}).select().single();
 if(error)return Response.json({error:error.code==='23505'?'duplicateLink':'saveFailed'},{status:400});
 return Response.json({source:data},{status:201});
}