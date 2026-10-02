import {z} from 'zod';
import {session} from '@/lib/session';
import {apiError,HttpError,requestBody} from '@/lib/http';
export async function POST(request:Request){try{
 const input=z.object({draft_id:z.uuid()}).strict().safeParse(await requestBody(request));if(!input.success)throw new HttpError(400,'validation');
 const s=await session();if(!s)throw new HttpError(401,'unauthorized');
 const {error}=await s.db.from('text_drafts').delete().eq('id',input.data.draft_id).eq('workspace_id',s.workspace).eq('user_id',s.user.id).is('confirmed_ids',null);
 if(error)throw new HttpError(500,'serverError');return Response.json({ok:true});
}catch(e){return apiError(e);}}
