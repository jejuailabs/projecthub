import {randomBytes,createHash} from 'node:crypto';
import {cookies} from 'next/headers';
import {z} from 'zod';
import {apiError,requestBody,HttpError} from '@/lib/http';
import {seal} from '@/lib/encryption';
import {requireSession} from '@/modules/integrations/server';
import {providers} from '@/modules/integrations/domain';
import {authorizationUrl} from '@/modules/integrations/providers';
export async function POST(request:Request){try{
 const v=z.object({provider:z.enum(providers),label:z.string().trim().min(1).max(160),locale:z.enum(['ko','en'])}).strict().parse(await requestBody(request));const s=await requireSession();
 const origin=new URL(process.env.NEXT_PUBLIC_APP_URL??'').origin;if(new URL(request.url).origin!==origin)throw new HttpError(400,'appUrlMismatch');
 const redirect=`${origin}/api/integrations/callback/${v.provider.toLowerCase()}`;const state=randomBytes(32).toString('base64url'),verifier=randomBytes(32).toString('base64url');
 const url=authorizationUrl(v.provider,redirect,state,createHash('sha256').update(verifier).digest('base64url'));
 (await cookies()).set(`hub-connect-${v.provider.toLowerCase()}`,seal({...v,state,verifier,redirect,user:s.user.id,workspace:s.workspace,expires:Date.now()+10*60*1000},'integration-oauth'),{httpOnly:true,secure:origin.startsWith('https:'),sameSite:'lax',path:'/api/integrations',maxAge:600});
 return Response.json({url},{headers:{'Cache-Control':'no-store'}});
}catch(e){return apiError(e);}}
