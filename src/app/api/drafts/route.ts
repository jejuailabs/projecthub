import {session} from '@/lib/session';
import {apiError,HttpError,requestBody} from '@/lib/http';
import {seal} from '@/lib/encryption';
import {extractionInput} from '@/modules/drafts/domain';
import {extract,extractionReady} from '@/modules/drafts/extract';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET(){return Response.json({available:extractionReady()},{headers:{'Cache-Control':'no-store'}});}
export async function POST(request:Request){
 try{
  const input=extractionInput.safeParse(await requestBody(request));if(!input.success)throw new HttpError(400,'validation');
  const s=await session();if(!s)throw new HttpError(401,'unauthorized');
  if(!extractionReady())throw new HttpError(503,'extractionUnavailable');
  const quota=await s.db.rpc('reserve_extraction',{p_workspace:s.workspace});
  if(quota.error)throw new HttpError(403,'forbidden');if(!quota.data)throw new HttpError(429,'extractionLimit');
  const workspace=await s.db.from('workspaces').select('timezone').eq('id',s.workspace).single();
  if(workspace.error)throw new HttpError(500,'serverError');
  const result=await extract(input.data,workspace.data.timezone);
  const id=crypto.randomUUID();const draft={id,...result,source_url:input.data.source_url};
  const {data,error}=await s.db.from('text_drafts').insert({id,workspace_id:s.workspace,ciphertext:seal(draft,`${s.workspace}:${s.user.id}:${id}`),candidate_ids:result.candidates.map(c=>c.candidate_id)}).select('expires_at').single();
  if(error)throw new HttpError(500,'saveFailed');
  return Response.json({...draft,expires_at:data.expires_at},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return apiError(e);}
}
