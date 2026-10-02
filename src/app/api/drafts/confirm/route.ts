import {session} from '@/lib/session';
import {apiError,HttpError,requestBody} from '@/lib/http';
import {unseal} from '@/lib/encryption';
import {confirmationInput,type Draft} from '@/modules/drafts/domain';
export async function POST(request:Request){
 try{
  const parsed=confirmationInput.safeParse(await requestBody(request));if(!parsed.success)throw new HttpError(400,'validation');
  const s=await session();if(!s)throw new HttpError(401,'unauthorized');
  const {data:d,error}=await s.db.from('text_drafts').select('*').eq('id',parsed.data.draft_id).eq('workspace_id',s.workspace).eq('user_id',s.user.id).single();
  if(error||!d)throw new HttpError(404,'draftMissing');
  // Confirmation receipts retain no candidate text; source is supplied by the
  // client only on replay and its hash must match the original transaction.
  let source:string|null=null;
  if(d.ciphertext){
   if(new Date(d.expires_at).getTime()<=Date.now())throw new HttpError(410,'draftExpired');
   const draft=unseal<Draft>(d.ciphertext,`${s.workspace}:${s.user.id}:${d.id}`);
   if(parsed.data.candidates.some(c=>!draft.candidates.some(x=>x.candidate_id===c.candidate_id)))throw new HttpError(400,'validation');
   source=parsed.data.keep_source?draft.source_url:null;
  }else if(d.confirmed_ids){
   // A response-lost retry is a read of the already committed result, never a new write.
   const {data:projects,error:readError}=await s.db.from('projects').select('*,project_sources(*)').in('id',d.confirmed_ids).eq('workspace_id',s.workspace);
   if(readError)throw new HttpError(500,'serverError');
   return Response.json({projects},{headers:{'Cache-Control':'no-store'}});
  }else throw new HttpError(410,'draftExpired');
  const result=await s.db.rpc('confirm_text_draft',{p_workspace:s.workspace,p_draft:d.id,p_candidates:parsed.data.candidates,p_source_url:source});
  if(result.error)throw new HttpError(result.error.code==='23505'?409:400,'saveFailed');
  const ids=result.data.map((p:{id:string})=>p.id);
  const loaded=await s.db.from('projects').select('*,project_sources(*)').eq('workspace_id',s.workspace).in('id',ids);
  if(loaded.error)throw new HttpError(500,'serverError');
  return Response.json({projects:loaded.data},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return apiError(e);}
}
