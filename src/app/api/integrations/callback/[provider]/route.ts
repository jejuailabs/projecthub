import {cookies} from 'next/headers';
import {NextResponse} from 'next/server';
import {seal,unseal} from '@/lib/encryption';
import {providers,vercelCompletionUrl,type Provider} from '@/modules/integrations/domain';
import {exchange} from '@/modules/integrations/providers';
import {requireSession,credentialContext,dbError} from '@/modules/integrations/server';
export async function GET(request:Request,{params}:{params:Promise<{provider:string}>}){
 const url=new URL(request.url);let locale='ko';const raw=(await params).provider;const provider=raw.toUpperCase() as Provider;const jar=await cookies();const name=`hub-connect-${raw}`;
 try{
  if(!providers.includes(provider))throw new Error();const value=jar.get(name)?.value;jar.delete(name);if(!value)throw new Error();
  const state=unseal<{provider:Provider;label:string;locale:string;state:string;verifier:string;redirect:string;user:string;workspace:string;expires:number}>(value,'integration-oauth');locale=state.locale==='en'?'en':'ko';
  if(state.expires<Date.now()||state.provider!==provider||state.state!==url.searchParams.get('state')||!url.searchParams.get('code')||url.searchParams.has('error'))throw new Error();
  const s=await requireSession();if(s.user.id!==state.user||s.workspace!==state.workspace)throw new Error();
  const result=await exchange(provider,url.searchParams.get('code')!,state.redirect,state.verifier);
  const ciphertext=seal(result.credentials,credentialContext({workspace_id:s.workspace,owner_user_id:s.user.id,provider,account_id:result.accountId,scope_id:result.scopeId}));
  const r=await s.db.rpc('save_integration',{w:s.workspace,p_provider:provider,p_account:result.accountId,p_scope:result.scopeId,p_label:state.label,p_account_label:result.accountLabel,p_scope_label:result.scopeLabel,p_ciphertext:ciphertext});dbError(r.error);
  const completion=provider==='VERCEL'?vercelCompletionUrl(url.searchParams.get('next')):null;
  return NextResponse.redirect(completion??new URL(`/${locale}/dashboard?section=integrations&connection=success`,url.origin));
 }catch{return NextResponse.redirect(new URL(`/${locale}/dashboard?section=integrations&connection=failed`,url.origin));}
}
