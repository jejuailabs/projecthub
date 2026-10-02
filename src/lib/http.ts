import {ZodError} from 'zod';
export class HttpError extends Error {constructor(public status:number,message:string){super(message);}}
export async function requestBody(request:Request,maxBytes=100000):Promise<unknown>{
 const origin=request.headers.get('origin');
 if((origin&&origin!==new URL(request.url).origin)||request.headers.get('sec-fetch-site')==='cross-site')throw new HttpError(403,'forbidden');
 if(!request.headers.get('content-type')?.includes('application/json'))throw new HttpError(415,'validation');
 const reader=request.body?.getReader();if(!reader)throw new HttpError(400,'validation');
 let bytes=0;const chunks:Uint8Array[]=[];
 try{for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.length;if(bytes>maxBytes){await reader.cancel();throw new HttpError(413,'tooLarge');}chunks.push(value);}}finally{reader.releaseLock();}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new HttpError(400,'validation');}
}
export function apiError(error:unknown){if(error instanceof ZodError)error=new HttpError(400,'validation');return Response.json({error:error instanceof HttpError?error.message:'serverError'},{status:error instanceof HttpError?error.status:500,headers:{'Cache-Control':'no-store'}});}
