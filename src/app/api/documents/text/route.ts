import {session} from '@/lib/session';
import {apiError,HttpError} from '@/lib/http';
export const runtime='nodejs';
export const maxDuration=30;
export async function POST(request:Request){try{
 const origin=request.headers.get('origin');if((origin&&origin!==new URL(request.url).origin)||request.headers.get('sec-fetch-site')==='cross-site')throw new HttpError(403,'forbidden');
 const s=await session();if(!s)throw new HttpError(401,'unauthorized');
 const quota=await s.db.rpc('reserve_extraction',{p_workspace:s.workspace});if(quota.error||!quota.data)throw new HttpError(429,'extractionLimit');
 const reader=request.body?.getReader();if(!reader)throw new HttpError(400,'validation');let size=0;const chunks:Uint8Array[]=[];
 try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>4*1024*1024+16384){await reader.cancel();throw new HttpError(413,'tooLarge');}chunks.push(value);}}finally{reader.releaseLock();}
 const form=await new Response(Buffer.concat(chunks),{headers:{'Content-Type':request.headers.get('content-type')??''}}).formData();
 const file=form.get('file');if(!(file instanceof File)||file.size>4*1024*1024)throw new HttpError(400,'validation');
 const {documentText}=await import('@/modules/materials/document-text');
 const text=await documentText(file.name,Buffer.from(await file.arrayBuffer()));
 return Response.json({text},{headers:{'Cache-Control':'no-store'}});
}catch(e){return apiError(e);}}
